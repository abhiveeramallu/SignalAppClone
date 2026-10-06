"""Cross-cutting checks from the Step 5 security review: unauthenticated
access and password_hash leakage across both the contacts and conversations
routers (not just one of them)."""

from tests.helpers import auth_headers, register_and_login


def test_conversations_endpoints_require_auth(client):
    assert client.get("/conversations").status_code == 401
    assert client.post("/conversations/direct", json={"user_id": 1}).status_code == 401
    assert client.post("/conversations/group", json={"name": "X", "member_ids": []}).status_code == 401
    assert client.get("/conversations/1").status_code == 401


def test_password_hash_never_leaks_from_contacts_or_conversations(client):
    alice, alice_token = register_and_login(client, "alice")
    bob, _ = register_and_login(client, "bob")

    add_resp = client.post(f"/contacts/{bob['id']}", headers=auth_headers(alice_token))
    assert "password_hash" not in add_resp.json()

    list_resp = client.get("/contacts", headers=auth_headers(alice_token))
    assert all("password_hash" not in c for c in list_resp.json())

    convo_resp = client.post(
        "/conversations/direct", json={"user_id": bob["id"]}, headers=auth_headers(alice_token)
    )
    assert "password_hash" not in convo_resp.json()["other_user"]

    detail_resp = client.get(f"/conversations/{convo_resp.json()['id']}", headers=auth_headers(alice_token))
    assert "password_hash" not in detail_resp.json()["other_user"]

    group_resp = client.post(
        "/conversations/group",
        json={"name": "Group", "member_ids": [bob["id"]]},
        headers=auth_headers(alice_token),
    )
    group_detail = client.get(f"/conversations/{group_resp.json()['id']}", headers=auth_headers(alice_token))
    for participant in group_detail.json()["participants"]:
        assert "password_hash" not in participant["user"]
