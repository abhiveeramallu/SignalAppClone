from sqlalchemy.orm import Session

from app.models import Conversation, ConversationParticipant, Message, MessageStatus, User

MAX_MESSAGE_LENGTH = 4000

_STATUS_RANK = {"sent": 0, "delivered": 1, "read": 2}


class MessageValidationError(ValueError):
    """Content failed validation (empty/whitespace-only/too long). A ValueError
    subclass so Pydantic's field_validator (REST path) can raise it directly
    and have it turn into a normal 422 — the WebSocket path catches it explicitly."""


def validate_message_content(raw_content: str) -> str:
    trimmed = raw_content.strip()  # leading/trailing only — internal whitespace is kept
    if not trimmed:
        raise MessageValidationError("Message content cannot be empty or whitespace-only")
    if len(trimmed) > MAX_MESSAGE_LENGTH:
        raise MessageValidationError(f"Message content cannot exceed {MAX_MESSAGE_LENGTH} characters")
    return trimmed


def resolve_status_for_viewer(message: Message, statuses: list[MessageStatus], viewer_id: int) -> str:
    """Status shown to `viewer_id` for this message. The sender sees the
    worst-case status across all recipients (the single/double-tick
    convention); a recipient sees their own status row."""
    if message.sender_id == viewer_id:
        if not statuses:
            return "sent"
        return min((s.status for s in statuses), key=lambda value: _STATUS_RANK[value])

    own_status = next((s for s in statuses if s.user_id == viewer_id), None)
    return own_status.status if own_status else "sent"


def resolve_sender_aggregate_status(db: Session, message_id: int) -> str | None:
    """Loads the message + its current status rows and returns the aggregate
    the SENDER should see right now. Used after a delivery ack or a read
    event to push the sender a value consistent with what REST would
    compute — not just the single recipient row that just changed, which can
    be ahead of other recipients still on an earlier status (e.g. a group
    where only one of several members has delivered/read so far)."""
    message = db.get(Message, message_id)
    if message is None:
        return None
    statuses = db.query(MessageStatus).filter(MessageStatus.message_id == message_id).all()
    return resolve_status_for_viewer(message, statuses, message.sender_id)


def update_message_status(db: Session, message_id: int, user_id: int, new_status: str) -> MessageStatus | None:
    """Monotonic transition for ONE recipient's status row: sent -> delivered
    -> read only, never backward. Returns the updated row, or None if there's
    no such row (message_id, user_id) or the requested status is not strictly
    forward of the current one (a silent no-op, not an error — e.g. acking
    delivery on an already-read message just confirms what's already true)."""
    row = (
        db.query(MessageStatus)
        .filter(MessageStatus.message_id == message_id, MessageStatus.user_id == user_id)
        .first()
    )
    if row is None:
        return None
    if _STATUS_RANK[new_status] <= _STATUS_RANK[row.status]:
        return None
    row.status = new_status
    db.commit()
    db.refresh(row)
    return row


def create_message(
    db: Session, conversation: Conversation, sender: User, content: str
) -> tuple[Message, list[MessageStatus]]:
    """Persists one Message + a 'sent' MessageStatus row for every OTHER
    participant (direct or group — no branch needed, both use the same
    conversation_participants rows). Shared by the REST POST endpoint and the
    WebSocket send_message handler so both behave identically. Commits before
    returning: callers must not respond/broadcast until this returns."""
    trimmed_content = validate_message_content(content)

    message = Message(conversation_id=conversation.id, sender_id=sender.id, content=trimmed_content)
    db.add(message)
    db.flush()  # assigns message.id

    recipient_ids = [
        row.user_id
        for row in db.query(ConversationParticipant.user_id)
        .filter(
            ConversationParticipant.conversation_id == conversation.id,
            ConversationParticipant.user_id != sender.id,
        )
        .all()
    ]
    statuses = [MessageStatus(message_id=message.id, user_id=uid, status="sent") for uid in recipient_ids]
    db.add_all(statuses)

    db.commit()
    db.refresh(message)

    return message, statuses
