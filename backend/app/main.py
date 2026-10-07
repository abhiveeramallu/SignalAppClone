from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.db.init_db import init_db
from app.db.seed import seed
from app.db.session import get_db
from app.routers import auth, contacts, conversations, messages, uploads, users
from app.websocket import endpoint as websocket_endpoint


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Ensures the schema exists and demo data is present on every startup —
    required on an ephemeral filesystem (e.g. Render), where nothing has
    necessarily ever run `python -m app.db.init_db` / `seed` ahead of time.
    Both steps are idempotent (create_all is CREATE TABLE IF NOT EXISTS;
    seed() no-ops once any user row exists), so this is safe to run
    unconditionally on every startup without duplicating data or touching
    an existing database's contents.

    Resolved through app.dependency_overrides exactly like the WebSocket
    endpoint's _db_session() does, rather than importing the engine/session
    directly — so under the test suite (which overrides get_db with an
    isolated per-test database) this binds to that isolated database
    instead of the real signal_clone.db, keeping existing test isolation
    intact even for tests that run a real uvicorn server (and therefore a
    real startup lifespan) against this same app object.

    Seeding specifically is skipped whenever get_db is overridden (i.e.
    we're under test): a test's isolated database is legitimately empty
    right as its own server starts, not because it's a fresh deployment —
    seeding it here would inject alice/bob/carol/dave/erin ahead of the
    test's own register_and_login("alice") calls and collide (409) on the
    same usernames. Table creation is unconditional and harmless either
    way (create_all is idempotent, and the test fixture already creates
    its own tables directly besides).
    """
    settings.database_path.parent.mkdir(parents=True, exist_ok=True)
    settings.uploads_dir.mkdir(parents=True, exist_ok=True)

    under_test = get_db in app.dependency_overrides
    db_dependency = app.dependency_overrides.get(get_db, get_db)
    generator = db_dependency()
    db = next(generator)
    try:
        init_db(engine=db.get_bind())
        if not under_test:
            seed(db)
    finally:
        next(generator, None)  # resumes the generator past `yield`, running its own `finally: db.close()`

    yield


app = FastAPI(title=settings.app_name, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(contacts.router, prefix="/contacts", tags=["contacts"])
app.include_router(users.router, prefix="/users", tags=["users"])
app.include_router(conversations.router, prefix="/conversations", tags=["conversations"])
app.include_router(
    messages.router, prefix="/conversations/{conversation_id}/messages", tags=["messages"]
)
app.include_router(uploads.router, prefix="/uploads", tags=["uploads"])
app.include_router(websocket_endpoint.router, tags=["websocket"])


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
