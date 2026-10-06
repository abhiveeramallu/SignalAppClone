from tests.helpers import auth_headers, register_and_login


def test_list_contacts_requires_auth(client):
    resp = client.get("/contacts")
    assert resp.status_code == 401


def test_list_contacts_empty_initially(client):
    _, token = register_and_login(client, "alice")
    resp = client.get("/contacts", headers=auth_headers(token))
    assert resp.status_code == 200
    assert resp.json() == []


def test_add_contact(client):
    _, alice_token = register_and_login(client, "alice")
    bob, _ = register_and_login(client, "bob")

    resp = client.post(f"/contacts/{bob['id']}", headers=auth_headers(alice_token))
    assert resp.status_code == 201
    body = resp.json()
    assert body["id"] == bob["id"]
    assert body["username"] == "bob"

    list_resp = client.get("/contacts", headers=auth_headers(alice_token))
    assert [c["username"] for c in list_resp.json()] == ["bob"]


def test_cannot_add_self(client):
    alice, token = register_and_login(client, "alice")
    resp = client.post(f"/contacts/{alice['id']}", headers=auth_headers(token))
    assert resp.status_code == 400


def test_cannot_add_nonexistent_user(client):
    _, token = register_and_login(client, "alice")
    resp = client.post("/contacts/999999", headers=auth_headers(token))
    assert resp.status_code == 404


def test_duplicate_contact_rejected(client):
    _, alice_token = register_and_login(client, "alice")
    bob, _ = register_and_login(client, "bob")

    first = client.post(f"/contacts/{bob['id']}", headers=auth_headers(alice_token))
    assert first.status_code == 201
    second = client.post(f"/contacts/{bob['id']}", headers=auth_headers(alice_token))
    assert second.status_code == 409


def test_remove_contact(client):
    _, alice_token = register_and_login(client, "alice")
    bob, _ = register_and_login(client, "bob")

    client.post(f"/contacts/{bob['id']}", headers=auth_headers(alice_token))
    remove_resp = client.delete(f"/contacts/{bob['id']}", headers=auth_headers(alice_token))
    assert remove_resp.status_code == 204

    list_resp = client.get("/contacts", headers=auth_headers(alice_token))
    assert list_resp.json() == []


def test_remove_nonexistent_contact_returns_404(client):
    _, alice_token = register_and_login(client, "alice")
    bob, _ = register_and_login(client, "bob")

    resp = client.delete(f"/contacts/{bob['id']}", headers=auth_headers(alice_token))
    assert resp.status_code == 404


def test_removing_contact_does_not_delete_conversation(client):
    _, alice_token = register_and_login(client, "alice")
    bob, _ = register_and_login(client, "bob")

    client.post(f"/contacts/{bob['id']}", headers=auth_headers(alice_token))
    convo_resp = client.post(
        "/conversations/direct", json={"user_id": bob["id"]}, headers=auth_headers(alice_token)
    )
    assert convo_resp.status_code == 201
    conversation_id = convo_resp.json()["id"]

    client.delete(f"/contacts/{bob['id']}", headers=auth_headers(alice_token))

    get_resp = client.get(f"/conversations/{conversation_id}", headers=auth_headers(alice_token))
    assert get_resp.status_code == 200
