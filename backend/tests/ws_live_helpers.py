"""Async WebSocket helpers for tests that run against the `live_ws_url`
fixture (see conftest.py for why plain TestClient isn't used for these)."""

import asyncio
import json

import websockets


async def ws_connect_authenticated(url: str, token: str):
    ws = await websockets.connect(url)
    await ws.send(json.dumps({"type": "authenticate", "token": token}))
    ack = json.loads(await ws.recv())
    assert ack == {"type": "authenticated", "user_id": ack["user_id"]}
    return ws


async def send_event(ws, payload: dict) -> None:
    await ws.send(json.dumps(payload))


async def recv_event(ws, timeout: float = 5.0) -> dict:
    return json.loads(await asyncio.wait_for(ws.recv(), timeout=timeout))
