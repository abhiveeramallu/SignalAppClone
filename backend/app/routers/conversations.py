from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import and_, func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.core.deps import get_conversation_for_member, get_current_user, get_group_admin
from app.db.session import get_db
from app.models import Conversation, ConversationParticipant, Message, MessageStatus, User
from app.models.conversation import compute_direct_key
from app.schemas.conversations import (
    AddMemberRequest,
    ConversationDetailResponse,
    ConversationPreviewResponse,
    ConversationUpdate,
    DirectConversationCreate,
    GroupConversationCreate,
    LastMessagePreview,
    MemberRoleUpdate,
    ParticipantResponse,
)
from app.schemas.users import UserSummary
from app.websocket.manager import manager

router = APIRouter()


def _member_ids(db: Session, conversation_id: int) -> list[int]:
    return [
        row.user_id
        for row in db.query(ConversationParticipant.user_id)
        .filter(ConversationParticipant.conversation_id == conversation_id)
        .all()
    ]


def _admin_count(db: Session, conversation_id: int) -> int:
    return (
        db.query(func.count(ConversationParticipant.id))
        .filter(ConversationParticipant.conversation_id == conversation_id, ConversationParticipant.role == "admin")
        .scalar()
    )


def _group_updated_event(conversation_id: int) -> dict:
    """Deliberately minimal (Part N): just enough for a client to know which
    conversation to refetch. No member data, no roles — GET /conversations/{id}
    is the one source of truth for membership state, never duplicated here."""
    return {"type": "group_updated", "conversation_id": conversation_id}


def _build_preview(db: Session, conversation: Conversation, current_user: User) -> ConversationPreviewResponse:
    """Builds a preview for ONE conversation with a few small queries. Used by the
    create endpoints (a single conversation at a time) — intentionally NOT used by
    list_conversations below, which batches the same work across all conversations
    to avoid running this per row."""
    participants = (
        db.query(ConversationParticipant)
        .filter(ConversationParticipant.conversation_id == conversation.id)
        .options(joinedload(ConversationParticipant.user))
        .all()
    )
    last_message = (
        db.query(Message)
        .filter(Message.conversation_id == conversation.id)
        .order_by(Message.created_at.desc())
        .first()
    )
    read_message_ids = db.query(MessageStatus.message_id).filter(
        MessageStatus.user_id == current_user.id, MessageStatus.status == "read"
    )
    unread_count = (
        db.query(func.count(Message.id))
        .filter(
            Message.conversation_id == conversation.id,
            Message.sender_id != current_user.id,
            ~Message.id.in_(read_message_ids),
        )
        .scalar()
        or 0
    )

    name = conversation.name
    avatar_url = conversation.avatar_url
    other_user = None
    member_count = None
    if conversation.type == "direct":
        other = next((p.user for p in participants if p.user_id != current_user.id), None)
        if other is not None:
            other_user = UserSummary.model_validate(other)
            name = other.display_name
            avatar_url = other.avatar_url
    else:
        member_count = len(participants)

    return ConversationPreviewResponse(
        id=conversation.id,
        type=conversation.type,
        name=name,
        avatar_url=avatar_url,
        other_user=other_user,
        member_count=member_count,
        last_message=(
            LastMessagePreview(
                content=last_message.content,
                message_type=last_message.message_type,
                attachment_filename=last_message.attachment_filename,
                created_at=last_message.created_at,
            )
            if last_message
            else None
        ),
        unread_count=unread_count,
    )


@router.get("", response_model=list[ConversationPreviewResponse])
def list_conversations(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    conversation_ids = [
        row.conversation_id
        for row in db.query(ConversationParticipant.conversation_id)
        .filter(ConversationParticipant.user_id == current_user.id)
        .all()
    ]
    if not conversation_ids:
        return []

    conversations = db.query(Conversation).filter(Conversation.id.in_(conversation_ids)).all()

    # Latest message per conversation: join each message against a
    # per-conversation MAX(created_at) subquery, so only messages that ARE the
    # latest in their conversation survive the join. One query for every
    # conversation, instead of one query per conversation.
    latest_marker = (
        db.query(
            Message.conversation_id.label("conversation_id"),
            func.max(Message.created_at).label("max_created_at"),
        )
        .filter(Message.conversation_id.in_(conversation_ids))
        .group_by(Message.conversation_id)
        .subquery()
    )
    latest_messages = (
        db.query(Message)
        .join(
            latest_marker,
            and_(
                Message.conversation_id == latest_marker.c.conversation_id,
                Message.created_at == latest_marker.c.max_created_at,
            ),
        )
        .all()
    )
    last_message_by_conversation: dict[int, Message] = {}
    for m in latest_messages:
        # setdefault: if two messages somehow tie on created_at, keep the first.
        last_message_by_conversation.setdefault(m.conversation_id, m)

    # Unread = sent by someone else, and this user has no 'read' status row
    # for it. Grouped per conversation in one query rather than counting per
    # conversation in a loop.
    read_message_ids = db.query(MessageStatus.message_id).filter(
        MessageStatus.user_id == current_user.id, MessageStatus.status == "read"
    )
    unread_rows = (
        db.query(Message.conversation_id, func.count(Message.id).label("unread_count"))
        .filter(
            Message.conversation_id.in_(conversation_ids),
            Message.sender_id != current_user.id,
            ~Message.id.in_(read_message_ids),
        )
        .group_by(Message.conversation_id)
        .all()
    )
    unread_by_conversation = {row.conversation_id: row.unread_count for row in unread_rows}

    # All participants for all these conversations in one query; joinedload
    # avoids a lazy per-participant lookup when reading p.user below.
    participants = (
        db.query(ConversationParticipant)
        .filter(ConversationParticipant.conversation_id.in_(conversation_ids))
        .options(joinedload(ConversationParticipant.user))
        .all()
    )
    participants_by_conversation: dict[int, list[ConversationParticipant]] = defaultdict(list)
    for p in participants:
        participants_by_conversation[p.conversation_id].append(p)

    dated_previews: list[tuple] = []
    for conv in conversations:
        last_message = last_message_by_conversation.get(conv.id)
        conv_participants = participants_by_conversation.get(conv.id, [])

        name = conv.name
        avatar_url = conv.avatar_url
        other_user = None
        member_count = None
        if conv.type == "direct":
            other = next((p.user for p in conv_participants if p.user_id != current_user.id), None)
            if other is not None:
                other_user = UserSummary.model_validate(other)
                name = other.display_name
                avatar_url = other.avatar_url
        else:
            member_count = len(conv_participants)

        # Sort key: latest message time, falling back to conversation.created_at
        # for conversations with no messages yet.
        sort_key = last_message.created_at if last_message else conv.created_at

        preview = ConversationPreviewResponse(
            id=conv.id,
            type=conv.type,
            name=name,
            avatar_url=avatar_url,
            other_user=other_user,
            member_count=member_count,
            last_message=(
                LastMessagePreview(
                    content=last_message.content,
                    message_type=last_message.message_type,
                    attachment_filename=last_message.attachment_filename,
                    created_at=last_message.created_at,
                )
                if last_message
                else None
            ),
            unread_count=unread_by_conversation.get(conv.id, 0),
        )
        dated_previews.append((sort_key, preview))

    dated_previews.sort(key=lambda pair: pair[0], reverse=True)
    return [preview for _, preview in dated_previews]


@router.post("/direct", response_model=ConversationPreviewResponse)
def create_direct_conversation(
    payload: DirectConversationCreate,
    response: Response,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if payload.user_id == current_user.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Cannot create a conversation with yourself")

    other = db.get(User, payload.user_id)
    if other is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="User not found")

    key = compute_direct_key(current_user.id, other.id)

    existing = db.query(Conversation).filter(Conversation.direct_key == key).first()
    if existing is not None:
        response.status_code = status.HTTP_200_OK
        return _build_preview(db, existing, current_user)

    conversation = Conversation(type="direct", direct_key=key)
    db.add(conversation)
    try:
        db.flush()  # assigns conversation.id without committing yet
        db.add_all(
            [
                ConversationParticipant(conversation_id=conversation.id, user_id=current_user.id, role="member"),
                ConversationParticipant(conversation_id=conversation.id, user_id=other.id, role="member"),
            ]
        )
        db.commit()
    except IntegrityError:
        # The direct_key UNIQUE constraint is the real protection against a
        # duplicate: if another request created this same pair's conversation
        # between our check above and this commit, fall back to it here
        # rather than trusting the pre-check alone.
        db.rollback()
        existing = db.query(Conversation).filter(Conversation.direct_key == key).first()
        if existing is None:
            raise
        response.status_code = status.HTTP_200_OK
        return _build_preview(db, existing, current_user)

    response.status_code = status.HTTP_201_CREATED
    return _build_preview(db, conversation, current_user)


@router.post("/group", response_model=ConversationPreviewResponse, status_code=status.HTTP_201_CREATED)
def create_group_conversation(
    payload: GroupConversationCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    member_ids = {uid for uid in payload.member_ids if uid != current_user.id}
    if not member_ids:
        # The schema's own min-length check already rejects an empty
        # member_ids list, but that runs before current_user is known — a
        # payload containing only the requester's own id (e.g. the UI
        # accidentally included them) would otherwise slip through as an
        # empty set here.
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="A group needs at least one other member")

    found_count = db.query(func.count(User.id)).filter(User.id.in_(member_ids)).scalar()
    if found_count != len(member_ids):
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="One or more members do not exist")

    conversation = Conversation(type="group", name=payload.name, direct_key=None)
    db.add(conversation)
    db.flush()

    db.add(ConversationParticipant(conversation_id=conversation.id, user_id=current_user.id, role="admin"))
    for uid in member_ids:
        db.add(ConversationParticipant(conversation_id=conversation.id, user_id=uid, role="member"))
    db.commit()
    db.refresh(conversation)

    return _build_preview(db, conversation, current_user)


@router.get("/{conversation_id}", response_model=ConversationDetailResponse)
def get_conversation(
    conversation: Conversation = Depends(get_conversation_for_member),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    participants = (
        db.query(ConversationParticipant)
        .filter(ConversationParticipant.conversation_id == conversation.id)
        .options(joinedload(ConversationParticipant.user))
        .all()
    )

    name = conversation.name
    avatar_url = conversation.avatar_url
    other_user = None
    participant_responses = None
    member_count = None

    if conversation.type == "direct":
        other = next((p.user for p in participants if p.user_id != current_user.id), None)
        if other is not None:
            other_user = UserSummary.model_validate(other)
            name = other.display_name
            avatar_url = other.avatar_url
    else:
        participant_responses = [
            ParticipantResponse(user=UserSummary.model_validate(p.user), role=p.role) for p in participants
        ]
        member_count = len(participants)

    return ConversationDetailResponse(
        id=conversation.id,
        type=conversation.type,
        name=name,
        avatar_url=avatar_url,
        other_user=other_user,
        participants=participant_responses,
        member_count=member_count,
        created_at=conversation.created_at,
    )


@router.post("/{conversation_id}/members", response_model=ParticipantResponse, status_code=status.HTTP_201_CREATED)
async def add_group_member(
    payload: AddMemberRequest,
    conversation: Conversation = Depends(get_group_admin),
    db: Session = Depends(get_db),
):
    target = db.get(User, payload.user_id)
    if target is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="User not found")

    already_member = (
        db.query(ConversationParticipant)
        .filter(
            ConversationParticipant.conversation_id == conversation.id,
            ConversationParticipant.user_id == target.id,
        )
        .first()
    )
    if already_member is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, detail="User is already a member of this group")

    # No contact-relationship check (Part H) — a group admin may add any
    # registered user, and we never fabricate a Contact row as a side effect.
    db.add(ConversationParticipant(conversation_id=conversation.id, user_id=target.id, role="member"))
    db.commit()

    # Broadcast only after commit (Part N), to everyone now in the group,
    # including the newly-added member so their own client picks it up.
    await manager.broadcast_to_users(_member_ids(db, conversation.id), _group_updated_event(conversation.id))

    return ParticipantResponse(user=UserSummary.model_validate(target), role="member")


@router.delete("/{conversation_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_group_member(
    user_id: int,
    conversation: Conversation = Depends(get_group_admin),
    db: Session = Depends(get_db),
):
    target = (
        db.query(ConversationParticipant)
        .filter(
            ConversationParticipant.conversation_id == conversation.id,
            ConversationParticipant.user_id == user_id,
        )
        .first()
    )
    if target is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="User is not a member of this group")

    # Covers both "an admin removes another admin" and "an admin removes
    # themselves" with one rule: the target of the removal may never be the
    # group's last remaining admin, regardless of who initiated it.
    if target.role == "admin" and _admin_count(db, conversation.id) <= 1:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Cannot remove the last remaining admin")

    # Captured BEFORE the delete, so the removed user is included in the
    # broadcast below — their own client needs this ping too, so a refetch
    # of GET /conversations/{id} 404s and they can close/refresh (Part O).
    broadcast_ids = _member_ids(db, conversation.id)

    db.delete(target)
    db.commit()

    await manager.broadcast_to_users(broadcast_ids, _group_updated_event(conversation.id))


@router.patch("/{conversation_id}/members/{user_id}", response_model=ParticipantResponse)
async def update_member_role(
    user_id: int,
    payload: MemberRoleUpdate,
    conversation: Conversation = Depends(get_group_admin),
    db: Session = Depends(get_db),
):
    target = (
        db.query(ConversationParticipant)
        .filter(
            ConversationParticipant.conversation_id == conversation.id,
            ConversationParticipant.user_id == user_id,
        )
        .options(joinedload(ConversationParticipant.user))
        .first()
    )
    if target is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="User is not a member of this group")

    # Only an actual demotion away from admin can strip the group's last
    # admin — promoting an already-admin or demoting an already-member is a
    # harmless no-op and must not be blocked by this check.
    if target.role == "admin" and payload.role == "member" and _admin_count(db, conversation.id) <= 1:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Cannot demote the last remaining admin")

    target.role = payload.role
    db.commit()
    db.refresh(target)

    await manager.broadcast_to_users(_member_ids(db, conversation.id), _group_updated_event(conversation.id))

    return ParticipantResponse(user=UserSummary.model_validate(target.user), role=target.role)


@router.patch("/{conversation_id}", response_model=ConversationDetailResponse)
async def update_conversation(
    payload: ConversationUpdate,
    conversation: Conversation = Depends(get_group_admin),
    db: Session = Depends(get_db),
):
    if payload.name is None and payload.avatar_url is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Provide at least one field to update")

    if payload.name is not None:
        conversation.name = payload.name
    if payload.avatar_url is not None:
        conversation.avatar_url = payload.avatar_url
    db.commit()
    db.refresh(conversation)

    member_ids = _member_ids(db, conversation.id)
    await manager.broadcast_to_users(member_ids, _group_updated_event(conversation.id))

    participants = (
        db.query(ConversationParticipant)
        .filter(ConversationParticipant.conversation_id == conversation.id)
        .options(joinedload(ConversationParticipant.user))
        .all()
    )
    return ConversationDetailResponse(
        id=conversation.id,
        type=conversation.type,
        name=conversation.name,
        avatar_url=conversation.avatar_url,
        other_user=None,
        participants=[
            ParticipantResponse(user=UserSummary.model_validate(p.user), role=p.role) for p in participants
        ],
        member_count=len(participants),
        created_at=conversation.created_at,
    )
