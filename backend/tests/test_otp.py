from app.models import User
from tests.helpers import auth_headers, register_and_login

OTP_PAYLOAD = {
    "username": "alice",
    "phone_number": "+15550009999",
    "display_name": "Alice Johnson",
    "password": "hunter22pass",
    "avatar_url": None,
}


def _verify(client, otp="1234", **overrides):
    payload = {**OTP_PAYLOAD, **overrides, "otp": otp}
    return client.post("/auth/register/verify-otp", json=payload)


def test_request_otp_returns_fixed_dev_code(client):
    resp = client.post("/auth/register/request-otp", json={"username": "alice"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["dev_otp"] == "1234"
    assert "message" in body


def test_request_otp_does_not_require_existing_user(client):
    # Stateless mock — nothing is looked up or created by this step.
    resp = client.post("/auth/register/request-otp", json={"phone_number": "+15550000000"})
    assert resp.status_code == 200


def test_correct_otp_completes_registration(client):
    resp = _verify(client, otp="1234")
    assert resp.status_code == 201
    body = resp.json()
    assert body["username"] == "alice"
    assert "otp" not in body
    assert "password_hash" not in body

    db = client.db_sessionmaker()
    try:
        assert db.query(User).filter_by(username="alice").count() == 1
    finally:
        db.close()


def test_wrong_otp_rejected(client):
    resp = _verify(client, otp="0000")
    assert resp.status_code == 400


def test_empty_otp_rejected(client):
    resp = _verify(client, otp="")
    assert resp.status_code == 422  # fails min_length=4 validation


def test_wrong_otp_does_not_create_user(client):
    _verify(client, otp="9999")
    db = client.db_sessionmaker()
    try:
        assert db.query(User).filter_by(username="alice").count() == 0
    finally:
        db.close()


def test_missing_otp_field_rejected(client):
    payload = dict(OTP_PAYLOAD)
    resp = client.post("/auth/register/verify-otp", json=payload)
    assert resp.status_code == 422
    db = client.db_sessionmaker()
    try:
        assert db.query(User).filter_by(username="alice").count() == 0
    finally:
        db.close()


def test_successful_verification_allows_login_afterward(client):
    verify_resp = _verify(client, otp="1234")
    assert verify_resp.status_code == 201

    login_resp = client.post("/auth/login", json={"username": "alice", "password": "hunter22pass"})
    assert login_resp.status_code == 200
    token = login_resp.json()["access_token"]

    me_resp = client.get("/auth/me", headers=auth_headers(token))
    assert me_resp.status_code == 200
    assert me_resp.json()["username"] == "alice"


def test_otp_does_not_bypass_duplicate_username_check(client):
    _verify(client, otp="1234")
    second = _verify(client, otp="1234", phone_number="+15550001111")
    assert second.status_code == 409


def test_plain_register_endpoint_still_works_without_otp(client):
    """Regression: the original /auth/register path (used by every other
    test fixture in this suite) must remain completely untouched."""
    user, token = register_and_login(client, "bob")
    assert user["username"] == "bob"
    resp = client.get("/auth/me", headers=auth_headers(token))
    assert resp.status_code == 200


def test_existing_users_unaffected_by_otp_feature(client):
    """A user created the ordinary way (no OTP involved at all) logs in and
    uses the app exactly as before."""
    _, token = register_and_login(client, "carol")
    resp = client.get("/contacts", headers=auth_headers(token))
    assert resp.status_code == 200
