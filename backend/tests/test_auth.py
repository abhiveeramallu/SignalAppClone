from datetime import datetime, timedelta, timezone

import jwt

from app.core.config import settings
from app.core.security import hash_password
from app.db.seed import DEV_SEED_PASSWORD
from app.models import User


def _register(client, username="alice", phone_number="+15550001234", password="hunter22pass"):
    return client.post(
        "/auth/register",
        json={
            "username": username,
            "phone_number": phone_number,
            "display_name": "Test User",
            "password": password,
            "avatar_url": None,
        },
    )


def _expired_token(user_id: int) -> str:
    now = datetime.now(timezone.utc)
    payload = {"sub": str(user_id), "iat": now - timedelta(minutes=10), "exp": now - timedelta(minutes=5)}
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


# A. register a new user
def test_register_new_user(client):
    resp = _register(client)
    assert resp.status_code == 201
    body = resp.json()
    assert body["username"] == "alice"
    assert body["phone_number"] == "+15550001234"
    assert "id" in body


# B. duplicate username rejected
def test_duplicate_username_rejected(client):
    _register(client, username="alice", phone_number="+15550001111")
    resp = _register(client, username="alice", phone_number="+15550002222")
    assert resp.status_code == 409


# C. duplicate phone number rejected
def test_duplicate_phone_rejected(client):
    _register(client, username="alice", phone_number="+15550001234")
    resp = _register(client, username="someoneelse", phone_number="+15550001234")
    assert resp.status_code == 409


# D. password stored hashed, not plaintext
def test_password_stored_hashed(client):
    _register(client, username="alice", password="hunter22pass")
    db = client.db_sessionmaker()
    try:
        user = db.query(User).filter_by(username="alice").first()
        assert user.password_hash != "hunter22pass"
        assert user.password_hash.startswith("$2b$")  # bcrypt
    finally:
        db.close()


# E. login with correct password succeeds
def test_login_correct_password_succeeds(client):
    _register(client, username="alice", password="hunter22pass")
    resp = client.post("/auth/login", json={"username": "alice", "password": "hunter22pass"})
    assert resp.status_code == 200
    assert "access_token" in resp.json()


# F. login with incorrect password fails
def test_login_incorrect_password_fails(client):
    _register(client, username="alice", password="hunter22pass")
    resp = client.post("/auth/login", json={"username": "alice", "password": "wrongpass"})
    assert resp.status_code == 401


# G. JWT is returned with correct shape
def test_login_returns_jwt(client):
    _register(client, username="alice", password="hunter22pass")
    resp = client.post("/auth/login", json={"username": "alice", "password": "hunter22pass"})
    body = resp.json()
    assert body["token_type"] == "bearer"
    decoded = jwt.decode(body["access_token"], settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
    assert "sub" in decoded and "exp" in decoded


# H. GET /auth/me with valid JWT succeeds
def test_me_with_valid_token_succeeds(client):
    _register(client, username="alice", password="hunter22pass")
    token = client.post("/auth/login", json={"username": "alice", "password": "hunter22pass"}).json()["access_token"]
    resp = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert resp.json()["username"] == "alice"


# I. GET /auth/me without JWT fails
def test_me_without_token_fails(client):
    resp = client.get("/auth/me")
    assert resp.status_code == 401


# J. GET /auth/me with invalid JWT fails
def test_me_with_invalid_token_fails(client):
    resp = client.get("/auth/me", headers={"Authorization": "Bearer not-a-real-token"})
    assert resp.status_code == 401


# K. GET /auth/me with expired JWT fails
def test_me_with_expired_token_fails(client):
    reg = _register(client, username="alice", password="hunter22pass")
    user_id = reg.json()["id"]
    token = _expired_token(user_id)
    resp = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 401


# L. JWT subject maps to the correct user
def test_jwt_subject_maps_to_correct_user(client):
    reg = _register(client, username="alice", password="hunter22pass")
    user_id = reg.json()["id"]
    token = client.post("/auth/login", json={"username": "alice", "password": "hunter22pass"}).json()["access_token"]
    decoded = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
    assert int(decoded["sub"]) == user_id
    me = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"}).json()
    assert me["id"] == user_id


# M. password_hash never present in API responses
def test_password_hash_never_in_responses(client):
    reg = _register(client, username="alice", password="hunter22pass")
    assert "password_hash" not in reg.json()
    token = client.post("/auth/login", json={"username": "alice", "password": "hunter22pass"}).json()["access_token"]
    me = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert "password_hash" not in me.json()


# N. seeded-style users can authenticate with their documented dev password
def test_seeded_style_user_can_login_with_dev_password(client):
    db = client.db_sessionmaker()
    try:
        user = User(
            username="alice",
            phone_number="+15550000001",
            display_name="Alice Johnson",
            password_hash=hash_password(DEV_SEED_PASSWORD),
        )
        db.add(user)
        db.commit()
    finally:
        db.close()

    resp = client.post("/auth/login", json={"username": "alice", "password": DEV_SEED_PASSWORD})
    assert resp.status_code == 200
    assert "access_token" in resp.json()
