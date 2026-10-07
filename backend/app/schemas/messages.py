from pydantic import BaseModel, ConfigDict, field_validator, model_validator

from app.schemas.common import UTCDatetime
from app.services.message_service import validate_message_content


class MessageCreate(BaseModel):
    # extra="forbid" so a client-supplied sender_id/status/etc. is a 422, not
    # a silently-ignored field — sender and status are server-controlled only.
    model_config = ConfigDict(extra="forbid")

    content: str = ""
    message_type: str = "text"
    # Set only for message_type == "file" — the stored filename returned by
    # POST /uploads for a file this same user just uploaded. Never trusted as
    # a filesystem path (see routers/uploads.py); re-validated to actually
    # exist on disk before a message is created from it.
    attachment_filename: str | None = None
    attachment_path: str | None = None
    attachment_mime_type: str | None = None
    attachment_size: int | None = None

    @field_validator("message_type")
    @classmethod
    def _validate_message_type(cls, value: str) -> str:
        if value not in ("text", "file"):
            raise ValueError("message_type must be 'text' or 'file'")
        return value

    @field_validator("content")
    @classmethod
    def _trim_content(cls, value: str) -> str:
        return value.strip()

    @model_validator(mode="after")
    def _validate_shape(self) -> "MessageCreate":
        if self.message_type == "text":
            # Same validation the WebSocket send_message handler uses (via
            # message_service.create_message) — one rule set, not two.
            self.content = validate_message_content(self.content)
        else:
            if not self.attachment_path or not self.attachment_filename:
                raise ValueError("A file message requires attachment_path and attachment_filename")
        return self


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
    message_type: str
    attachment_filename: str | None
    attachment_mime_type: str | None
    attachment_size: int | None
    # Authenticated-download path, not a static file URL — the client must
    # send its own bearer token to GET this (see routers/uploads.py).
    attachment_url: str | None
    created_at: UTCDatetime
    status: str


class MessagePage(BaseModel):
    messages: list[MessageResponse]
    has_more: bool
    next_cursor: int | None
