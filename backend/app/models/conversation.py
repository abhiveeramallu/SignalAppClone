from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base_class import Base


def compute_direct_key(user_id_a: int, user_id_b: int) -> str:
    """Deterministic key for a 1:1 pair, order-independent, used to dedupe direct conversations."""
    lo, hi = sorted((user_id_a, user_id_b))
    return f"{lo}_{hi}"


class Conversation(Base):
    __tablename__ = "conversations"
    __table_args__ = (
        CheckConstraint("type IN ('direct', 'group')", name="ck_conversation_type"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    type: Mapped[str] = mapped_column(String(10), nullable=False)
    name: Mapped[str | None] = mapped_column(String(255), nullable=True)  # group only
    avatar_url: Mapped[str | None] = mapped_column(String(500), nullable=True)  # group only

    # NULL for group conversations. SQLite/SQL treat NULLs as distinct under
    # UNIQUE, so multiple groups can have direct_key=NULL while direct chats
    # are still deduped by this constraint.
    direct_key: Mapped[str | None] = mapped_column(String(50), unique=True, nullable=True, index=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    # Bumped whenever a new message lands; drives "sorted by most recent activity".
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)

    participants: Mapped[list["ConversationParticipant"]] = relationship(
        back_populates="conversation", cascade="all, delete-orphan"
    )
    messages: Mapped[list["Message"]] = relationship(
        back_populates="conversation", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Conversation id={self.id} type={self.type!r} name={self.name!r}>"
