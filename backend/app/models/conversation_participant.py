from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base_class import Base


class ConversationParticipant(Base):
    """Membership row. For 'direct' conversations both rows are role='member';
    for 'group' conversations role distinguishes admins who can add/remove members."""

    __tablename__ = "conversation_participants"
    __table_args__ = (
        UniqueConstraint("conversation_id", "user_id", name="uq_participant_conv_user"),
        CheckConstraint("role IN ('member', 'admin')", name="ck_participant_role"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    conversation_id: Mapped[int] = mapped_column(ForeignKey("conversations.id"), nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    role: Mapped[str] = mapped_column(String(10), nullable=False, default="member")
    joined_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)

    conversation: Mapped["Conversation"] = relationship(back_populates="participants")
    user: Mapped["User"] = relationship(back_populates="participations")

    def __repr__(self) -> str:
        return f"<ConversationParticipant conversation_id={self.conversation_id} user_id={self.user_id} role={self.role!r}>"
