from datetime import datetime, timezone
from typing import Annotated

from pydantic import PlainSerializer

# Every datetime column in this app is written via server_default=func.now()
# (SQLite's CURRENT_TIMESTAMP, which is UTC) or, where set from Python,
# datetime.now(timezone.utc) with tzinfo stripped before assignment (see
# websocket/endpoint.py) — so every value read back out of the database is a
# *naive* datetime that nonetheless always represents UTC. Pydantic's default
# datetime serialization just calls .isoformat() on that naive value, which
# produces a string with NO timezone marker (e.g. "2026-10-07T09:15:30").
# JavaScript's `new Date(...)` parses a timezone-less ISO string as the
# browser's LOCAL time, not UTC — silently shifting every displayed timestamp
# by the viewer's UTC offset. This serializer is the fix: it explicitly
# labels the value as UTC (a trailing "Z") on the way out, so every API
# response is unambiguous regardless of which timezone reads it.
def _serialize_utc(value: datetime) -> str:
    aware = value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)
    return aware.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


UTCDatetime = Annotated[datetime, PlainSerializer(_serialize_utc, return_type=str)]
