from pydantic import BaseModel, Field, field_validator

from app.schemas.common import UTCDatetime
from app.schemas.users import UserSummary

VALID_ROLES = {"member", "admin"}


class LastMessagePreview(BaseModel):
    content: str
    message_type: str = "text"
    attachment_filename: str | None = None
    created_at: UTCDatetime


class ConversationPreviewResponse(BaseModel):
    id: int
    type: str
    name: str | None
    avatar_url: str | None
    other_user: UserSummary | None = None  # direct conversations only
    member_count: int | None = None  # group conversations only
    last_message: LastMessagePreview | None
    unread_count: int


class ParticipantResponse(BaseModel):
    user: UserSummary
    role: str


class ConversationDetailResponse(BaseModel):
    id: int
    type: str
    name: str | None
    avatar_url: str | None
    other_user: UserSummary | None = None  # direct conversations only
    participants: list[ParticipantResponse] | None = None  # group conversations only
    member_count: int | None = None  # group conversations only
    created_at: UTCDatetime


class DirectConversationCreate(BaseModel):
    user_id: int


class GroupConversationCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    member_ids: list[int] = Field(default_factory=list)

    @field_validator("name")
    @classmethod
    def _name_not_blank(cls, value: str) -> str:
        trimmed = value.strip()
        if not trimmed:
            raise ValueError("name cannot be empty")
        return trimmed

    @field_validator("member_ids")
    @classmethod
    def _require_at_least_one_member(cls, value: list[int]) -> list[int]:
        if not value:
            raise ValueError("A group needs at least one other member")
        return value


class AddMemberRequest(BaseModel):
    user_id: int


class MemberRoleUpdate(BaseModel):
    role: str

    @field_validator("role")
    @classmethod
    def _role_must_be_known(cls, value: str) -> str:
        if value not in VALID_ROLES:
            raise ValueError(f"role must be one of {sorted(VALID_ROLES)}")
        return value


class ConversationUpdate(BaseModel):
    """PATCH /conversations/{id} — group-only fields. Both optional so a
    caller can update just the name, just the avatar, or both in one call;
    at least one must be provided (enforced in the route, not here, since
    that's a cross-field rule)."""

    name: str | None = Field(default=None, max_length=255)
    avatar_url: str | None = Field(default=None, max_length=500)

    @field_validator("name")
    @classmethod
    def _name_not_blank(cls, value: str | None) -> str | None:
        if value is None:
            return value
        trimmed = value.strip()
        if not trimmed:
            raise ValueError("name cannot be empty")
        return trimmed
