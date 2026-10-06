from tests.helpers import auth_headers, register_and_login


def test_search_requires_auth(client):
    resp = client.get("/users/search?q=bob")
    assert resp.status_code == 401


def test_authenticated_user_can_search(client):
    _, alice_token = register_and_login(client, "alice")
    register_and_login(client, "bob")

    resp = client.get("/users/search?q=bob", headers=auth_headers(alice_token))
    assert resp.status_code == 200
    usernames = [u["username"] for u in resp.json()]
    assert usernames == ["bob"]


def test_current_user_excluded_from_results(client):
    alice, alice_token = register_and_login(client, "alice")

    resp = client.get("/users/search?q=alice", headers=auth_headers(alice_token))
    assert resp.status_code == 200
    assert resp.json() == []


def test_username_search_matches(client):
    _, alice_token = register_and_login(client, "alice")
    bob, _ = register_and_login(client, "bob")

    resp = client.get("/users/search?q=bob", headers=auth_headers(alice_token))
    ids = [u["id"] for u in resp.json()]
    assert bob["id"] in ids


def test_display_name_search_matches(client):
    _, alice_token = register_and_login(client, "alice")
    carol, _ = register_and_login(client, "carol", display_name="Carol Davis")

    resp = client.get("/users/search?q=Davis", headers=auth_headers(alice_token))
    ids = [u["id"] for u in resp.json()]
    assert carol["id"] in ids


def test_search_is_case_insensitive(client):
    _, alice_token = register_and_login(client, "alice")
    bob, _ = register_and_login(client, "bob", display_name="Bob Smith")

    resp = client.get("/users/search?q=BOB", headers=auth_headers(alice_token))
    ids = [u["id"] for u in resp.json()]
    assert bob["id"] in ids

    resp2 = client.get("/users/search?q=smith", headers=auth_headers(alice_token))
    ids2 = [u["id"] for u in resp2.json()]
    assert bob["id"] in ids2


def test_search_results_are_capped(client):
    _, alice_token = register_and_login(client, "alice")
    for i in range(25):
        register_and_login(client, f"searchuser{i}", display_name=f"Search User {i}")

    resp = client.get("/users/search?q=searchuser", headers=auth_headers(alice_token))
    assert resp.status_code == 200
    assert len(resp.json()) == 20


def test_empty_query_returns_no_results(client):
    _, alice_token = register_and_login(client, "alice")
    register_and_login(client, "bob")

    resp = client.get("/users/search?q=", headers=auth_headers(alice_token))
    assert resp.status_code == 200
    assert resp.json() == []


def test_password_hash_never_returned(client):
    _, alice_token = register_and_login(client, "alice")
    register_and_login(client, "bob")

    resp = client.get("/users/search?q=bob", headers=auth_headers(alice_token))
    assert "password_hash" not in resp.text
    assert "password" not in resp.text.lower()


def test_search_results_shape_is_safe(client):
    _, alice_token = register_and_login(client, "alice")
    register_and_login(client, "bob", phone_number="+15559990001")

    resp = client.get("/users/search?q=bob", headers=auth_headers(alice_token))
    body = resp.json()[0]
    assert set(body.keys()) == {"id", "username", "display_name", "avatar_url", "is_online", "last_seen_at"}
