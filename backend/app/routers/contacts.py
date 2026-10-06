from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models import Contact, User
from app.schemas.users import UserSummary

router = APIRouter()


@router.get("", response_model=list[UserSummary])
def list_contacts(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # Join straight to User so the contact's profile comes back in this one
    # query, instead of lazy-loading Contact.contact_user per row.
    contacts = (
        db.query(User)
        .join(Contact, Contact.contact_user_id == User.id)
        .filter(Contact.owner_id == current_user.id)
        .order_by(User.display_name, User.id)
        .all()
    )
    return contacts


@router.post("/{user_id}", response_model=UserSummary, status_code=status.HTTP_201_CREATED)
def add_contact(user_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if user_id == current_user.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Cannot add yourself as a contact")

    target = db.get(User, user_id)
    if target is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="User not found")

    existing = (
        db.query(Contact)
        .filter(Contact.owner_id == current_user.id, Contact.contact_user_id == user_id)
        .first()
    )
    if existing is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, detail="Contact already exists")

    db.add(Contact(owner_id=current_user.id, contact_user_id=user_id))
    try:
        db.commit()
    except IntegrityError:
        # Race-safety net, same pattern as /auth/register.
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, detail="Contact already exists")

    return target


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_contact(user_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    contact = (
        db.query(Contact)
        .filter(Contact.owner_id == current_user.id, Contact.contact_user_id == user_id)
        .first()
    )
    if contact is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Contact not found")

    # Only the Contact row goes away — no FK/cascade ties it to Conversation
    # or Message, so existing conversations and messages are untouched.
    db.delete(contact)
    db.commit()
