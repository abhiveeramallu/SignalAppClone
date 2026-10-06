from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base_class import Base


class Contact(Base):
    """One user's saved contact. Directional: A adding B does not imply B has A."""

    __tablename__ = "contacts"
    __table_args__ = (
        UniqueConstraint("owner_id", "contact_user_id", name="uq_contact_owner_contact"),
        CheckConstraint("owner_id != contact_user_id", name="ck_contact_not_self"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    contact_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)

    owner: Mapped["User"] = relationship(foreign_keys=[owner_id], back_populates="contacts")
    contact_user: Mapped["User"] = relationship(foreign_keys=[contact_user_id])

    def __repr__(self) -> str:
        return f"<Contact owner_id={self.owner_id} contact_user_id={self.contact_user_id}>"
