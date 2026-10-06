from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session, joinedload

from app.core.deps import get_conversation_for_member, get_current_user
from app.db.session import get_db
from app.models import Conversation, Message, MessageStatus, User
from app.schemas.messages import MessageCreate, MessagePage, MessageResponse, MessageSender
from app.services.message_service import create_message, resolve_status_for_viewer

router = APIRouter()

DEFAULT_LIMIT = 50
MAX_LIMIT = 100


@router.get("", response_model=MessagePage)
def get_message_history(
    conversation: Conversation = Depends(get_conversation_for_member),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    limit: int = Query(DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    before_id: int | None = Query(None, description="Return messages older than this message id"),
):
    query = db.query(Message).filter(Message.conversation_id == conversation.id)

    if before_id is not None:
        cursor_message = db.get(Message, before_id)
        if cursor_message is None or cursor_message.conversation_id != conversation.id:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Invalid pagination cursor")

        # Compare against the cursor row's OWN stored created_at via a scalar
        # subquery, not a Python-bound datetime literal. SQLite stores
        # DateTime as TEXT; a server-generated timestamp (CURRENT_TIMESTAMP,
        # no microseconds) and a round-tripped Python datetime (always
        # serialized WITH microseconds) format differently as text, so
        # comparing Message.created_at directly against cursor_message's
        # Python datetime silently breaks both '<' and '=' for same-second
        # rows. Re-selecting the cursor's own column value keeps both sides
        # in the same stored format.
        cursor_created_at = db.query(Message.created_at).filter(Message.id == before_id).scalar_subquery()
        query = query.filter(
            or_(
                Message.created_at < cursor_created_at,
                and_(Message.created_at == cursor_created_at, Message.id < before_id),
            )
        )

    # Walk newest-first so LIMIT gives the most recent page; fetch one extra
    # row to know has_more without a separate COUNT query; then flip to the
    # oldest->newest order the response actually returns.
    rows = (
        query.options(joinedload(Message.sender))
        .order_by(Message.created_at.desc(), Message.id.desc())
        .limit(limit + 1)
        .all()
    )
    has_more = len(rows) > limit
    page_rows = rows[:limit]
    page_rows.reverse()

    message_ids = [m.id for m in page_rows]
    statuses_by_message: dict[int, list[MessageStatus]] = defaultdict(list)
    if message_ids:
        for s in db.query(MessageStatus).filter(MessageStatus.message_id.in_(message_ids)).all():
            statuses_by_message[s.message_id].append(s)

    messages = [
        MessageResponse(
            id=m.id,
            conversation_id=m.conversation_id,
            sender=MessageSender.model_validate(m.sender),
            content=m.content,
            created_at=m.created_at,
            status=resolve_status_for_viewer(m, statuses_by_message.get(m.id, []), current_user.id),
        )
        for m in page_rows
    ]

    next_cursor = page_rows[0].id if has_more and page_rows else None
    return MessagePage(messages=messages, has_more=has_more, next_cursor=next_cursor)


@router.post("", response_model=MessageResponse, status_code=status.HTTP_201_CREATED)
def send_message(
    payload: MessageCreate,
    conversation: Conversation = Depends(get_conversation_for_member),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Shared with the WebSocket send_message handler — same persistence,
    # same recipient-status creation, same rules, in one place.
    message, statuses = create_message(db, conversation, current_user, payload.content)

    return MessageResponse(
        id=message.id,
        conversation_id=message.conversation_id,
        sender=MessageSender.model_validate(current_user),
        content=message.content,
        created_at=message.created_at,
        status=resolve_status_for_viewer(message, statuses, current_user.id),
    )
