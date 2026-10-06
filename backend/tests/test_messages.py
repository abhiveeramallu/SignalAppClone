from datetime import datetime, timezone

from app.models import Message, MessageStatus
from tests.helpers import auth_headers, register_and_login


def _create_direct_conversation(client, token, other_user_id):
    resp = client.post("/conversations/direct", json={"user_id": other_user_id}, headers=auth_headers(token))
    assert resp.status_code in (200, 201)
    return resp.json()


def _send(client, token, conversation_id, content):
    return client.post(
        f"/conversations/{conversation_id}/messages", json={"content": content}, headers=auth_headers(token)
    )


# --- message creation ---


def test_authenticated_member_can_send_message(client):
    alice, alice_token = register_and_login(client, "alice")
    bob, _ = register_and_login(client, "bob")
    convo = _create_direct_conversation(client, alice_token, bob["id"])

    resp = _send(client, alice_token, convo["id"], "Hello!")
    assert resp.status_code == 201
    body = resp.json()
    assert body["content"] == "Hello!"
    assert body["sender"]["username"] == "alice"
    assert body["conversation_id"] == convo["id"]
    assert body["status"] == "sent"


def test_unauthenticated_cannot_send(client):
    alice, alice_token = register_and_login(client, "alice")
    bob, _ = register_and_login(client, "bob")
    convo = _create_direct_conversation(client, alice_token, bob["id"])

    resp = client.post(f"/conversations/{convo['id']}/messages", json={"content": "Hi"})
    assert resp.status_code == 401


def test_non_member_cannot_send(client):
    _, alice_token = register_and_login(client, "alice")
    bob, _ = register_and_login(client, "bob")
    _, carol_token = register_and_login(client, "carol")
    convo = _create_direct_conversation(client, alice_token, bob["id"])

    resp = _send(client, carol_token, convo["id"], "Sneaky")
    assert resp.status_code == 404  # same non-leaking behavior as conversations


def test_sender_taken_from_jwt_not_request(client):
    alice, alice_token = register_and_login(client, "alice")
    bob, _ = register_and_login(client, "bob")
    convo = _create_direct_conversation(client, alice_token, bob["id"])

    resp = _send(client, alice_token, convo["id"], "From alice")
    assert resp.json()["sender"]["id"] == alice["id"]


def test_request_cannot_specify_sender_id(client):
    _, alice_token = register_and_login(client, "alice")
    bob, _ = register_and_login(client, "bob")
    convo = _create_direct_conversation(client, alice_token, bob["id"])

    resp = client.post(
        f"/conversations/{convo['id']}/messages",
        json={"content": "Hi", "sender_id": bob["id"]},
        headers=auth_headers(alice_token),
    )
    assert resp.status_code == 422


def test_empty_message_rejected(client):
    _, alice_token = register_and_login(client, "alice")
    bob, _ = register_and_login(client, "bob")
    convo = _create_direct_conversation(client, alice_token, bob["id"])

    assert _send(client, alice_token, convo["id"], "").status_code == 422


def test_whitespace_only_message_rejected(client):
    _, alice_token = register_and_login(client, "alice")
    bob, _ = register_and_login(client, "bob")
    convo = _create_direct_conversation(client, alice_token, bob["id"])

    assert _send(client, alice_token, convo["id"], "    \n\t  ").status_code == 422


def test_message_over_max_length_rejected(client):
    _, alice_token = register_and_login(client, "alice")
    bob, _ = register_and_login(client, "bob")
    convo = _create_direct_conversation(client, alice_token, bob["id"])

    assert _send(client, alice_token, convo["id"], "a" * 4001).status_code == 422


def test_internal_whitespace_preserved(client):
    _, alice_token = register_and_login(client, "alice")
    bob, _ = register_and_login(client, "bob")
    convo = _create_direct_conversation(client, alice_token, bob["id"])

    resp = _send(client, alice_token, convo["id"], "  hello    world  ")
    assert resp.json()["content"] == "hello    world"


def test_valid_message_persists_in_db(client):
    _, alice_token = register_and_login(client, "alice")
    bob, _ = register_and_login(client, "bob")
    convo = _create_direct_conversation(client, alice_token, bob["id"])

    message_id = _send(client, alice_token, convo["id"], "Persisted message").json()["id"]

    db = client.db_sessionmaker()
    try:
        stored = db.get(Message, message_id)
        assert stored is not None
        assert stored.content == "Persisted message"
    finally:
        db.close()


def test_created_at_is_populated(client):
    _, alice_token = register_and_login(client, "alice")
    bob, _ = register_and_login(client, "bob")
    convo = _create_direct_conversation(client, alice_token, bob["id"])

    resp = _send(client, alice_token, convo["id"], "Timestamped")
    assert resp.json()["created_at"] is not None


# --- direct messages: status rows ---


def test_direct_recipient_gets_status_row(client):
    alice, alice_token = register_and_login(client, "alice")
    bob, _ = register_and_login(client, "bob")
    convo = _create_direct_conversation(client, alice_token, bob["id"])

    message_id = _send(client, alice_token, convo["id"], "Hi bob").json()["id"]

    db = client.db_sessionmaker()
    try:
        statuses = db.query(MessageStatus).filter(MessageStatus.message_id == message_id).all()
        assert len(statuses) == 1
        assert statuses[0].user_id == bob["id"]
        assert statuses[0].status == "sent"
    finally:
        db.close()


def test_sender_has_no_recipient_status_row(client):
    alice, alice_token = register_and_login(client, "alice")
    bob, _ = register_and_login(client, "bob")
    convo = _create_direct_conversation(client, alice_token, bob["id"])

    message_id = _send(client, alice_token, convo["id"], "Hi bob").json()["id"]

    db = client.db_sessionmaker()
    try:
        own_status = (
            db.query(MessageStatus)
            .filter(MessageStatus.message_id == message_id, MessageStatus.user_id == alice["id"])
            .first()
        )
        assert own_status is None
    finally:
        db.close()


# --- group messages ---


def test_group_message_creates_status_for_every_other_member(client):
    alice, alice_token = register_and_login(client, "alice")
    bob, _ = register_and_login(client, "bob")
    carol, _ = register_and_login(client, "carol")

    group = client.post(
        "/conversations/group",
        json={"name": "Trio", "member_ids": [bob["id"], carol["id"]]},
        headers=auth_headers(alice_token),
    ).json()

    message_id = _send(client, alice_token, group["id"], "Hi everyone").json()["id"]

    db = client.db_sessionmaker()
    try:
        statuses = db.query(MessageStatus).filter(MessageStatus.message_id == message_id).all()
        assert {s.user_id for s in statuses} == {bob["id"], carol["id"]}
        assert all(s.status == "sent" for s in statuses)
    finally:
        db.close()


def test_group_sender_has_no_recipient_status_row(client):
    alice, alice_token = register_and_login(client, "alice")
    bob, _ = register_and_login(client, "bob")
    carol, _ = register_and_login(client, "carol")

    group = client.post(
        "/conversations/group",
        json={"name": "Trio", "member_ids": [bob["id"], carol["id"]]},
        headers=auth_headers(alice_token),
    ).json()

    message_id = _send(client, alice_token, group["id"], "Hi everyone").json()["id"]

    db = client.db_sessionmaker()
    try:
        own_status = (
            db.query(MessageStatus)
            .filter(MessageStatus.message_id == message_id, MessageStatus.user_id == alice["id"])
            .first()
        )
        assert own_status is None
    finally:
        db.close()


# --- message history ---


def test_member_can_retrieve_history(client):
    _, alice_token = register_and_login(client, "alice")
    bob, _ = register_and_login(client, "bob")
    convo = _create_direct_conversation(client, alice_token, bob["id"])
    _send(client, alice_token, convo["id"], "Hi")

    resp = client.get(f"/conversations/{convo['id']}/messages", headers=auth_headers(alice_token))
    assert resp.status_code == 200
    assert len(resp.json()["messages"]) == 1


def test_non_member_cannot_retrieve_history(client):
    _, alice_token = register_and_login(client, "alice")
    bob, _ = register_and_login(client, "bob")
    _, carol_token = register_and_login(client, "carol")
    convo = _create_direct_conversation(client, alice_token, bob["id"])

    resp = client.get(f"/conversations/{convo['id']}/messages", headers=auth_headers(carol_token))
    assert resp.status_code == 404


def test_messages_are_chronological(client):
    _, alice_token = register_and_login(client, "alice")
    bob, _ = register_and_login(client, "bob")
    convo = _create_direct_conversation(client, alice_token, bob["id"])

    for text in ["first", "second", "third"]:
        _send(client, alice_token, convo["id"], text)

    resp = client.get(f"/conversations/{convo['id']}/messages", headers=auth_headers(alice_token))
    assert [m["content"] for m in resp.json()["messages"]] == ["first", "second", "third"]


def test_sender_information_included(client):
    alice, alice_token = register_and_login(client, "alice")
    bob, _ = register_and_login(client, "bob")
    convo = _create_direct_conversation(client, alice_token, bob["id"])
    _send(client, alice_token, convo["id"], "Hi")

    resp = client.get(f"/conversations/{convo['id']}/messages", headers=auth_headers(alice_token))
    sender = resp.json()["messages"][0]["sender"]
    assert sender["username"] == "alice"
    assert sender["display_name"] == alice["display_name"]


def test_password_hash_never_in_message_history(client):
    _, alice_token = register_and_login(client, "alice")
    bob, _ = register_and_login(client, "bob")
    convo = _create_direct_conversation(client, alice_token, bob["id"])
    _send(client, alice_token, convo["id"], "Hi")

    resp = client.get(f"/conversations/{convo['id']}/messages", headers=auth_headers(alice_token))
    assert "password_hash" not in resp.json()["messages"][0]["sender"]


def test_pagination_limit_works(client):
    _, alice_token = register_and_login(client, "alice")
    bob, _ = register_and_login(client, "bob")
    convo = _create_direct_conversation(client, alice_token, bob["id"])

    for i in range(5):
        _send(client, alice_token, convo["id"], f"message {i}")

    resp = client.get(f"/conversations/{convo['id']}/messages?limit=2", headers=auth_headers(alice_token))
    body = resp.json()
    assert len(body["messages"]) == 2
    assert body["has_more"] is True
    assert body["next_cursor"] is not None


def test_maximum_limit_enforced(client):
    _, alice_token = register_and_login(client, "alice")
    bob, _ = register_and_login(client, "bob")
    convo = _create_direct_conversation(client, alice_token, bob["id"])

    resp = client.get(f"/conversations/{convo['id']}/messages?limit=101", headers=auth_headers(alice_token))
    assert resp.status_code == 422


def test_cursor_pagination_walks_full_history(client):
    _, alice_token = register_and_login(client, "alice")
    bob, _ = register_and_login(client, "bob")
    convo = _create_direct_conversation(client, alice_token, bob["id"])

    for i in range(5):
        _send(client, alice_token, convo["id"], f"message {i}")

    # Walk backward page by page (limit=2) and confirm we see all 5 exactly
    # once, reassembled oldest -> newest.
    seen: list[str] = []
    cursor = None
    for _ in range(10):  # generous bound, just to avoid an infinite loop on a bug
        url = f"/conversations/{convo['id']}/messages?limit=2"
        if cursor is not None:
            url += f"&before_id={cursor}"
        page = client.get(url, headers=auth_headers(alice_token)).json()
        seen = [m["content"] for m in page["messages"]] + seen
        if not page["has_more"]:
            break
        cursor = page["next_cursor"]

    assert seen == [f"message {i}" for i in range(5)]


def test_has_more_false_on_last_page(client):
    _, alice_token = register_and_login(client, "alice")
    bob, _ = register_and_login(client, "bob")
    convo = _create_direct_conversation(client, alice_token, bob["id"])
    _send(client, alice_token, convo["id"], "only message")

    body = client.get(f"/conversations/{convo['id']}/messages?limit=50", headers=auth_headers(alice_token)).json()
    assert body["has_more"] is False
    assert body["next_cursor"] is None


def test_deterministic_ordering_with_equal_timestamps(client):
    alice, alice_token = register_and_login(client, "alice")
    bob, _ = register_and_login(client, "bob")
    convo = _create_direct_conversation(client, alice_token, bob["id"])

    same_time = datetime.now(timezone.utc).replace(tzinfo=None)
    db = client.db_sessionmaker()
    try:
        db.add_all(
            [
                Message(conversation_id=convo["id"], sender_id=alice["id"], content="tie-1", created_at=same_time),
                Message(conversation_id=convo["id"], sender_id=alice["id"], content="tie-2", created_at=same_time),
            ]
        )
        db.commit()
    finally:
        db.close()

    resp = client.get(f"/conversations/{convo['id']}/messages", headers=auth_headers(alice_token))
    # Same created_at on both — only the id tiebreaker can make this deterministic.
    assert [m["content"] for m in resp.json()["messages"]] == ["tie-1", "tie-2"]


def test_invalid_cursor_rejected(client):
    _, alice_token = register_and_login(client, "alice")
    bob, _ = register_and_login(client, "bob")
    convo = _create_direct_conversation(client, alice_token, bob["id"])

    resp = client.get(
        f"/conversations/{convo['id']}/messages?before_id=999999", headers=auth_headers(alice_token)
    )
    assert resp.status_code == 400


# --- persistence ---


def test_message_survives_fresh_db_session(client):
    _, alice_token = register_and_login(client, "alice")
    bob, _ = register_and_login(client, "bob")
    convo = _create_direct_conversation(client, alice_token, bob["id"])
    _send(client, alice_token, convo["id"], "Durable message")

    db = client.db_sessionmaker()
    try:
        count = db.query(Message).filter(Message.conversation_id == convo["id"]).count()
        assert count == 1
    finally:
        db.close()


# --- security ---


def test_user_cannot_send_to_another_users_conversation(client):
    _, alice_token = register_and_login(client, "alice")
    bob, _ = register_and_login(client, "bob")
    _, carol_token = register_and_login(client, "carol")
    convo = _create_direct_conversation(client, alice_token, bob["id"])

    resp = _send(client, carol_token, convo["id"], "Intrusion")
    assert resp.status_code == 404


def test_user_cannot_manipulate_sender_identity(client):
    _, alice_token = register_and_login(client, "alice")
    bob, _ = register_and_login(client, "bob")
    convo = _create_direct_conversation(client, alice_token, bob["id"])

    resp = client.post(
        f"/conversations/{convo['id']}/messages",
        json={"content": "Hi", "sender": {"id": bob["id"]}},
        headers=auth_headers(alice_token),
    )
    assert resp.status_code == 422


def test_user_cannot_set_status_via_request(client):
    _, alice_token = register_and_login(client, "alice")
    bob, _ = register_and_login(client, "bob")
    convo = _create_direct_conversation(client, alice_token, bob["id"])

    resp = client.post(
        f"/conversations/{convo['id']}/messages",
        json={"content": "Hi", "status": "read"},
        headers=auth_headers(alice_token),
    )
    assert resp.status_code == 422


def test_user_cannot_retrieve_another_users_conversation_messages(client):
    _, alice_token = register_and_login(client, "alice")
    bob, _ = register_and_login(client, "bob")
    _, carol_token = register_and_login(client, "carol")
    convo = _create_direct_conversation(client, alice_token, bob["id"])
    _send(client, alice_token, convo["id"], "private")

    resp = client.get(f"/conversations/{convo['id']}/messages", headers=auth_headers(carol_token))
    assert resp.status_code == 404
