"""Creates all tables from the SQLAlchemy models. Run directly or import init_db()."""

from sqlalchemy.engine import Engine

from app.db.base_class import Base
from app.db.session import engine as _default_engine
from app.models import *  # noqa: F401,F403  (populates Base.metadata)


def init_db(engine: Engine | None = None) -> None:
    """create_all uses CREATE TABLE IF NOT EXISTS semantics (checkfirst=True
    by default) — safe to call on an empty database or one that already has
    tables; never drops or recreates anything. `engine` defaults to the
    real app engine (unchanged CLI behavior below); callers that need a
    different bind — e.g. app startup honoring a test's dependency-injected
    database — pass one in explicitly."""
    Base.metadata.create_all(bind=engine or _default_engine)


if __name__ == "__main__":
    init_db()
    print("Database initialized.")
