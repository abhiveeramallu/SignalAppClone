from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models import User
from app.schemas.users import UserSummary

router = APIRouter()

MAX_RESULTS = 20


@router.get("/search", response_model=list[UserSummary])
def search_users(
    q: str = Query("", max_length=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Discover registered users by username/display name/phone number, for
    the "New Message" contact-discovery flow. Reuses UserSummary — the same
    safe public shape already used for contacts and a conversation's
    other_user — so this never exposes anything new (no password_hash, no
    raw phone number in the response)."""
    trimmed = q.strip()
    if not trimmed:
        # No query at all — skip the database entirely rather than run an
        # unbounded/near-unbounded match.
        return []

    pattern = f"%{trimmed.lower()}%"
    return (
        db.query(User)
        .filter(
            User.id != current_user.id,
            or_(
                func.lower(User.username).like(pattern),
                func.lower(User.display_name).like(pattern),
                func.lower(User.phone_number).like(pattern),
            ),
        )
        .order_by(User.display_name, User.id)
        .limit(MAX_RESULTS)
        .all()
    )
