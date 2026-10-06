from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.core.security import create_access_token, hash_password, verify_password
from app.db.session import get_db
from app.models import User
from app.schemas.auth import LoginRequest, RegisterRequest, TokenResponse, UserResponse

router = APIRouter()


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, db: Session = Depends(get_db)) -> User:
    if db.query(User).filter(User.username == payload.username).first() is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, detail="Username already taken")
    if payload.phone_number is not None:
        existing_phone = db.query(User).filter(User.phone_number == payload.phone_number).first()
        if existing_phone is not None:
            raise HTTPException(status.HTTP_409_CONFLICT, detail="Phone number already registered")

    user = User(
        username=payload.username,
        phone_number=payload.phone_number,
        display_name=payload.display_name,
        avatar_url=payload.avatar_url,
        password_hash=hash_password(payload.password),
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        # Race-safety net: two concurrent registrations could both pass the
        # pre-checks above before either commits.
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, detail="Username or phone number already in use")
    db.refresh(user)
    return user


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    user = None
    if payload.username:
        user = db.query(User).filter(User.username == payload.username).first()
    elif payload.phone_number:
        user = db.query(User).filter(User.phone_number == payload.phone_number).first()

    if user is None or not verify_password(payload.password, user.password_hash):
        # Deliberately generic: don't reveal whether the account exists.
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    token = create_access_token(user.id)
    return TokenResponse(access_token=token)


@router.get("/me", response_model=UserResponse)
def me(current_user: User = Depends(get_current_user)) -> User:
    return current_user
