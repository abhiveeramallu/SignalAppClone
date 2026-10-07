from datetime import datetime, timedelta, timezone

from app.models import Conversation, Message, MessageStatus
from app.models.conversation import compute_direct_key
from tests.helpers import auth_headers, register_and_login


def _insert_message(client, conversation_id, sender_id, content, created_at, recipient_ids, status="sent"):
    db = client.db_sessionmaker()
    try:
        message = Message(conversation_id=conversation_id, sender_id=sender_id, content=content, created_at=created_at)
        db.add(message)
        db.flush()
        for recipient_id in recipient_ids:
            db.add(MessageStatus(message_id=message.id, user_id=recipient_id, status=status, updated_at=created_at))
        db.commit()
        return message.id
    finally:
        db.close()


# --- direct conversations ---


def test_create_direct_conversation(client):
    _, alice_token = register_and_login(client, "alice")
    bob, _ = register_and_login(client, "bob")

    resp = client.post("/conversations/direct", json={"user_id": bob["id"]}, headers=auth_headers(alice_token))
    assert resp.status_code == 201
    body = resp.json()
    assert body["type"] == "direct"
    assert body["other_user"]["username"] == "bob"
    assert body["name"] == bob["display_name"]


def test_cannot_create_direct_conversation_with_self(client):
    alice, token = register_and_login(client, "alice")
    resp = client.post("/conversations/direct", json={"user_id": alice["id"]}, headers=auth_headers(token))
    assert resp.status_code == 400


def test_direct_conversation_nonexistent_target_rejected(client):
    _, token = register_and_login(client, "alice")
    resp = client.post("/conversations/direct", json={"user_id": 999999}, headers=auth_headers(token))
    assert resp.status_code == 404


def test_repeated_direct_conversation_creation_returns_same_conversation(client):
    _, alice_token = register_and_login(client, "alice")
    bob, _ = register_and_login(client, "bob")

    first = client.post("/conversations/direct", json={"user_id": bob["id"]}, headers=auth_headers(alice_token))
    assert first.status_code == 201
    first_id = first.json()["id"]

    second = client.post("/conversations/direct", json={"user_id": bob["id"]}, headers=auth_headers(alice_token))
    assert second.status_code == 200
    assert second.json()["id"] == first_id


def test_direct_conversation_symmetric_regardless_of_initiator(client):
    alice, alice_token = register_and_login(client, "alice")
    bob, bob_token = register_and_login(client, "bob")

    first = client.post("/conversations/direct", json={"user_id": bob["id"]}, headers=auth_headers(alice_token))
    second = client.post("/conversations/direct", json={"user_id": alice["id"]}, headers=auth_headers(bob_token))
    assert second.status_code == 200
    assert second.json()["id"] == first.json()["id"]


def test_direct_key_correct_and_no_duplicate_in_db(client):
    alice, alice_token = register_and_login(client, "alice")
    bob, _ = register_and_login(client, "bob")

    client.post("/conversations/direct", json={"user_id": bob["id"]}, headers=auth_headers(alice_token))

    db = client.db_sessionmaker()
    try:
        expected_key = compute_direct_key(alice["id"], bob["id"])
        matches = db.query(Conversation).filter(Conversation.direct_key == expected_key).all()
        assert len(matches) == 1
    finally:
        db.close()


# --- group conversations ---


def test_create_group_conversation(client):
    _, alice_token = register_and_login(client, "alice")
    bob, _ = register_and_login(client, "bob")
    carol, _ = register_and_login(client, "carol")

    resp = client.post(
        "/conversations/group",
        json={"name": "Weekend Trip", "member_ids": [bob["id"], carol["id"]]},
        headers=auth_headers(alice_token),
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["type"] == "group"
    assert body["name"] == "Weekend Trip"
    assert body["member_count"] == 3


def test_group_creator_becomes_admin_and_members_added(client):
    _, alice_token = register_and_login(client, "alice")
    bob, _ = register_and_login(client, "bob")

    create_resp = client.post(
        "/conversations/group",
        json={"name": "Test Group", "member_ids": [bob["id"]]},
        headers=auth_headers(alice_token),
    )
    conversation_id = create_resp.json()["id"]

    detail_resp = client.get(f"/conversations/{conversation_id}", headers=auth_headers(alice_token))
    roles = {p["user"]["username"]: p["role"] for p in detail_resp.json()["participants"]}
    assert roles == {"alice": "admin", "bob": "member"}


def test_group_requires_at_least_one_other_member(client):
    _, token = register_and_login(client, "alice")
    resp = client.post(
        "/conversations/group", json={"name": "Solo Group", "member_ids": []}, headers=auth_headers(token)
    )
    assert resp.status_code == 422


def test_group_requires_at_least_one_member_after_self_filtered(client):
    """member_ids containing only the creator's own id must be rejected the
    same way an empty list is — self-inclusion isn't a real "other member"."""
    alice, token = register_and_login(client, "alice")
    resp = client.post(
        "/conversations/group",
        json={"name": "Self Only", "member_ids": [alice["id"]]},
        headers=auth_headers(token),
    )
    assert resp.status_code == 400


def test_group_nonexistent_member_rejected(client):
    _, token = register_and_login(client, "alice")
    resp = client.post(
        "/conversations/group", json={"name": "Ghost Group", "member_ids": [999999]}, headers=auth_headers(token)
    )
    assert resp.status_code == 404


def test_group_duplicate_member_ids_handled(client):
    _, alice_token = register_and_login(client, "alice")
    bob, _ = register_and_login(client, "bob")

    resp = client.post(
        "/conversations/group",
        json={"name": "Dup Group", "member_ids": [bob["id"], bob["id"], bob["id"]]},
        headers=auth_headers(alice_token),
    )
    assert resp.status_code == 201
    assert resp.json()["member_count"] == 2


def test_group_current_user_not_duplicated_if_included_in_member_ids(client):
    alice, alice_token = register_and_login(client, "alice")
    bob, _ = register_and_login(client, "bob")

    resp = client.post(
        "/conversations/group",
        json={"name": "Self Included", "member_ids": [alice["id"], bob["id"]]},
        headers=auth_headers(alice_token),
    )
    assert resp.status_code == 201
    assert resp.json()["member_count"] == 2


def test_group_direct_key_is_null(client):
    _, alice_token = register_and_login(client, "alice")
    bob, _ = register_and_login(client, "bob")

    resp = client.post(
        "/conversations/group",
        json={"name": "Null Key Group", "member_ids": [bob["id"]]},
        headers=auth_headers(alice_token),
    )
    conversation_id = resp.json()["id"]

    db = client.db_sessionmaker()
    try:
        conv = db.get(Conversation, conversation_id)
        assert conv.direct_key is None
    finally:
        db.close()


# --- authorization ---


def test_non_member_cannot_access_conversation(client):
    _, alice_token = register_and_login(client, "alice")
    bob, _ = register_and_login(client, "bob")
    _, carol_token = register_and_login(client, "carol")

    convo_resp = client.post("/conversations/direct", json={"user_id": bob["id"]}, headers=auth_headers(alice_token))
    conversation_id = convo_resp.json()["id"]

    resp = client.get(f"/conversations/{conversation_id}", headers=auth_headers(carol_token))
    assert resp.status_code == 404


def test_member_can_access_conversation(client):
    _, alice_token = register_and_login(client, "alice")
    bob, bob_token = register_and_login(client, "bob")

    convo_resp = client.post("/conversations/direct", json={"user_id": bob["id"]}, headers=auth_headers(alice_token))
    conversation_id = convo_resp.json()["id"]

    resp = client.get(f"/conversations/{conversation_id}", headers=auth_headers(bob_token))
    assert resp.status_code == 200


def test_list_conversations_only_returns_users_own(client):
    alice, alice_token = register_and_login(client, "alice")
    bob, bob_token = register_and_login(client, "bob")
    carol, _ = register_and_login(client, "carol")

    client.post("/conversations/direct", json={"user_id": bob["id"]}, headers=auth_headers(alice_token))
    client.post("/conversations/direct", json={"user_id": carol["id"]}, headers=auth_headers(bob_token))

    alice_list = client.get("/conversations", headers=auth_headers(alice_token)).json()
    assert len(alice_list) == 1
    assert alice_list[0]["other_user"]["username"] == "bob"


# --- previews: last message, sorting, unread counts ---


def test_latest_message_appears_in_preview(client):
    alice, alice_token = register_and_login(client, "alice")
    bob, _ = register_and_login(client, "bob")

    convo = client.post("/conversations/direct", json={"user_id": bob["id"]}, headers=auth_headers(alice_token)).json()

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    _insert_message(client, convo["id"], bob["id"], "First message", now - timedelta(minutes=10), [alice["id"]])
    _insert_message(client, convo["id"], alice["id"], "Latest message", now, [bob["id"]])

    preview = client.get("/conversations", headers=auth_headers(alice_token)).json()[0]
    assert preview["last_message"]["content"] == "Latest message"


def test_conversations_sorted_by_latest_activity(client):
    alice, alice_token = register_and_login(client, "alice")
    bob, _ = register_and_login(client, "bob")
    carol, _ = register_and_login(client, "carol")

    bob_convo = client.post("/conversations/direct", json={"user_id": bob["id"]}, headers=auth_headers(alice_token)).json()
    carol_convo = client.post(
        "/conversations/direct", json={"user_id": carol["id"]}, headers=auth_headers(alice_token)
    ).json()

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    # Bob's conversation was created first but gets the NEWER message — it
    # should sort above Carol's despite Carol's conversation being younger.
    _insert_message(client, bob_convo["id"], bob["id"], "Hi from bob", now, [alice["id"]])
    _insert_message(client, carol_convo["id"], carol["id"], "Hi from carol", now - timedelta(days=1), [alice["id"]])

    order = [c["id"] for c in client.get("/conversations", headers=auth_headers(alice_token)).json()]
    assert order == [bob_convo["id"], carol_convo["id"]]


def test_conversation_with_no_messages_falls_back_to_created_at(client):
    _, alice_token = register_and_login(client, "alice")
    bob, _ = register_and_login(client, "bob")

    resp = client.post("/conversations/direct", json={"user_id": bob["id"]}, headers=auth_headers(alice_token))
    preview = client.get("/conversations", headers=auth_headers(alice_token)).json()[0]
    assert preview["last_message"] is None
    assert preview["id"] == resp.json()["id"]


def test_unread_count_excludes_own_messages(client):
    alice, alice_token = register_and_login(client, "alice")
    bob, _ = register_and_login(client, "bob")

    convo = client.post("/conversations/direct", json={"user_id": bob["id"]}, headers=auth_headers(alice_token)).json()

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    _insert_message(client, convo["id"], alice["id"], "My own message", now, [bob["id"]], status="sent")
    _insert_message(client, convo["id"], bob["id"], "Unread from bob", now, [alice["id"]], status="delivered")

    preview = client.get("/conversations", headers=auth_headers(alice_token)).json()[0]
    assert preview["unread_count"] == 1


def test_unread_count_for_group_conversation(client):
    alice, alice_token = register_and_login(client, "alice")
    bob, _ = register_and_login(client, "bob")
    carol, _ = register_and_login(client, "carol")

    group = client.post(
        "/conversations/group",
        json={"name": "Trio", "member_ids": [bob["id"], carol["id"]]},
        headers=auth_headers(alice_token),
    ).json()

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    _insert_message(
        client, group["id"], bob["id"], "Hi from bob", now - timedelta(minutes=5), [alice["id"], carol["id"]],
        status="delivered",
    )
    _insert_message(
        client, group["id"], carol["id"], "Hi from carol", now, [alice["id"], bob["id"]], status="delivered"
    )

    preview = client.get("/conversations", headers=auth_headers(alice_token)).json()[0]
    assert preview["unread_count"] == 2


def test_unread_count_zero_once_marked_read(client):
    alice, alice_token = register_and_login(client, "alice")
    bob, _ = register_and_login(client, "bob")

    convo = client.post("/conversations/direct", json={"user_id": bob["id"]}, headers=auth_headers(alice_token)).json()

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    _insert_message(client, convo["id"], bob["id"], "Already read", now, [alice["id"]], status="read")

    preview = client.get("/conversations", headers=auth_headers(alice_token)).json()[0]
    assert preview["unread_count"] == 0
