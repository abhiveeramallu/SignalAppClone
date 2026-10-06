import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.security import decode_access_token
from app.db.session import get_db
from app.models import Conversation, ConversationParticipant, User

bearer_scheme = HTTPBearer(auto_error=False)


def resolve_user_from_token(db: Session, token: str) -> User | None:
    """Pure JWT-to-User resolution, with no FastAPI/HTTP-specific error
    handling — shared by get_current_user (HTTP) and the WebSocket
    authenticate event, so there is exactly one JWT verification path."""
    try:
        payload = decode_access_token(token)
    except jwt.PyJWTError:
        return None

    user_id = payload.get("sub")
    if user_id is None:
        return None

    return db.get(User, int(user_id))


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or missing authentication credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if credentials is None:
        raise unauthorized

    user = resolve_user_from_token(db, credentials.credentials)
    if user is None:
        raise unauthorized

    return user


def find_member_conversation(db: Session, conversation_id: int, user_id: int) -> Conversation | None:
    """Core membership check, with no FastAPI-specific error handling —
    shared by get_conversation_for_member (HTTP) and the WebSocket
    send_message handler."""
    conversation = db.get(Conversation, conversation_id)
    is_member = (
        conversation is not None
        and db.query(ConversationParticipant)
        .filter(
            ConversationParticipant.conversation_id == conversation_id,
            ConversationParticipant.user_id == user_id,
        )
        .first()
        is not None
    )
    return conversation if is_member else None


def get_conversation_for_member(
    conversation_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Conversation:
    """Resolves conversation_id from the path and enforces membership in one place,
    so every conversation route gets the same authorization check for free."""
    conversation = find_member_conversation(db, conversation_id, current_user.id)
    if conversation is None:
        # 404 either way (missing vs. not-a-member) — a 403 would confirm to a
        # non-member that the conversation ID exists.
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Conversation not found")
    return conversation


def get_group_admin(
    conversation_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Conversation:
    """Resolves + enforces, in one place, everything every group-management
    mutation needs: the conversation exists, the requester is a member of it,
    it's a group (not direct), and the requester is specifically an admin of
    it. Reused by add/remove member, role changes, and rename/avatar updates
    instead of duplicating this chain in each route (Part G)."""
    conversation = find_member_conversation(db, conversation_id, current_user.id)
    if conversation is None:
        # Same reasoning as get_conversation_for_member: 404 either way, so a
        # non-member can't use this to confirm a conversation id exists.
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Conversation not found")
    if conversation.type != "group":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Not a group conversation")

    participant = (
        db.query(ConversationParticipant)
        .filter(
            ConversationParticipant.conversation_id == conversation_id,
            ConversationParticipant.user_id == current_user.id,
        )
        .first()
    )
    if participant is None or participant.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Admin privileges required")

    return conversation
