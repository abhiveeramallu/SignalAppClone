from app.models import Message, MessageStatus
from app.websocket.manager import manager
from tests.helpers import auth_headers, register_and_login


def _create_direct_conversation(client, token, other_user_id):
    resp = client.post("/conversations/direct", json={"user_id": other_user_id}, headers=auth_headers(token))
    assert resp.status_code in (200, 201)
    return resp.json()


def _authenticate_ws(ws, token):
    ws.send_json({"type": "authenticate", "token": token})
    return ws.receive_json()


# --- authentication ---


def test_websocket_connection_can_be_established(client):
    _, token = register_and_login(client, "alice")
    with client.websocket_connect("/ws") as ws:
        ack = _authenticate_ws(ws, token)
        assert ack["type"] == "authenticated"


def test_authenticate_with_valid_jwt_succeeds(client):
    alice, token = register_and_login(client, "alice")
    with client.websocket_connect("/ws") as ws:
        ack = _authenticate_ws(ws, token)
        assert ack == {"type": "authenticated", "user_id": alice["id"]}


def test_invalid_jwt_rejected(client):
    with client.websocket_connect("/ws") as ws:
        ws.send_json({"type": "authenticate", "token": "not-a-real-token"})
        msg = ws.receive_json()
        assert msg["type"] == "error"
        assert msg["code"] == "NOT_AUTHENTICATED"


def test_missing_authentication_event_rejected(client):
    with client.websocket_connect("/ws") as ws:
        ws.send_json({"type": "send_message", "conversation_id": 1, "content": "sneaky"})
        msg = ws.receive_json()
        assert msg["type"] == "error"
        assert msg["code"] == "NOT_AUTHENTICATED"


def test_malformed_authentication_event_handled_safely(client):
    with client.websocket_connect("/ws") as ws:
        ws.send_json({"type": "authenticate"})  # missing token
        msg = ws.receive_json()
        assert msg["type"] == "error"


# --- connections ---


def test_authenticated_user_appears_in_connection_manager(client):
    alice, token = register_and_login(client, "alice")
    with client.websocket_connect("/ws") as ws:
        _authenticate_ws(ws, token)
        assert manager.connection_count(alice["id"]) == 1


def test_disconnect_removes_connection(client):
    alice, token = register_and_login(client, "alice")
    with client.websocket_connect("/ws") as ws:
        _authenticate_ws(ws, token)
        assert manager.connection_count(alice["id"]) == 1
    assert manager.connection_count(alice["id"]) == 0


def test_multiple_connections_for_same_user_work(client):
    alice, token = register_and_login(client, "alice")
    with client.websocket_connect("/ws") as ws1, client.websocket_connect("/ws") as ws2:
        _authenticate_ws(ws1, token)
        _authenticate_ws(ws2, token)
        assert manager.connection_count(alice["id"]) == 2


def test_disconnecting_one_connection_does_not_remove_another(client):
    alice, token = register_and_login(client, "alice")
    with client.websocket_connect("/ws") as ws1:
        _authenticate_ws(ws1, token)
        with client.websocket_connect("/ws") as ws2:
            _authenticate_ws(ws2, token)
            assert manager.connection_count(alice["id"]) == 2
        assert manager.connection_count(alice["id"]) == 1
    assert manager.connection_count(alice["id"]) == 0


def test_presence_tracks_real_connection_state(client):
    """is_online is live-tracked from the connection manager, not a static
    seeded/client-only value — regression test for a prior audit finding."""
    alice, token = register_and_login(client, "alice")
    assert client.get("/auth/me", headers=auth_headers(token)).json()["is_online"] is False

    with client.websocket_connect("/ws") as ws:
        _authenticate_ws(ws, token)
        assert client.get("/auth/me", headers=auth_headers(token)).json()["is_online"] is True

    assert client.get("/auth/me", headers=auth_headers(token)).json()["is_online"] is False


def test_presence_stays_online_while_any_connection_remains(client):
    alice, token = register_and_login(client, "alice")
    with client.websocket_connect("/ws") as ws1:
        _authenticate_ws(ws1, token)
        with client.websocket_connect("/ws") as ws2:
            _authenticate_ws(ws2, token)
        # ws2 closed, ws1 still open — must still read online.
        assert client.get("/auth/me", headers=auth_headers(token)).json()["is_online"] is True
    assert client.get("/auth/me", headers=auth_headers(token)).json()["is_online"] is False


# --- direct messaging ---


def test_alice_sends_to_bob_direct_message(client):
    alice, alice_token = register_and_login(client, "alice")
    bob, bob_token = register_and_login(client, "bob")
    convo = _create_direct_conversation(client, alice_token, bob["id"])

    with client.websocket_connect("/ws") as alice_ws, client.websocket_connect("/ws") as bob_ws:
        _authenticate_ws(alice_ws, alice_token)
        _authenticate_ws(bob_ws, bob_token)

        alice_ws.send_json({"type": "send_message", "conversation_id": convo["id"], "content": "Hello Bob"})

        alice_event = alice_ws.receive_json()
        bob_event = bob_ws.receive_json()

        assert alice_event["type"] == "new_message"
        assert bob_event["type"] == "new_message"
        assert alice_event["message"]["id"] == bob_event["message"]["id"]
        assert alice_event["message"]["content"] == "Hello Bob"
        assert alice_event["message"]["conversation_id"] == convo["id"]
        assert alice_event["message"]["sender"]["username"] == "alice"

    message_id = alice_event["message"]["id"]
    db = client.db_sessionmaker()
    try:
        assert db.query(Message).filter(Message.conversation_id == convo["id"]).count() == 1
        status_row = db.query(MessageStatus).filter(MessageStatus.message_id == message_id).one()
        assert status_row.user_id == bob["id"]
        assert status_row.status == "sent"
    finally:
        db.close()


# --- group messaging ---


def test_group_member_sends_message_all_connected_members_receive(client):
    alice, alice_token = register_and_login(client, "alice")
    bob, bob_token = register_and_login(client, "bob")
    carol, carol_token = register_and_login(client, "carol")
    dave, _ = register_and_login(client, "dave")  # never connects via WS

    group = client.post(
        "/conversations/group",
        json={"name": "Trio+Dave", "member_ids": [bob["id"], carol["id"], dave["id"]]},
        headers=auth_headers(alice_token),
    ).json()

    with (
        client.websocket_connect("/ws") as alice_ws,
        client.websocket_connect("/ws") as bob_ws,
        client.websocket_connect("/ws") as carol_ws,
    ):
        _authenticate_ws(alice_ws, alice_token)
        _authenticate_ws(bob_ws, bob_token)
        _authenticate_ws(carol_ws, carol_token)

        alice_ws.send_json({"type": "send_message", "conversation_id": group["id"], "content": "Hi team"})

        alice_event = alice_ws.receive_json()
        bob_event = bob_ws.receive_json()
        carol_event = carol_ws.receive_json()

        assert alice_event["message"]["id"] == bob_event["message"]["id"] == carol_event["message"]["id"]

    message_id = alice_event["message"]["id"]
    db = client.db_sessionmaker()
    try:
        statuses = db.query(MessageStatus).filter(MessageStatus.message_id == message_id).all()
        # dave never connected, but he's still a DB-level recipient — his
        # status row exists even though he wasn't online to be pushed to.
        assert {s.user_id for s in statuses} == {bob["id"], carol["id"], dave["id"]}
    finally:
        db.close()


def test_non_members_receive_nothing(client):
    alice, alice_token = register_and_login(client, "alice")
    bob, _ = register_and_login(client, "bob")
    _, erin_token = register_and_login(client, "erin")  # not in the group

    group = client.post(
        "/conversations/group",
        json={"name": "Private Group", "member_ids": [bob["id"]]},
        headers=auth_headers(alice_token),
    ).json()

    with client.websocket_connect("/ws") as alice_ws, client.websocket_connect("/ws") as erin_ws:
        _authenticate_ws(alice_ws, alice_token)
        _authenticate_ws(erin_ws, erin_token)

        alice_ws.send_json({"type": "send_message", "conversation_id": group["id"], "content": "secret"})
        alice_ws.receive_json()  # alice's own echo

        # Prove erin got nothing from that broadcast: send an unrelated event
        # on erin's socket and check the very next thing she receives is the
        # response to THAT event, not a leaked new_message.
        erin_ws.send_json({"type": "ping_probe"})
        probe_response = erin_ws.receive_json()
        assert probe_response["type"] == "error"
        assert probe_response["code"] == "UNKNOWN_EVENT_TYPE"


# --- authorization ---


def test_non_member_send_rejected_no_message_created(client):
    _, alice_token = register_and_login(client, "alice")
    bob, _ = register_and_login(client, "bob")
    _, carol_token = register_and_login(client, "carol")
    convo = _create_direct_conversation(client, alice_token, bob["id"])

    with client.websocket_connect("/ws") as carol_ws:
        _authenticate_ws(carol_ws, carol_token)
        carol_ws.send_json({"type": "send_message", "conversation_id": convo["id"], "content": "intrusion"})
        resp = carol_ws.receive_json()
        assert resp["type"] == "error"
        assert resp["code"] == "NOT_CONVERSATION_MEMBER"

    db = client.db_sessionmaker()
    try:
        assert db.query(Message).filter(Message.conversation_id == convo["id"]).count() == 0
    finally:
        db.close()


# --- validation ---


def test_empty_content_rejected(client):
    _, alice_token = register_and_login(client, "alice")
    bob, _ = register_and_login(client, "bob")
    convo = _create_direct_conversation(client, alice_token, bob["id"])

    with client.websocket_connect("/ws") as ws:
        _authenticate_ws(ws, alice_token)
        ws.send_json({"type": "send_message", "conversation_id": convo["id"], "content": ""})
        resp = ws.receive_json()
        assert resp["code"] == "INVALID_MESSAGE"


def test_whitespace_only_content_rejected(client):
    _, alice_token = register_and_login(client, "alice")
    bob, _ = register_and_login(client, "bob")
    convo = _create_direct_conversation(client, alice_token, bob["id"])

    with client.websocket_connect("/ws") as ws:
        _authenticate_ws(ws, alice_token)
        ws.send_json({"type": "send_message", "conversation_id": convo["id"], "content": "   "})
        resp = ws.receive_json()
        assert resp["code"] == "INVALID_MESSAGE"


def test_oversized_content_rejected(client):
    _, alice_token = register_and_login(client, "alice")
    bob, _ = register_and_login(client, "bob")
    convo = _create_direct_conversation(client, alice_token, bob["id"])

    with client.websocket_connect("/ws") as ws:
        _authenticate_ws(ws, alice_token)
        ws.send_json({"type": "send_message", "conversation_id": convo["id"], "content": "a" * 4001})
        resp = ws.receive_json()
        assert resp["code"] == "INVALID_MESSAGE"


def test_sender_id_injection_ignored(client):
    alice, alice_token = register_and_login(client, "alice")
    bob, _ = register_and_login(client, "bob")
    convo = _create_direct_conversation(client, alice_token, bob["id"])

    with client.websocket_connect("/ws") as ws:
        _authenticate_ws(ws, alice_token)
        ws.send_json(
            {"type": "send_message", "conversation_id": convo["id"], "content": "hi", "sender_id": bob["id"]}
        )
        resp = ws.receive_json()
        assert resp["message"]["sender"]["id"] == alice["id"]


def test_status_injection_ignored(client):
    _, alice_token = register_and_login(client, "alice")
    bob, _ = register_and_login(client, "bob")
    convo = _create_direct_conversation(client, alice_token, bob["id"])

    with client.websocket_connect("/ws") as ws:
        _authenticate_ws(ws, alice_token)
        ws.send_json({"type": "send_message", "conversation_id": convo["id"], "content": "hi", "status": "read"})
        resp = ws.receive_json()
        assert resp["message"]["status"] == "sent"


def test_invalid_conversation_id_rejected(client):
    _, alice_token = register_and_login(client, "alice")
    with client.websocket_connect("/ws") as ws:
        _authenticate_ws(ws, alice_token)
        ws.send_json({"type": "send_message", "conversation_id": 999999, "content": "hi"})
        resp = ws.receive_json()
        assert resp["code"] == "NOT_CONVERSATION_MEMBER"


def test_unknown_event_type_handled(client):
    _, alice_token = register_and_login(client, "alice")
    with client.websocket_connect("/ws") as ws:
        _authenticate_ws(ws, alice_token)
        ws.send_json({"type": "fly_to_the_moon"})
        resp = ws.receive_json()
        assert resp["type"] == "error"
        assert resp["code"] == "UNKNOWN_EVENT_TYPE"


def test_malformed_json_handled_and_connection_survives(client):
    _, alice_token = register_and_login(client, "alice")
    with client.websocket_connect("/ws") as ws:
        _authenticate_ws(ws, alice_token)
        ws.send_text("this is not json {{{")
        resp = ws.receive_json()
        assert resp["type"] == "error"
        assert resp["code"] == "MALFORMED_MESSAGE"

        # connection must still be usable afterward, not dropped
        ws.send_json({"type": "fly_to_the_moon"})
        resp2 = ws.receive_json()
        assert resp2["code"] == "UNKNOWN_EVENT_TYPE"


# --- persistence ---


def test_message_survives_fresh_db_session(client):
    _, alice_token = register_and_login(client, "alice")
    bob, _ = register_and_login(client, "bob")
    convo = _create_direct_conversation(client, alice_token, bob["id"])

    with client.websocket_connect("/ws") as ws:
        _authenticate_ws(ws, alice_token)
        ws.send_json({"type": "send_message", "conversation_id": convo["id"], "content": "Durable"})
        ws.receive_json()

    db = client.db_sessionmaker()
    try:
        count = db.query(Message).filter(
            Message.conversation_id == convo["id"], Message.content == "Durable"
        ).count()
        assert count == 1
    finally:
        db.close()


def test_rest_history_returns_websocket_created_message(client):
    _, alice_token = register_and_login(client, "alice")
    bob, _ = register_and_login(client, "bob")
    convo = _create_direct_conversation(client, alice_token, bob["id"])

    with client.websocket_connect("/ws") as ws:
        _authenticate_ws(ws, alice_token)
        ws.send_json({"type": "send_message", "conversation_id": convo["id"], "content": "via websocket"})
        ws.receive_json()

    resp = client.get(f"/conversations/{convo['id']}/messages", headers=auth_headers(alice_token))
    contents = [m["content"] for m in resp.json()["messages"]]
    assert "via websocket" in contents


def test_rest_and_websocket_messages_interleave_correctly(client):
    _, alice_token = register_and_login(client, "alice")
    bob, _ = register_and_login(client, "bob")
    convo = _create_direct_conversation(client, alice_token, bob["id"])

    client.post(
        f"/conversations/{convo['id']}/messages", json={"content": "via rest"}, headers=auth_headers(alice_token)
    )
    with client.websocket_connect("/ws") as ws:
        _authenticate_ws(ws, alice_token)
        ws.send_json({"type": "send_message", "conversation_id": convo["id"], "content": "via websocket"})
        ws.receive_json()

    resp = client.get(f"/conversations/{convo['id']}/messages", headers=auth_headers(alice_token))
    contents = [m["content"] for m in resp.json()["messages"]]
    assert contents == ["via rest", "via websocket"]
