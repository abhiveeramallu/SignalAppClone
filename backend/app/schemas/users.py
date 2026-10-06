from datetime import datetime

from pydantic import BaseModel, ConfigDict


class UserSummary(BaseModel):
    """Public-facing user profile fields. Used for both a contacts-list entry
    and a conversation's 'other_user' — same shape in both places."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    display_name: str
    avatar_url: str | None
    is_online: bool
    last_seen_at: datetime | None
