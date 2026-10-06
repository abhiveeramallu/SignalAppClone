from datetime import datetime

from sqlalchemy import Boolean, DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base_class import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    phone_number: Mapped[str | None] = mapped_column(String(20), unique=True, nullable=True)
    display_name: Mapped[str] = mapped_column(String(100), nullable=False)
    avatar_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)

    # Live-tracked from the WebSocket connection manager (see
    # app/websocket/endpoint.py) — set true/false on actual connect/disconnect,
    # not a static or client-only value. Seed data gives it a starting value.
    is_online: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)

    contacts: Mapped[list["Contact"]] = relationship(
        foreign_keys="Contact.owner_id", back_populates="owner", cascade="all, delete-orphan"
    )
    participations: Mapped[list["ConversationParticipant"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    sent_messages: Mapped[list["Message"]] = relationship(back_populates="sender")
    message_statuses: Mapped[list["MessageStatus"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<User id={self.id} username={self.username!r}>"
