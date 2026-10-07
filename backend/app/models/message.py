from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base_class import Base


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[int] = mapped_column(primary_key=True)
    conversation_id: Mapped[int] = mapped_column(ForeignKey("conversations.id"), nullable=False, index=True)
    sender_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False, index=True)

    # Attachment fields — null for an ordinary text message. A file message
    # still carries `content` (used as an optional caption; may be empty).
    # Kept as plain nullable columns on Message rather than a separate
    # Attachment table: the relationship is always exactly one-to-one (one
    # file per message, no multi-attachment support in this assignment), so
    # a join on every message-history read would buy nothing.
    message_type: Mapped[str] = mapped_column(String(10), nullable=False, server_default="text")
    attachment_filename: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # Server-generated stored filename (random, collision-safe) — never the
    # client-supplied original name, which is never used as a path.
    attachment_path: Mapped[str | None] = mapped_column(String(255), nullable=True)
    attachment_mime_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    attachment_size: Mapped[int | None] = mapped_column(Integer, nullable=True)

    conversation: Mapped["Conversation"] = relationship(back_populates="messages")
    sender: Mapped["User"] = relationship(back_populates="sent_messages")
    statuses: Mapped[list["MessageStatus"]] = relationship(
        back_populates="message", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Message id={self.id} conversation_id={self.conversation_id} sender_id={self.sender_id}>"
