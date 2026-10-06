from collections import defaultdict
from collections.abc import Iterable

from fastapi import WebSocket


class ConnectionManager:
    """Tracks active WebSocket connections per user, in-process only (a single
    FastAPI process is all this assignment needs — no Redis/external pub-sub).
    A user can have several connections at once (multiple tabs/devices), so
    each user maps to a SET of sockets, not a single one."""

    def __init__(self) -> None:
        self._connections: dict[int, set[WebSocket]] = defaultdict(set)

    def connect(self, user_id: int, websocket: WebSocket) -> None:
        self._connections[user_id].add(websocket)

    def disconnect(self, user_id: int, websocket: WebSocket) -> None:
        connections = self._connections.get(user_id)
        if not connections:
            return
        connections.discard(websocket)
        if not connections:
            del self._connections[user_id]

    def connection_count(self, user_id: int) -> int:
        return len(self._connections.get(user_id, ()))

    async def send_to_user(self, user_id: int, event: dict) -> None:
        for websocket in list(self._connections.get(user_id, ())):
            try:
                await websocket.send_json(event)
            except Exception:
                # A broken socket shouldn't take the rest of the broadcast
                # down — its own receive loop will disconnect() it separately.
                pass

    async def broadcast_to_users(self, user_ids: Iterable[int], event: dict) -> None:
        for user_id in user_ids:
            await self.send_to_user(user_id, event)


manager = ConnectionManager()
