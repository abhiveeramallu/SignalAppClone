import io

from app.core.config import settings
from tests.helpers import auth_headers, register_and_login


def _create_direct(client, token, other_user_id):
    resp = client.post("/conversations/direct", json={"user_id": other_user_id}, headers=auth_headers(token))
    assert resp.status_code in (200, 201)
    return resp.json()


def _upload(client, token, filename="photo.png", content=b"\x89PNG fake bytes", content_type="image/png"):
    return client.post(
        "/uploads",
        files={"file": (filename, io.BytesIO(content), content_type)},
        headers=auth_headers(token),
    )


# --- upload endpoint ---


def test_authenticated_upload_succeeds(client):
    _, token = register_and_login(client, "alice")
    resp = _upload(client, token)
    assert resp.status_code == 201
    body = resp.json()
    assert body["attachment_filename"] == "photo.png"
    assert body["attachment_mime_type"] == "image/png"
    assert body["attachment_size"] == len(b"\x89PNG fake bytes")
    assert body["attachment_path"]  # server-generated stored name


def test_upload_requires_auth(client):
    resp = client.post("/uploads", files={"file": ("photo.png", io.BytesIO(b"x"), "image/png")})
    assert resp.status_code == 401


def test_upload_rejects_disallowed_extension(client):
    _, token = register_and_login(client, "alice")
    resp = _upload(client, token, filename="virus.exe", content=b"MZ", content_type="application/octet-stream")
    assert resp.status_code == 400


def test_upload_rejects_mismatched_mime_type(client):
    """Extension says .png but the declared Content-Type doesn't match any
    MIME allowed for that extension — must be rejected, not trusted."""
    _, token = register_and_login(client, "alice")
    resp = _upload(client, token, filename="photo.png", content_type="application/octet-stream")
    assert resp.status_code == 400


def test_upload_rejects_oversized_file(client, monkeypatch):
    monkeypatch.setattr(settings, "max_upload_size_bytes", 10)
    _, token = register_and_login(client, "alice")
    resp = _upload(client, token, content=b"x" * 1000)
    assert resp.status_code == 413


def test_upload_filename_never_used_as_a_path(client):
    """A filename containing path-traversal segments must not escape
    uploads_dir — the stored name is always server-generated, never derived
    from client input."""
    _, token = register_and_login(client, "alice")
    resp = _upload(client, token, filename="../../etc/evil.txt", content=b"hi", content_type="text/plain")
    assert resp.status_code == 201
    stored = resp.json()["attachment_path"]
    assert "/" not in stored and ".." not in stored
    assert (settings.uploads_dir / stored).resolve().parent == settings.uploads_dir.resolve()


# --- file messages ---


def test_file_message_persists(client):
    alice, alice_token = register_and_login(client, "alice")
    bob, _ = register_and_login(client, "bob")
    conversation = _create_direct(client, alice_token, bob["id"])
    uploaded = _upload(client, alice_token).json()

    resp = client.post(
        f"/conversations/{conversation['id']}/messages",
        json={
            "content": "",
            "message_type": "file",
            "attachment_filename": uploaded["attachment_filename"],
            "attachment_path": uploaded["attachment_path"],
            "attachment_mime_type": uploaded["attachment_mime_type"],
            "attachment_size": uploaded["attachment_size"],
        },
        headers=auth_headers(alice_token),
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["message_type"] == "file"
    assert body["attachment_filename"] == "photo.png"
    assert body["attachment_url"] == f"/uploads/{body['id']}"

    history = client.get(f"/conversations/{conversation['id']}/messages", headers=auth_headers(alice_token))
    messages = history.json()["messages"]
    assert messages[-1]["message_type"] == "file"
    assert messages[-1]["attachment_filename"] == "photo.png"


def test_file_message_requires_a_real_upload(client):
    alice, alice_token = register_and_login(client, "alice")
    bob, _ = register_and_login(client, "bob")
    conversation = _create_direct(client, alice_token, bob["id"])

    resp = client.post(
        f"/conversations/{conversation['id']}/messages",
        json={
            "content": "",
            "message_type": "file",
            "attachment_filename": "fake.png",
            "attachment_path": "does-not-exist.png",
            "attachment_mime_type": "image/png",
            "attachment_size": 10,
        },
        headers=auth_headers(alice_token),
    )
    assert resp.status_code == 400


def test_attachment_cannot_be_reused_across_messages(client):
    alice, alice_token = register_and_login(client, "alice")
    bob, _ = register_and_login(client, "bob")
    conversation = _create_direct(client, alice_token, bob["id"])
    uploaded = _upload(client, alice_token).json()
    payload = {
        "content": "",
        "message_type": "file",
        "attachment_filename": uploaded["attachment_filename"],
        "attachment_path": uploaded["attachment_path"],
        "attachment_mime_type": uploaded["attachment_mime_type"],
        "attachment_size": uploaded["attachment_size"],
    }

    first = client.post(
        f"/conversations/{conversation['id']}/messages", json=payload, headers=auth_headers(alice_token)
    )
    assert first.status_code == 201

    second = client.post(
        f"/conversations/{conversation['id']}/messages", json=payload, headers=auth_headers(alice_token)
    )
    assert second.status_code == 400


# --- attachment download authorization ---


def test_unauthorized_attachment_access_rejected(client):
    alice, alice_token = register_and_login(client, "alice")
    bob, _ = register_and_login(client, "bob")
    _, eve_token = register_and_login(client, "eve")  # not a participant
    conversation = _create_direct(client, alice_token, bob["id"])
    uploaded = _upload(client, alice_token).json()
    sent = client.post(
        f"/conversations/{conversation['id']}/messages",
        json={
            "content": "",
            "message_type": "file",
            "attachment_filename": uploaded["attachment_filename"],
            "attachment_path": uploaded["attachment_path"],
            "attachment_mime_type": uploaded["attachment_mime_type"],
            "attachment_size": uploaded["attachment_size"],
        },
        headers=auth_headers(alice_token),
    ).json()

    resp = client.get(f"/uploads/{sent['id']}", headers=auth_headers(eve_token))
    assert resp.status_code == 404


def test_authorized_attachment_access_succeeds(client):
    alice, alice_token = register_and_login(client, "alice")
    bob, bob_token = register_and_login(client, "bob")
    conversation = _create_direct(client, alice_token, bob["id"])
    file_bytes = b"\x89PNG real-enough bytes"
    uploaded = _upload(client, alice_token, content=file_bytes).json()
    sent = client.post(
        f"/conversations/{conversation['id']}/messages",
        json={
            "content": "",
            "message_type": "file",
            "attachment_filename": uploaded["attachment_filename"],
            "attachment_path": uploaded["attachment_path"],
            "attachment_mime_type": uploaded["attachment_mime_type"],
            "attachment_size": uploaded["attachment_size"],
        },
        headers=auth_headers(alice_token),
    ).json()

    # Both the sender and the recipient (both participants) can download it.
    for token in (alice_token, bob_token):
        resp = client.get(f"/uploads/{sent['id']}", headers=auth_headers(token))
        assert resp.status_code == 200
        assert resp.content == file_bytes


def test_download_rejects_unauthenticated(client):
    alice, alice_token = register_and_login(client, "alice")
    bob, _ = register_and_login(client, "bob")
    conversation = _create_direct(client, alice_token, bob["id"])
    uploaded = _upload(client, alice_token).json()
    sent = client.post(
        f"/conversations/{conversation['id']}/messages",
        json={
            "content": "",
            "message_type": "file",
            "attachment_filename": uploaded["attachment_filename"],
            "attachment_path": uploaded["attachment_path"],
            "attachment_mime_type": uploaded["attachment_mime_type"],
            "attachment_size": uploaded["attachment_size"],
        },
        headers=auth_headers(alice_token),
    ).json()

    resp = client.get(f"/uploads/{sent['id']}")
    assert resp.status_code == 401


def test_download_of_text_message_returns_404(client):
    """A plain text message has no attachment — asking for one at its id must
    404, not error."""
    alice, alice_token = register_and_login(client, "alice")
    bob, _ = register_and_login(client, "bob")
    conversation = _create_direct(client, alice_token, bob["id"])
    sent = client.post(
        f"/conversations/{conversation['id']}/messages",
        json={"content": "just text"},
        headers=auth_headers(alice_token),
    ).json()

    resp = client.get(f"/uploads/{sent['id']}", headers=auth_headers(alice_token))
    assert resp.status_code == 404
