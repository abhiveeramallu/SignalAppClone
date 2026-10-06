import asyncio

from app.models import Message, MessageStatus
from app.services.message_service import update_message_status
from tests.helpers import auth_headers, register_and_login
from tests.ws_live_helpers import recv_event, send_event, ws_connect_authenticated


def _create_direct_conversation(client, token, other_user_id):
    resp = client.post("/conversations/direct", json={"user_id": other_user_id}, headers=auth_headers(token))
    assert resp.status_code in (200, 201)
    return resp.json()


def _create_group(client, token, name, member_ids):
    resp = client.post(
        "/conversations/group", json={"name": name, "member_ids": member_ids}, headers=auth_headers(token)
    )
    assert resp.status_code == 201
    return resp.json()


def _authenticate_ws(ws, token):
    ws.send_json({"type": "authenticate", "token": token})
    return ws.receive_json()


def _status_row(client, message_id, user_id):
    db = client.db_sessionmaker()
    try:
        return (
            db.query(MessageStatus)
            .filter(MessageStatus.message_id == message_id, MessageStatus.user_id == user_id)
            .first()
        )
    finally:
        db.close()


# --- delivery: single-connection / DB-only, safe on the plain TestClient ---


def test_new_message_status_starts_sent(client):
    alice, alice_token = register_and_login(client, "alice")
    bob, _ = register_and_login(client, "bob")
    convo = _create_direct_conversation(client, alice_token, bob["id"])

    with client.websocket_connect("/ws") as alice_ws:
        _authenticate_ws(alice_ws, alice_token)
        alice_ws.send_json({"type": "send_message", "conversation_id": convo["id"], "content": "hi"})
        event = alice_ws.receive_json()

    row = _status_row(client, event["message"]["id"], bob["id"])
    assert row.status == "sent"


def test_offline_recipient_remains_sent(client):
    alice, alice_token = register_and_login(client, "alice")
    bob, _ = register_and_login(client, "bob")  # never connects
    convo = _create_direct_conversation(client, alice_token, bob["id"])

    with client.websocket_connect("/ws") as alice_ws:
        _authenticate_ws(alice_ws, alice_token)
        alice_ws.send_json({"type": "send_message", "conversation_id": convo["id"], "content": "hi"})
        message_id = alice_ws.receive_json()["message"]["id"]

    row = _status_row(client, message_id, bob["id"])
    assert row.status == "sent"


def test_message_delivered_for_own_message_is_noop(client):
    alice, alice_token = register_and_login(client, "alice")
    bob, _ = register_and_login(client, "bob")
    convo = _create_direct_conversation(client, alice_token, bob["id"])

    with client.websocket_connect("/ws") as alice_ws:
        _authenticate_ws(alice_ws, alice_token)
        alice_ws.send_json({"type": "send_message", "conversation_id": convo["id"], "content": "hi"})
        message_id = alice_ws.receive_json()["message"]["id"]
        alice_ws.send_json({"type": "message_delivered", "message_id": message_id})
        # Same-connection self-probe (not a cross-task push) — safe on TestClient.
        alice_ws.send_json({"type": "fly_to_the_moon"})
        resp = alice_ws.receive_json()
        assert resp["code"] == "UNKNOWN_EVENT_TYPE"


def test_message_delivered_for_nonexistent_message(client):
    _, alice_token = register_and_login(client, "alice")
    with client.websocket_connect("/ws") as ws:
        _authenticate_ws(ws, alice_token)
        ws.send_json({"type": "message_delivered", "message_id": 999999})
        resp = ws.receive_json()
        assert resp["type"] == "error"
        assert resp["code"] == "INVALID_MESSAGE"


# --- delivery: needs to observe a push triggered from ANOTHER connection's
# own event-handling task. Starlette's TestClient synchronous-to-async bridge
# reproducibly deadlocks on exactly this pattern (confirmed with a standalone
# reproduction against both TestClient and a real server) — these use the
# live_ws_url fixture (a real uvicorn server) instead. See conftest.py.


def test_message_delivered_marks_recipient_delivered(client, live_ws_url):
    alice, alice_token = register_and_login(client, "alice")
    bob, bob_token = register_and_login(client, "bob")
    convo = _create_direct_conversation(client, alice_token, bob["id"])

    async def body():
        alice_ws = await ws_connect_authenticated(live_ws_url, alice_token)
        bob_ws = await ws_connect_authenticated(live_ws_url, bob_token)
        try:
            await send_event(alice_ws, {"type": "send_message", "conversation_id": convo["id"], "content": "hi"})
            await recv_event(alice_ws)
            message_id = (await recv_event(bob_ws))["message"]["id"]

            await send_event(bob_ws, {"type": "message_delivered", "message_id": message_id})
            status_event = await recv_event(alice_ws)
            assert status_event == {
                "type": "message_status",
                "message_id": message_id,
                "conversation_id": convo["id"],
                "user_id": bob["id"],
                "status": "delivered",
            }
            return message_id
        finally:
            await alice_ws.close()
            await bob_ws.close()

    message_id = asyncio.run(body())
    assert _status_row(client, message_id, bob["id"]).status == "delivered"


def test_sender_resolves_delivered_via_rest(client, live_ws_url):
    alice, alice_token = register_and_login(client, "alice")
    bob, bob_token = register_and_login(client, "bob")
    convo = _create_direct_conversation(client, alice_token, bob["id"])

    async def body():
        alice_ws = await ws_connect_authenticated(live_ws_url, alice_token)
        bob_ws = await ws_connect_authenticated(live_ws_url, bob_token)
        try:
            await send_event(alice_ws, {"type": "send_message", "conversation_id": convo["id"], "content": "hi"})
            await recv_event(alice_ws)
            message_id = (await recv_event(bob_ws))["message"]["id"]
            await send_event(bob_ws, {"type": "message_delivered", "message_id": message_id})
            await recv_event(alice_ws)  # wait for the push so the DB write has landed
            return message_id
        finally:
            await alice_ws.close()
            await bob_ws.close()

    message_id = asyncio.run(body())
    history = client.get(f"/conversations/{convo['id']}/messages", headers=auth_headers(alice_token))
    sent_message = next(m for m in history.json()["messages"] if m["id"] == message_id)
    assert sent_message["status"] == "delivered"


def test_group_recipient_statuses_are_independent(client, live_ws_url):
    alice, alice_token = register_and_login(client, "alice")
    bob, bob_token = register_and_login(client, "bob")
    carol, carol_token = register_and_login(client, "carol")
    dave, _ = register_and_login(client, "dave")  # stays offline
    group = _create_group(client, alice_token, "Trio+Dave", [bob["id"], carol["id"], dave["id"]])

    async def body():
        alice_ws = await ws_connect_authenticated(live_ws_url, alice_token)
        bob_ws = await ws_connect_authenticated(live_ws_url, bob_token)
        carol_ws = await ws_connect_authenticated(live_ws_url, carol_token)
        try:
            await send_event(alice_ws, {"type": "send_message", "conversation_id": group["id"], "content": "Meeting at 6"})
            await recv_event(alice_ws)
            message_id = (await recv_event(bob_ws))["message"]["id"]
            await recv_event(carol_ws)

            await send_event(bob_ws, {"type": "message_delivered", "message_id": message_id})
            await recv_event(alice_ws)
            await send_event(carol_ws, {"type": "message_delivered", "message_id": message_id})
            await recv_event(alice_ws)
            return message_id
        finally:
            await alice_ws.close()
            await bob_ws.close()
            await carol_ws.close()

    message_id = asyncio.run(body())
    assert _status_row(client, message_id, bob["id"]).status == "delivered"
    assert _status_row(client, message_id, carol["id"]).status == "delivered"
    assert _status_row(client, message_id, dave["id"]).status == "sent"


def test_live_delivery_push_carries_aggregate_not_raw_recipient_status(client, live_ws_url):
    """Regression test for the aggregate bug: alice must see 'sent' (not
    'delivered') while dave — a third group member — hasn't acked anything
    yet, even though bob just did. The push itself must carry this, not just
    the REST history (Part I/J: WS and REST must agree)."""
    alice, alice_token = register_and_login(client, "alice")
    bob, bob_token = register_and_login(client, "bob")
    carol, _ = register_and_login(client, "carol")  # stays offline
    dave, _ = register_and_login(client, "dave")  # stays offline
    group = _create_group(client, alice_token, "Trio+Dave", [bob["id"], carol["id"], dave["id"]])

    async def body():
        alice_ws = await ws_connect_authenticated(live_ws_url, alice_token)
        bob_ws = await ws_connect_authenticated(live_ws_url, bob_token)
        try:
            await send_event(alice_ws, {"type": "send_message", "conversation_id": group["id"], "content": "hi"})
            await recv_event(alice_ws)
            message_id = (await recv_event(bob_ws))["message"]["id"]

            await send_event(bob_ws, {"type": "message_delivered", "message_id": message_id})
            status_event = await recv_event(alice_ws)
            assert status_event["status"] == "sent", (
                "bob delivered, but carol/dave haven't -> aggregate must still be 'sent'"
            )
            return message_id
        finally:
            await alice_ws.close()
            await bob_ws.close()

    message_id = asyncio.run(body())
    assert _status_row(client, message_id, bob["id"]).status == "delivered"


# --- read ---


def test_non_member_cannot_mark_read(client):
    _, alice_token = register_and_login(client, "alice")
    bob, _ = register_and_login(client, "bob")
    _, carol_token = register_and_login(client, "carol")
    convo = _create_direct_conversation(client, alice_token, bob["id"])

    with client.websocket_connect("/ws") as carol_ws:
        _authenticate_ws(carol_ws, carol_token)
        carol_ws.send_json({"type": "mark_read", "conversation_id": convo["id"]})
        resp = carol_ws.receive_json()
        assert resp["type"] == "error"
        assert resp["code"] == "NOT_CONVERSATION_MEMBER"


def test_mark_read_transitions_sent_and_delivered_to_read(client, live_ws_url):
    alice, alice_token = register_and_login(client, "alice")
    bob, bob_token = register_and_login(client, "bob")
    convo = _create_direct_conversation(client, alice_token, bob["id"])

    async def body():
        alice_ws = await ws_connect_authenticated(live_ws_url, alice_token)
        bob_ws = await ws_connect_authenticated(live_ws_url, bob_token)
        try:
            await send_event(alice_ws, {"type": "send_message", "conversation_id": convo["id"], "content": "one"})
            await recv_event(alice_ws)
            msg1 = (await recv_event(bob_ws))["message"]["id"]
            await send_event(bob_ws, {"type": "message_delivered", "message_id": msg1})
            await recv_event(alice_ws)

            await send_event(alice_ws, {"type": "send_message", "conversation_id": convo["id"], "content": "two"})
            await recv_event(alice_ws)
            msg2 = (await recv_event(bob_ws))["message"]["id"]
            # msg2 never ack'd as delivered — still "sent" when mark_read hits it.

            await send_event(bob_ws, {"type": "mark_read", "conversation_id": convo["id"]})
            read_event = await recv_event(alice_ws)
            assert read_event["type"] == "messages_read"
            assert read_event["conversation_id"] == convo["id"]
            assert read_event["user_id"] == bob["id"]
            assert set(read_event["message_ids"]) == {msg1, msg2}
            return msg1, msg2
        finally:
            await alice_ws.close()
            await bob_ws.close()

    msg1, msg2 = asyncio.run(body())
    assert _status_row(client, msg1, bob["id"]).status == "read"  # delivered -> read
    assert _status_row(client, msg2, bob["id"]).status == "read"  # sent -> read directly


def test_already_read_messages_stay_read_and_are_not_re_sent(client, live_ws_url):
    _, alice_token = register_and_login(client, "alice")
    bob, bob_token = register_and_login(client, "bob")
    convo = _create_direct_conversation(client, alice_token, bob["id"])

    async def body():
        alice_ws = await ws_connect_authenticated(live_ws_url, alice_token)
        bob_ws = await ws_connect_authenticated(live_ws_url, bob_token)
        try:
            await send_event(alice_ws, {"type": "send_message", "conversation_id": convo["id"], "content": "hi"})
            await recv_event(alice_ws)
            await recv_event(bob_ws)

            await send_event(bob_ws, {"type": "mark_read", "conversation_id": convo["id"]})
            await recv_event(alice_ws)  # first messages_read

            # Marking read again with nothing new unread must not produce a
            # second messages_read. Prove it on bob's OWN connection (a
            # same-task self-probe, safe on either transport).
            await send_event(bob_ws, {"type": "mark_read", "conversation_id": convo["id"]})
            await send_event(bob_ws, {"type": "fly_to_the_moon"})
            resp = await recv_event(bob_ws)
            assert resp["code"] == "UNKNOWN_EVENT_TYPE"
        finally:
            await alice_ws.close()
            await bob_ws.close()

    asyncio.run(body())


def test_mark_read_ignores_injected_user_id(client, live_ws_url):
    alice, alice_token = register_and_login(client, "alice")
    bob, bob_token = register_and_login(client, "bob")
    convo = _create_direct_conversation(client, alice_token, bob["id"])

    async def body():
        alice_ws = await ws_connect_authenticated(live_ws_url, alice_token)
        bob_ws = await ws_connect_authenticated(live_ws_url, bob_token)
        try:
            await send_event(alice_ws, {"type": "send_message", "conversation_id": convo["id"], "content": "hi"})
            await recv_event(alice_ws)
            await recv_event(bob_ws)

            # Bob tries to mark read "as alice" — the event carries no
            # user_id the server even looks at; identity always comes from
            # the authenticated connection's own JWT.
            await send_event(
                bob_ws, {"type": "mark_read", "conversation_id": convo["id"], "user_id": alice["id"]}
            )
            read_event = await recv_event(alice_ws)
            assert read_event["user_id"] == bob["id"]
        finally:
            await alice_ws.close()
            await bob_ws.close()

    asyncio.run(body())


def test_read_cannot_become_delivered_via_delivery_ack(client, live_ws_url):
    alice, alice_token = register_and_login(client, "alice")
    bob, bob_token = register_and_login(client, "bob")
    convo = _create_direct_conversation(client, alice_token, bob["id"])

    async def body():
        alice_ws = await ws_connect_authenticated(live_ws_url, alice_token)
        bob_ws = await ws_connect_authenticated(live_ws_url, bob_token)
        try:
            await send_event(alice_ws, {"type": "send_message", "conversation_id": convo["id"], "content": "hi"})
            await recv_event(alice_ws)
            message_id = (await recv_event(bob_ws))["message"]["id"]

            await send_event(bob_ws, {"type": "mark_read", "conversation_id": convo["id"]})
            await recv_event(alice_ws)  # messages_read

            # Stale/incorrect client acks delivery AFTER already reading it —
            # update_message_status is a no-op (read already outranks
            # delivered), so no message_status push should follow. Prove it
            # via a same-task self-probe on alice's own connection.
            await send_event(bob_ws, {"type": "message_delivered", "message_id": message_id})
            await send_event(alice_ws, {"type": "fly_to_the_moon"})
            resp = await recv_event(alice_ws)
            assert resp["code"] == "UNKNOWN_EVENT_TYPE"
            return message_id
        finally:
            await alice_ws.close()
            await bob_ws.close()

    message_id = asyncio.run(body())
    assert _status_row(client, message_id, bob["id"]).status == "read"


# --- monotonic status: pure service-layer checks, no WebSocket involved ---


def test_update_message_status_rejects_downgrade_to_sent(client):
    alice, alice_token = register_and_login(client, "alice")
    bob, _ = register_and_login(client, "bob")
    convo = _create_direct_conversation(client, alice_token, bob["id"])
    msg = client.post(
        f"/conversations/{convo['id']}/messages", json={"content": "hi"}, headers=auth_headers(alice_token)
    ).json()

    db = client.db_sessionmaker()
    try:
        row = update_message_status(db, msg["id"], bob["id"], "read")
        assert row is not None and row.status == "read"

        downgraded = update_message_status(db, msg["id"], bob["id"], "delivered")
        assert downgraded is None

        still_read = (
            db.query(MessageStatus)
            .filter(MessageStatus.message_id == msg["id"], MessageStatus.user_id == bob["id"])
            .first()
        )
        assert still_read.status == "read"
    finally:
        db.close()


def test_update_message_status_rejects_delivered_to_sent(client):
    alice, alice_token = register_and_login(client, "alice")
    bob, _ = register_and_login(client, "bob")
    convo = _create_direct_conversation(client, alice_token, bob["id"])
    msg = client.post(
        f"/conversations/{convo['id']}/messages", json={"content": "hi"}, headers=auth_headers(alice_token)
    ).json()

    db = client.db_sessionmaker()
    try:
        update_message_status(db, msg["id"], bob["id"], "delivered")
        downgraded = update_message_status(db, msg["id"], bob["id"], "sent")
        assert downgraded is None
        row = (
            db.query(MessageStatus)
            .filter(MessageStatus.message_id == msg["id"], MessageStatus.user_id == bob["id"])
            .first()
        )
        assert row.status == "delivered"
    finally:
        db.close()


# --- group read independence ---


def test_group_read_is_independent_per_member(client, live_ws_url):
    alice, alice_token = register_and_login(client, "alice")
    bob, bob_token = register_and_login(client, "bob")
    carol, carol_token = register_and_login(client, "carol")
    group = _create_group(client, alice_token, "Trio", [bob["id"], carol["id"]])

    async def body():
        alice_ws = await ws_connect_authenticated(live_ws_url, alice_token)
        bob_ws = await ws_connect_authenticated(live_ws_url, bob_token)
        carol_ws = await ws_connect_authenticated(live_ws_url, carol_token)
        try:
            await send_event(alice_ws, {"type": "send_message", "conversation_id": group["id"], "content": "hi all"})
            await recv_event(alice_ws)
            message_id = (await recv_event(bob_ws))["message"]["id"]
            await recv_event(carol_ws)

            await send_event(bob_ws, {"type": "mark_read", "conversation_id": group["id"]})
            read_event = await recv_event(alice_ws)
            assert read_event["user_id"] == bob["id"]
            return message_id
        finally:
            await alice_ws.close()
            await bob_ws.close()
            await carol_ws.close()

    message_id = asyncio.run(body())
    assert _status_row(client, message_id, bob["id"]).status == "read"
    assert _status_row(client, message_id, carol["id"]).status == "sent"  # untouched by bob's read

    async def carol_reads():
        carol_ws = await ws_connect_authenticated(live_ws_url, carol_token)
        alice_ws = await ws_connect_authenticated(live_ws_url, alice_token)
        try:
            await send_event(carol_ws, {"type": "mark_read", "conversation_id": group["id"]})
            read_event = await recv_event(alice_ws)
            assert read_event["user_id"] == carol["id"]
        finally:
            await carol_ws.close()
            await alice_ws.close()

    asyncio.run(carol_reads())
    assert _status_row(client, message_id, bob["id"]).status == "read"
    assert _status_row(client, message_id, carol["id"]).status == "read"


def test_sender_aggregate_status_reflects_slowest_recipient(client, live_ws_url):
    alice, alice_token = register_and_login(client, "alice")
    bob, bob_token = register_and_login(client, "bob")
    carol, _ = register_and_login(client, "carol")  # never acks anything
    group = _create_group(client, alice_token, "Trio", [bob["id"], carol["id"]])

    async def body():
        alice_ws = await ws_connect_authenticated(live_ws_url, alice_token)
        bob_ws = await ws_connect_authenticated(live_ws_url, bob_token)
        try:
            await send_event(alice_ws, {"type": "send_message", "conversation_id": group["id"], "content": "hi"})
            await recv_event(alice_ws)
            message_id = (await recv_event(bob_ws))["message"]["id"]

            await send_event(bob_ws, {"type": "mark_read", "conversation_id": group["id"]})
            read_event = await recv_event(alice_ws)
            # Bob is "read", carol never touched it (still "sent") -> the
            # aggregate carried in the live push itself must be "sent", not
            # a blind "read" (the regression this test guards against).
            assert read_event["statuses"][str(message_id)] == "sent"
            return message_id
        finally:
            await alice_ws.close()
            await bob_ws.close()

    message_id = asyncio.run(body())

    # REST must agree with what the live push just said.
    history = client.get(f"/conversations/{group['id']}/messages", headers=auth_headers(alice_token))
    sent_message = next(m for m in history.json()["messages"] if m["id"] == message_id)
    assert sent_message["status"] == "sent"


# --- typing ---


def test_typing_start_reaches_other_member_not_sender(client, live_ws_url):
    alice, alice_token = register_and_login(client, "alice")
    bob, bob_token = register_and_login(client, "bob")
    convo = _create_direct_conversation(client, alice_token, bob["id"])

    async def body():
        alice_ws = await ws_connect_authenticated(live_ws_url, alice_token)
        bob_ws = await ws_connect_authenticated(live_ws_url, bob_token)
        try:
            await send_event(alice_ws, {"type": "typing_start", "conversation_id": convo["id"]})
            event = await recv_event(bob_ws)
            assert event["type"] == "typing"
            assert event["conversation_id"] == convo["id"]
            assert event["user"] == {"id": alice["id"], "display_name": "Alice"}
            assert event["is_typing"] is True
        finally:
            await alice_ws.close()
            await bob_ws.close()

    asyncio.run(body())


def test_typing_stop_reaches_other_member(client, live_ws_url):
    _, alice_token = register_and_login(client, "alice")
    bob, bob_token = register_and_login(client, "bob")
    convo = _create_direct_conversation(client, alice_token, bob["id"])

    async def body():
        alice_ws = await ws_connect_authenticated(live_ws_url, alice_token)
        bob_ws = await ws_connect_authenticated(live_ws_url, bob_token)
        try:
            await send_event(alice_ws, {"type": "typing_stop", "conversation_id": convo["id"]})
            event = await recv_event(bob_ws)
            assert event["type"] == "typing"
            assert event["is_typing"] is False
        finally:
            await alice_ws.close()
            await bob_ws.close()

    asyncio.run(body())


def test_non_member_cannot_send_typing_and_receives_nothing(client):
    _, alice_token = register_and_login(client, "alice")
    bob, bob_token = register_and_login(client, "bob")
    _, erin_token = register_and_login(client, "erin")
    convo = _create_direct_conversation(client, alice_token, bob["id"])

    with (
        client.websocket_connect("/ws") as alice_ws,
        client.websocket_connect("/ws") as bob_ws,
        client.websocket_connect("/ws") as erin_ws,
    ):
        _authenticate_ws(alice_ws, alice_token)
        _authenticate_ws(bob_ws, bob_token)
        _authenticate_ws(erin_ws, erin_token)

        # Erin (non-member) tries to type into alice/bob's conversation —
        # rejected before anything is ever broadcast, so nothing crosses
        # connections here; same-task self-probes only, safe on TestClient.
        erin_ws.send_json({"type": "typing_start", "conversation_id": convo["id"]})
        resp = erin_ws.receive_json()
        assert resp["type"] == "error"
        assert resp["code"] == "NOT_CONVERSATION_MEMBER"

        alice_ws.send_json({"type": "fly_to_the_moon"})
        assert alice_ws.receive_json()["code"] == "UNKNOWN_EVENT_TYPE"
        bob_ws.send_json({"type": "fly_to_the_moon"})
        assert bob_ws.receive_json()["code"] == "UNKNOWN_EVENT_TYPE"


def test_typing_events_create_no_database_rows(client, live_ws_url):
    _, alice_token = register_and_login(client, "alice")
    bob, bob_token = register_and_login(client, "bob")
    convo = _create_direct_conversation(client, alice_token, bob["id"])

    db = client.db_sessionmaker()
    try:
        messages_before = db.query(Message).count()
        statuses_before = db.query(MessageStatus).count()
    finally:
        db.close()

    async def body():
        alice_ws = await ws_connect_authenticated(live_ws_url, alice_token)
        bob_ws = await ws_connect_authenticated(live_ws_url, bob_token)
        try:
            await send_event(alice_ws, {"type": "typing_start", "conversation_id": convo["id"]})
            await recv_event(bob_ws)
            await send_event(alice_ws, {"type": "typing_stop", "conversation_id": convo["id"]})
            await recv_event(bob_ws)
        finally:
            await alice_ws.close()
            await bob_ws.close()

    asyncio.run(body())

    db = client.db_sessionmaker()
    try:
        assert db.query(Message).count() == messages_before
        assert db.query(MessageStatus).count() == statuses_before
    finally:
        db.close()


def test_multiple_users_typing_in_group(client, live_ws_url):
    alice, alice_token = register_and_login(client, "alice")
    bob, bob_token = register_and_login(client, "bob")
    carol, carol_token = register_and_login(client, "carol")
    group = _create_group(client, alice_token, "Trio", [bob["id"], carol["id"]])

    async def body():
        alice_ws = await ws_connect_authenticated(live_ws_url, alice_token)
        bob_ws = await ws_connect_authenticated(live_ws_url, bob_token)
        carol_ws = await ws_connect_authenticated(live_ws_url, carol_token)
        try:
            await send_event(bob_ws, {"type": "typing_start", "conversation_id": group["id"]})
            await send_event(carol_ws, {"type": "typing_start", "conversation_id": group["id"]})

            first = await recv_event(alice_ws)
            second = await recv_event(alice_ws)
            typer_ids = {first["user"]["id"], second["user"]["id"]}
            assert typer_ids == {bob["id"], carol["id"]}
            assert first["is_typing"] and second["is_typing"]
        finally:
            await alice_ws.close()
            await bob_ws.close()
            await carol_ws.close()

    asyncio.run(body())


# --- malformed / unknown events still handled safely ---


def test_malformed_status_events_handled_safely(client):
    _, alice_token = register_and_login(client, "alice")
    with client.websocket_connect("/ws") as ws:
        _authenticate_ws(ws, alice_token)

        ws.send_json({"type": "message_delivered"})  # missing message_id
        resp = ws.receive_json()
        assert resp["code"] == "MALFORMED_MESSAGE"

        ws.send_json({"type": "mark_read"})  # missing conversation_id
        resp = ws.receive_json()
        assert resp["code"] == "MALFORMED_MESSAGE"

        ws.send_json({"type": "typing_start"})  # missing conversation_id
        resp = ws.receive_json()
        assert resp["code"] == "MALFORMED_MESSAGE"

        ws.send_json({"type": "message_delivered", "message_id": "not-an-int"})
        resp = ws.receive_json()
        assert resp["code"] == "MALFORMED_MESSAGE"

        # Connection still alive and well after all that.
        ws.send_json({"type": "fly_to_the_moon"})
        resp = ws.receive_json()
        assert resp["code"] == "UNKNOWN_EVENT_TYPE"
