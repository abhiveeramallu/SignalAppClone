from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base_class import Base


class MessageStatus(Base):
    """Per-recipient delivery state for a message (sent/delivered/read).
    One row per (message, recipient) — not written for the sender themself,
    since 'sending/sent' for the sender is a client/server-ack concern, not a
    per-recipient receipt."""

    __tablename__ = "message_status"
    __table_args__ = (
        UniqueConstraint("message_id", "user_id", name="uq_status_message_user"),
        CheckConstraint("status IN ('sent', 'delivered', 'read')", name="ck_status_value"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    message_id: Mapped[int] = mapped_column(ForeignKey("messages.id"), nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(10), nullable=False, default="sent")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now(), nullable=False
    )

    message: Mapped["Message"] = relationship(back_populates="statuses")
    user: Mapped["User"] = relationship(back_populates="message_statuses")

    def __repr__(self) -> str:
        return f"<MessageStatus message_id={self.message_id} user_id={self.user_id} status={self.status!r}>"
