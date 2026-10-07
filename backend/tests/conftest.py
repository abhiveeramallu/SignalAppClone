import socket
import sys
import threading
import time
from pathlib import Path

import pytest
import uvicorn
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import app.models  # noqa: F401 — populates Base.metadata before create_all
from app.core.config import settings
from app.db.base_class import Base
from app.db.session import get_db
from app.main import app
from app.websocket.manager import manager as ws_manager


@pytest.fixture(autouse=True)
def _reset_websocket_manager():
    """`ws_manager` is a process-wide singleton (by design — a single
    FastAPI process needs exactly one). But every test gets a fresh,
    isolated SQLite file where autoincrement IDs restart from 1, so
    "alice" is user_id=1 in nearly every WebSocket test — without this
    reset, a connection object left registered from a previous test can
    collide with the same key in a later test. If that stale connection's
    underlying portal has already been torn down, awaiting send_json() on
    it hangs indefinitely instead of raising, which silently wedges an
    unrelated later test rather than failing the test that leaked it."""
    ws_manager._connections.clear()
    yield
    ws_manager._connections.clear()


@pytest.fixture()
def client(tmp_path, monkeypatch):
    """Isolated SQLite file per test — never touches the dev signal_clone.db.
    Uploaded-file storage is redirected to this test's own tmp_path the same
    way — a test that uploads a file must never write into the real dev
    backend/uploads/ directory."""
    monkeypatch.setattr(settings, "uploads_dir", tmp_path / "uploads")
    db_path = tmp_path / "test.db"
    engine = create_engine(f"sqlite:///{db_path}", connect_args={"check_same_thread": False})

    @event.listens_for(engine, "connect")
    def _enable_fk(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    testing_session_local = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)

    def override_get_db():
        db = testing_session_local()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    test_client = TestClient(app)
    test_client.db_sessionmaker = testing_session_local  # type: ignore[attr-defined]
    yield test_client
    app.dependency_overrides.clear()


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@pytest.fixture()
def live_ws_url(client):
    """Runs the real app on a real uvicorn server in a background thread,
    bound to the SAME isolated test database as `client` (same `app` object,
    so the same app.dependency_overrides apply).

    Needed specifically for tests that must observe a server-initiated
    WebSocket push triggered from within a DIFFERENT connection's own
    event-handling task (delivery acks, read receipts, typing) — Starlette's
    TestClient drives WebSockets through a synchronous-to-async bridge that
    reproducibly deadlocks on exactly that pattern (one connection's
    background task awaiting a send into another connection's queue), even
    though the identical scenario works correctly against a real server —
    confirmed with a standalone reproduction script against both before
    writing this fixture. Plain request/response and single-connection
    broadcast-to-self-and-others cases (e.g. send_message) are unaffected
    and keep using the ordinary `client` TestClient fixture.
    """
    port = _free_port()
    config = uvicorn.Config(app=app, host="127.0.0.1", port=port, log_level="warning")
    server = uvicorn.Server(config)

    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()

    for _ in range(100):
        if server.started:
            break
        time.sleep(0.05)
    else:
        raise RuntimeError("live test server did not start in time")

    yield f"ws://127.0.0.1:{port}/ws"

    server.should_exit = True
    thread.join(timeout=5)
