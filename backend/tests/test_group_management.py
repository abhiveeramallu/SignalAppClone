import asyncio
import json

from app.models import ConversationParticipant
from tests.helpers import auth_headers, register_and_login
from tests.ws_live_helpers import recv_event, send_event, ws_connect_authenticated


def _create_group(client, token, name, member_ids):
    resp = client.post(
        "/conversations/group", json={"name": name, "member_ids": member_ids}, headers=auth_headers(token)
    )
    assert resp.status_code == 201
    return resp.json()


def _create_direct(client, token, other_user_id):
    resp = client.post("/conversations/direct", json={"user_id": other_user_id}, headers=auth_headers(token))
    assert resp.status_code in (200, 201)
    return resp.json()


def _role(client, conversation_id, user_id):
    db = client.db_sessionmaker()
    try:
        row = (
            db.query(ConversationParticipant)
            .filter(
                ConversationParticipant.conversation_id == conversation_id,
                ConversationParticipant.user_id == user_id,
            )
            .first()
        )
        return row.role if row else None
    finally:
        db.close()


# --- group details (Part A) ---


def test_member_can_view_group_details(client):
    alice, alice_token = register_and_login(client, "alice")
    bob, bob_token = register_and_login(client, "bob")
    group = _create_group(client, alice_token, "Trio", [bob["id"]])

    resp = client.get(f"/conversations/{group['id']}", headers=auth_headers(bob_token))
    assert resp.status_code == 200
    body = resp.json()
    assert body["type"] == "group"
    assert body["name"] == "Trio"
    assert body["member_count"] == 2
    assert {p["user"]["username"] for p in body["participants"]} == {"alice", "bob"}


def test_non_member_cannot_view_group_details(client):
    alice, alice_token = register_and_login(client, "alice")
    bob, _ = register_and_login(client, "bob")
    _, outsider_token = register_and_login(client, "eve")
    group = _create_group(client, alice_token, "Trio", [bob["id"]])

    resp = client.get(f"/conversations/{group['id']}", headers=auth_headers(outsider_token))
    assert resp.status_code == 404


def test_group_member_roles_returned_correctly(client):
    alice, alice_token = register_and_login(client, "alice")
    bob, _ = register_and_login(client, "bob")
    group = _create_group(client, alice_token, "Trio", [bob["id"]])

    resp = client.get(f"/conversations/{group['id']}", headers=auth_headers(alice_token))
    roles = {p["user"]["username"]: p["role"] for p in resp.json()["participants"]}
    assert roles == {"alice": "admin", "bob": "member"}


def test_password_hash_never_appears_in_group_details(client):
    alice, alice_token = register_and_login(client, "alice")
    bob, _ = register_and_login(client, "bob")
    group = _create_group(client, alice_token, "Trio", [bob["id"]])

    resp = client.get(f"/conversations/{group['id']}", headers=auth_headers(alice_token))
    assert "password_hash" not in resp.text
    assert "password" not in resp.text.lower()


# --- add member (Part B) ---


def test_admin_can_add_member(client):
    alice, alice_token = register_and_login(client, "alice")
    bob, _ = register_and_login(client, "bob")
    carol, _ = register_and_login(client, "carol")
    group = _create_group(client, alice_token, "Trio", [carol["id"]])

    resp = client.post(f"/conversations/{group['id']}/members", json={"user_id": bob["id"]}, headers=auth_headers(alice_token))
    assert resp.status_code == 201
    body = resp.json()
    assert body["user"]["username"] == "bob"
    assert body["role"] == "member"


def test_normal_member_cannot_add_user(client):
    alice, alice_token = register_and_login(client, "alice")
    bob, bob_token = register_and_login(client, "bob")
    carol, _ = register_and_login(client, "carol")
    group = _create_group(client, alice_token, "Trio", [bob["id"]])

    resp = client.post(
        f"/conversations/{group['id']}/members", json={"user_id": carol["id"]}, headers=auth_headers(bob_token)
    )
    assert resp.status_code == 403


def test_add_nonexistent_user_rejected(client):
    alice, alice_token = register_and_login(client, "alice")
    bob, _ = register_and_login(client, "bob")
    group = _create_group(client, alice_token, "Trio", [bob["id"]])

    resp = client.post(
        f"/conversations/{group['id']}/members", json={"user_id": 999999}, headers=auth_headers(alice_token)
    )
    assert resp.status_code == 404


def test_direct_conversation_rejects_add_member(client):
    alice, alice_token = register_and_login(client, "alice")
    bob, _ = register_and_login(client, "bob")
    carol, _ = register_and_login(client, "carol")
    convo = _create_direct(client, alice_token, bob["id"])

    resp = client.post(
        f"/conversations/{convo['id']}/members", json={"user_id": carol["id"]}, headers=auth_headers(alice_token)
    )
    assert resp.status_code == 400


def test_duplicate_member_rejected(client):
    alice, alice_token = register_and_login(client, "alice")
    bob, _ = register_and_login(client, "bob")
    group = _create_group(client, alice_token, "Trio", [bob["id"]])

    resp = client.post(
        f"/conversations/{group['id']}/members", json={"user_id": bob["id"]}, headers=auth_headers(alice_token)
    )
    assert resp.status_code == 409


def test_added_user_becomes_member(client):
    alice, alice_token = register_and_login(client, "alice")
    bob, _ = register_and_login(client, "bob")
    carol, _ = register_and_login(client, "carol")
    group = _create_group(client, alice_token, "Trio", [carol["id"]])

    client.post(f"/conversations/{group['id']}/members", json={"user_id": bob["id"]}, headers=auth_headers(alice_token))
    assert _role(client, group["id"], bob["id"]) == "member"


def test_added_user_can_access_group(client):
    alice, alice_token = register_and_login(client, "alice")
    bob, bob_token = register_and_login(client, "bob")
    carol, _ = register_and_login(client, "carol")
    group = _create_group(client, alice_token, "Trio", [carol["id"]])

    client.post(f"/conversations/{group['id']}/members", json={"user_id": bob["id"]}, headers=auth_headers(alice_token))

    resp = client.get(f"/conversations/{group['id']}", headers=auth_headers(bob_token))
    assert resp.status_code == 200


def test_add_member_does_not_require_contact_relationship(client):
    """Part H: a group admin may add ANY registered user, contact or not —
    and adding must not silently create a Contact row as a side effect."""
    alice, alice_token = register_and_login(client, "alice")
    bob, _ = register_and_login(client, "bob")  # never added as a contact of alice's
    carol, _ = register_and_login(client, "carol")
    group = _create_group(client, alice_token, "Trio", [carol["id"]])

    resp = client.post(f"/conversations/{group['id']}/members", json={"user_id": bob["id"]}, headers=auth_headers(alice_token))
    assert resp.status_code == 201

    contacts = client.get("/contacts", headers=auth_headers(alice_token)).json()
    assert all(c["id"] != bob["id"] for c in contacts)


# --- remove member (Part C) ---


def test_admin_can_remove_member(client):
    alice, alice_token = register_and_login(client, "alice")
    bob, _ = register_and_login(client, "bob")
    group = _create_group(client, alice_token, "Trio", [bob["id"]])

    resp = client.delete(f"/conversations/{group['id']}/members/{bob['id']}", headers=auth_headers(alice_token))
    assert resp.status_code == 204
    assert _role(client, group["id"], bob["id"]) is None


def test_normal_member_cannot_remove_member(client):
    alice, alice_token = register_and_login(client, "alice")
    bob, bob_token = register_and_login(client, "bob")
    carol, _ = register_and_login(client, "carol")
    group = _create_group(client, alice_token, "Trio", [bob["id"], carol["id"]])

    resp = client.delete(f"/conversations/{group['id']}/members/{carol['id']}", headers=auth_headers(bob_token))
    assert resp.status_code == 403


def test_removing_nonexistent_member_rejected(client):
    alice, alice_token = register_and_login(client, "alice")
    bob, _ = register_and_login(client, "bob")
    eve, _ = register_and_login(client, "eve")
    group = _create_group(client, alice_token, "Trio", [bob["id"]])

    resp = client.delete(f"/conversations/{group['id']}/members/{eve['id']}", headers=auth_headers(alice_token))
    assert resp.status_code == 404


def test_removed_member_cannot_access_group(client):
    alice, alice_token = register_and_login(client, "alice")
    bob, bob_token = register_and_login(client, "bob")
    group = _create_group(client, alice_token, "Trio", [bob["id"]])

    client.delete(f"/conversations/{group['id']}/members/{bob['id']}", headers=auth_headers(alice_token))

    assert client.get(f"/conversations/{group['id']}", headers=auth_headers(bob_token)).status_code == 404
    assert client.get(f"/conversations/{group['id']}/messages", headers=auth_headers(bob_token)).status_code == 404
    resp = client.post(
        f"/conversations/{group['id']}/messages", json={"content": "hi"}, headers=auth_headers(bob_token)
    )
    assert resp.status_code == 404


def test_removed_member_cannot_send_messages_over_websocket(client, live_ws_url):
    alice, alice_token = register_and_login(client, "alice")
    bob, bob_token = register_and_login(client, "bob")
    group = _create_group(client, alice_token, "Trio", [bob["id"]])
    client.delete(f"/conversations/{group['id']}/members/{bob['id']}", headers=auth_headers(alice_token))

    async def body():
        bob_ws = await ws_connect_authenticated(live_ws_url, bob_token)
        try:
            await send_event(bob_ws, {"type": "send_message", "conversation_id": group["id"], "content": "hi"})
            resp = await recv_event(bob_ws)
            assert resp["type"] == "error"
            assert resp["code"] == "NOT_CONVERSATION_MEMBER"
        finally:
            await bob_ws.close()

    asyncio.run(body())


def test_removed_member_cannot_mark_read_over_websocket(client, live_ws_url):
    alice, alice_token = register_and_login(client, "alice")
    bob, bob_token = register_and_login(client, "bob")
    group = _create_group(client, alice_token, "Trio", [bob["id"]])
    client.delete(f"/conversations/{group['id']}/members/{bob['id']}", headers=auth_headers(alice_token))

    async def body():
        bob_ws = await ws_connect_authenticated(live_ws_url, bob_token)
        try:
            await send_event(bob_ws, {"type": "mark_read", "conversation_id": group["id"]})
            resp = await recv_event(bob_ws)
            assert resp["type"] == "error"
            assert resp["code"] == "NOT_CONVERSATION_MEMBER"
        finally:
            await bob_ws.close()

    asyncio.run(body())


def test_removed_member_cannot_send_typing_over_websocket(client, live_ws_url):
    alice, alice_token = register_and_login(client, "alice")
    bob, bob_token = register_and_login(client, "bob")
    group = _create_group(client, alice_token, "Trio", [bob["id"]])
    client.delete(f"/conversations/{group['id']}/members/{bob['id']}", headers=auth_headers(alice_token))

    async def body():
        bob_ws = await ws_connect_authenticated(live_ws_url, bob_token)
        try:
            await send_event(bob_ws, {"type": "typing_start", "conversation_id": group["id"]})
            resp = await recv_event(bob_ws)
            assert resp["type"] == "error"
            assert resp["code"] == "NOT_CONVERSATION_MEMBER"
        finally:
            await bob_ws.close()

    asyncio.run(body())


def test_historical_messages_remain_after_removal(client):
    alice, alice_token = register_and_login(client, "alice")
    bob, _ = register_and_login(client, "bob")
    group = _create_group(client, alice_token, "Trio", [bob["id"]])
    client.post(f"/conversations/{group['id']}/messages", json={"content": "before removal"}, headers=auth_headers(alice_token))

    client.delete(f"/conversations/{group['id']}/members/{bob['id']}", headers=auth_headers(alice_token))

    history = client.get(f"/conversations/{group['id']}/messages", headers=auth_headers(alice_token))
    assert history.status_code == 200
    assert any(m["content"] == "before removal" for m in history.json()["messages"])


def test_cannot_remove_final_remaining_admin(client):
    alice, alice_token = register_and_login(client, "alice")
    bob, _ = register_and_login(client, "bob")
    group = _create_group(client, alice_token, "Trio", [bob["id"]])

    resp = client.delete(f"/conversations/{group['id']}/members/{alice['id']}", headers=auth_headers(alice_token))
    assert resp.status_code == 400
    assert _role(client, group["id"], alice["id"]) == "admin"


def test_admin_can_remove_self_if_another_admin_remains(client):
    alice, alice_token = register_and_login(client, "alice")
    bob, _ = register_and_login(client, "bob")
    group = _create_group(client, alice_token, "Trio", [bob["id"]])
    client.patch(
        f"/conversations/{group['id']}/members/{bob['id']}", json={"role": "admin"}, headers=auth_headers(alice_token)
    )

    resp = client.delete(f"/conversations/{group['id']}/members/{alice['id']}", headers=auth_headers(alice_token))
    assert resp.status_code == 204
    assert _role(client, group["id"], bob["id"]) == "admin"


# --- admin role management (Part D) ---


def test_admin_can_promote_member(client):
    alice, alice_token = register_and_login(client, "alice")
    bob, _ = register_and_login(client, "bob")
    group = _create_group(client, alice_token, "Trio", [bob["id"]])

    resp = client.patch(
        f"/conversations/{group['id']}/members/{bob['id']}", json={"role": "admin"}, headers=auth_headers(alice_token)
    )
    assert resp.status_code == 200
    assert resp.json()["role"] == "admin"
    assert _role(client, group["id"], bob["id"]) == "admin"


def test_admin_can_demote_admin(client):
    alice, alice_token = register_and_login(client, "alice")
    bob, _ = register_and_login(client, "bob")
    group = _create_group(client, alice_token, "Trio", [bob["id"]])
    client.patch(f"/conversations/{group['id']}/members/{bob['id']}", json={"role": "admin"}, headers=auth_headers(alice_token))

    resp = client.patch(
        f"/conversations/{group['id']}/members/{bob['id']}", json={"role": "member"}, headers=auth_headers(alice_token)
    )
    assert resp.status_code == 200
    assert _role(client, group["id"], bob["id"]) == "member"


def test_final_admin_demotion_rejected(client):
    alice, alice_token = register_and_login(client, "alice")
    bob, _ = register_and_login(client, "bob")
    group = _create_group(client, alice_token, "Trio", [bob["id"]])

    resp = client.patch(
        f"/conversations/{group['id']}/members/{alice['id']}", json={"role": "member"}, headers=auth_headers(alice_token)
    )
    assert resp.status_code == 400
    assert _role(client, group["id"], alice["id"]) == "admin"


def test_non_admin_cannot_change_roles(client):
    alice, alice_token = register_and_login(client, "alice")
    bob, bob_token = register_and_login(client, "bob")
    carol, _ = register_and_login(client, "carol")
    group = _create_group(client, alice_token, "Trio", [bob["id"], carol["id"]])

    resp = client.patch(
        f"/conversations/{group['id']}/members/{carol['id']}", json={"role": "admin"}, headers=auth_headers(bob_token)
    )
    assert resp.status_code == 403


def test_role_update_rejects_arbitrary_value(client):
    alice, alice_token = register_and_login(client, "alice")
    bob, _ = register_and_login(client, "bob")
    group = _create_group(client, alice_token, "Trio", [bob["id"]])

    resp = client.patch(
        f"/conversations/{group['id']}/members/{bob['id']}", json={"role": "owner"}, headers=auth_headers(alice_token)
    )
    assert resp.status_code == 422
    assert _role(client, group["id"], bob["id"]) == "member"


# --- rename (Part E) ---


def test_admin_can_rename_group(client):
    alice, alice_token = register_and_login(client, "alice")
    bob, _ = register_and_login(client, "bob")
    group = _create_group(client, alice_token, "Old Name", [bob["id"]])

    resp = client.patch(f"/conversations/{group['id']}", json={"name": "New Name"}, headers=auth_headers(alice_token))
    assert resp.status_code == 200
    assert resp.json()["name"] == "New Name"


def test_normal_member_cannot_rename(client):
    alice, alice_token = register_and_login(client, "alice")
    bob, bob_token = register_and_login(client, "bob")
    group = _create_group(client, alice_token, "Old Name", [bob["id"]])

    resp = client.patch(f"/conversations/{group['id']}", json={"name": "Hacked"}, headers=auth_headers(bob_token))
    assert resp.status_code == 403


def test_empty_name_rejected(client):
    alice, alice_token = register_and_login(client, "alice")
    bob, _ = register_and_login(client, "bob")
    group = _create_group(client, alice_token, "Old Name", [bob["id"]])

    resp = client.patch(f"/conversations/{group['id']}", json={"name": "   "}, headers=auth_headers(alice_token))
    assert resp.status_code == 422


def test_rename_trims_whitespace(client):
    alice, alice_token = register_and_login(client, "alice")
    bob, _ = register_and_login(client, "bob")
    group = _create_group(client, alice_token, "Old Name", [bob["id"]])

    resp = client.patch(f"/conversations/{group['id']}", json={"name": "  Padded  "}, headers=auth_headers(alice_token))
    assert resp.status_code == 200
    assert resp.json()["name"] == "Padded"


def test_direct_conversation_cannot_be_renamed(client):
    alice, alice_token = register_and_login(client, "alice")
    bob, _ = register_and_login(client, "bob")
    convo = _create_direct(client, alice_token, bob["id"])

    resp = client.patch(f"/conversations/{convo['id']}", json={"name": "New Name"}, headers=auth_headers(alice_token))
    assert resp.status_code == 400


# --- websocket group_updated (Part N/Q) ---


def test_group_updated_reaches_current_members(client, live_ws_url):
    alice, alice_token = register_and_login(client, "alice")
    bob, bob_token = register_and_login(client, "bob")
    group = _create_group(client, alice_token, "Trio", [bob["id"]])

    async def body():
        bob_ws = await ws_connect_authenticated(live_ws_url, bob_token)
        try:
            resp = client.patch(
                f"/conversations/{group['id']}", json={"name": "Renamed"}, headers=auth_headers(alice_token)
            )
            assert resp.status_code == 200
            event = await recv_event(bob_ws)
            assert event == {"type": "group_updated", "conversation_id": group["id"]}
        finally:
            await bob_ws.close()

    asyncio.run(body())


def test_non_members_do_not_receive_group_updated(client, live_ws_url):
    alice, alice_token = register_and_login(client, "alice")
    bob, _ = register_and_login(client, "bob")
    _, outsider_token = register_and_login(client, "eve")
    group = _create_group(client, alice_token, "Trio", [bob["id"]])

    async def body():
        outsider_ws = await ws_connect_authenticated(live_ws_url, outsider_token)
        try:
            resp = client.patch(
                f"/conversations/{group['id']}", json={"name": "Renamed"}, headers=auth_headers(alice_token)
            )
            assert resp.status_code == 200
            # Nothing group-related should arrive — prove it via a same-connection
            # self-probe rather than an indefinite wait.
            await outsider_ws.send(json.dumps({"type": "fly_to_the_moon"}))
            resp2 = await recv_event(outsider_ws)
            assert resp2["code"] == "UNKNOWN_EVENT_TYPE"
        finally:
            await outsider_ws.close()

    asyncio.run(body())


def test_removed_member_receives_final_group_updated(client, live_ws_url):
    alice, alice_token = register_and_login(client, "alice")
    bob, bob_token = register_and_login(client, "bob")
    group = _create_group(client, alice_token, "Trio", [bob["id"]])

    async def body():
        bob_ws = await ws_connect_authenticated(live_ws_url, bob_token)
        try:
            resp = client.delete(f"/conversations/{group['id']}/members/{bob['id']}", headers=auth_headers(alice_token))
            assert resp.status_code == 204
            event = await recv_event(bob_ws)
            assert event == {"type": "group_updated", "conversation_id": group["id"]}
        finally:
            await bob_ws.close()

    asyncio.run(body())


def test_removed_member_receives_no_further_group_broadcasts(client, live_ws_url):
    alice, alice_token = register_and_login(client, "alice")
    bob, bob_token = register_and_login(client, "bob")
    group = _create_group(client, alice_token, "Trio", [bob["id"]])

    async def body():
        bob_ws = await ws_connect_authenticated(live_ws_url, bob_token)
        try:
            client.delete(f"/conversations/{group['id']}/members/{bob['id']}", headers=auth_headers(alice_token))
            await recv_event(bob_ws)  # the removal's own group_updated ping

            # A second mutation (rename) must NOT reach bob — he's gone now.
            client.patch(f"/conversations/{group['id']}", json={"name": "Renamed Again"}, headers=auth_headers(alice_token))
            await bob_ws.send(json.dumps({"type": "fly_to_the_moon"}))
            resp = await recv_event(bob_ws)
            assert resp["code"] == "UNKNOWN_EVENT_TYPE"
        finally:
            await bob_ws.close()

    asyncio.run(body())


def test_membership_changes_persist_after_reconnect(client, live_ws_url):
    alice, alice_token = register_and_login(client, "alice")
    bob, bob_token = register_and_login(client, "bob")
    group = _create_group(client, alice_token, "Trio", [bob["id"]])
    client.delete(f"/conversations/{group['id']}/members/{bob['id']}", headers=auth_headers(alice_token))

    async def body():
        bob_ws = await ws_connect_authenticated(live_ws_url, bob_token)
        try:
            await send_event(bob_ws, {"type": "mark_read", "conversation_id": group["id"]})
            resp = await recv_event(bob_ws)
            assert resp["code"] == "NOT_CONVERSATION_MEMBER"
        finally:
            await bob_ws.close()

    asyncio.run(body())
    assert client.get(f"/conversations/{group['id']}", headers=auth_headers(bob_token)).status_code == 404
