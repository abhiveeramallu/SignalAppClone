from datetime import datetime

from pydantic import BaseModel, ConfigDict, field_validator

from app.services.message_service import validate_message_content


class MessageCreate(BaseModel):
    # extra="forbid" so a client-supplied sender_id/status/etc. is a 422, not
    # a silently-ignored field — sender and status are server-controlled only.
    model_config = ConfigDict(extra="forbid")

    content: str

    @field_validator("content")
    @classmethod
    def _validate_content(cls, value: str) -> str:
        # Same validation the WebSocket send_message handler uses (via
        # message_service.create_message) — one rule set, not two.
        return validate_message_content(value)


class MessageSender(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    display_name: str
    avatar_url: str | None


class MessageResponse(BaseModel):
    id: int
    conversation_id: int
    sender: MessageSender
    content: str
    created_at: datetime
    status: str


class MessagePage(BaseModel):
    messages: list[MessageResponse]
    has_more: bool
    next_cursor: int | None
