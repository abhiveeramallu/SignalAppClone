"""Creates all tables from the SQLAlchemy models. Run directly or import init_db()."""

from app.db.base_class import Base
from app.db.session import engine
from app.models import *  # noqa: F401,F403  (populates Base.metadata)


def init_db() -> None:
    Base.metadata.create_all(bind=engine)


if __name__ == "__main__":
    init_db()
    print("Database initialized.")
