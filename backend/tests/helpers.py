from fastapi.testclient import TestClient


def register_and_login(client: TestClient, username: str, password: str = "testpass123", **kwargs) -> tuple[dict, str]:
    payload = {
        "username": username,
        "display_name": kwargs.pop("display_name", username.capitalize()),
        "password": password,
        "phone_number": kwargs.pop("phone_number", None),
        "avatar_url": kwargs.pop("avatar_url", None),
    }
    payload.update(kwargs)

    register_resp = client.post("/auth/register", json=payload)
    assert register_resp.status_code == 201, register_resp.text
    user = register_resp.json()

    login_resp = client.post("/auth/login", json={"username": username, "password": password})
    assert login_resp.status_code == 200, login_resp.text
    token = login_resp.json()["access_token"]

    return user, token


def auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}
