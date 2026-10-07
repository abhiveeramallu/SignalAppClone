"""Regression coverage for the UTC-labeling fix in app/schemas/common.py.

Every datetime this API returns is stored naive-but-UTC (see that module's
own docstring for why) — these tests assert the JSON boundary always makes
that explicit with a trailing "Z", and that REST and WebSocket paths produce
byte-identical timestamp strings for the same message."""

import asyncio
import re

from tests.helpers import auth_headers, register_and_login
from tests.ws_live_helpers import recv_event, send_event, ws_connect_authenticated

UTC_ISO_RE = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$")


def _create_direct(client, token, other_user_id):
    resp = client.post("/conversations/direct", json={"user_id": other_user_id}, headers=auth_headers(token))
    assert resp.status_code in (200, 201)
    return resp.json()


def test_message_created_at_is_explicit_utc(client):
    alice, alice_token = register_and_login(client, "alice")
    bob, _ = register_and_login(client, "bob")
    conversation = _create_direct(client, alice_token, bob["id"])

    resp = client.post(
        f"/conversations/{conversation['id']}/messages",
        json={"content": "hello"},
        headers=auth_headers(alice_token),
    )
    assert resp.status_code == 201
    created_at = resp.json()["created_at"]
    assert UTC_ISO_RE.match(created_at), f"expected a Z-suffixed UTC timestamp, got {created_at!r}"


def test_rest_history_timestamp_is_explicit_utc(client):
    alice, alice_token = register_and_login(client, "alice")
    bob, _ = register_and_login(client, "bob")
    conversation = _create_direct(client, alice_token, bob["id"])
    client.post(
        f"/conversations/{conversation['id']}/messages", json={"content": "hi"}, headers=auth_headers(alice_token)
    )

    history = client.get(f"/conversations/{conversation['id']}/messages", headers=auth_headers(alice_token))
    created_at = history.json()["messages"][0]["created_at"]
    assert UTC_ISO_RE.match(created_at)


def test_conversation_preview_timestamp_is_explicit_utc(client):
    alice, alice_token = register_and_login(client, "alice")
    bob, _ = register_and_login(client, "bob")
    conversation = _create_direct(client, alice_token, bob["id"])
    client.post(
        f"/conversations/{conversation['id']}/messages", json={"content": "hi"}, headers=auth_headers(alice_token)
    )

    previews = client.get("/conversations", headers=auth_headers(alice_token)).json()
    created_at = previews[0]["last_message"]["created_at"]
    assert UTC_ISO_RE.match(created_at)


def test_user_timestamps_are_explicit_utc(client):
    _, alice_token = register_and_login(client, "alice")
    me = client.get("/auth/me", headers=auth_headers(alice_token)).json()
    assert UTC_ISO_RE.match(me["created_at"])


def test_rest_and_websocket_timestamps_match_for_the_same_message(client, live_ws_url):
    """The same message, read once via the WebSocket push and once via REST
    history, must report the exact same created_at string — proving there's
    only one timestamp-formatting path, not two that could drift."""
    alice, alice_token = register_and_login(client, "alice")
    bob, bob_token = register_and_login(client, "bob")
    conversation = _create_direct(client, alice_token, bob["id"])

    async def body():
        alice_ws = await ws_connect_authenticated(live_ws_url, alice_token)
        try:
            await send_event(
                alice_ws, {"type": "send_message", "conversation_id": conversation["id"], "content": "ping"}
            )
            event = await recv_event(alice_ws)
            assert event["type"] == "new_message"
            return event["message"]["created_at"]
        finally:
            await alice_ws.close()

    ws_created_at = asyncio.run(body())
    assert UTC_ISO_RE.match(ws_created_at)

    history = client.get(f"/conversations/{conversation['id']}/messages", headers=auth_headers(alice_token))
    rest_created_at = history.json()["messages"][-1]["created_at"]

    assert ws_created_at == rest_created_at


def test_refresh_does_not_change_the_displayed_timestamp(client):
    """Not a frontend re-render test (no frontend here) — the backend-side
    half of that guarantee: fetching the same message's history twice must
    return byte-identical created_at strings, so nothing is being
    recomputed/reformatted differently per request."""
    alice, alice_token = register_and_login(client, "alice")
    bob, _ = register_and_login(client, "bob")
    conversation = _create_direct(client, alice_token, bob["id"])
    client.post(
        f"/conversations/{conversation['id']}/messages", json={"content": "hi"}, headers=auth_headers(alice_token)
    )

    first = client.get(f"/conversations/{conversation['id']}/messages", headers=auth_headers(alice_token))
    second = client.get(f"/conversations/{conversation['id']}/messages", headers=auth_headers(alice_token))
    assert first.json()["messages"][0]["created_at"] == second.json()["messages"][0]["created_at"]
