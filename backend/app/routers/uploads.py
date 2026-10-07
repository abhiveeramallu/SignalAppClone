import mimetypes
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.deps import find_member_conversation, get_current_user
from app.db.session import get_db
from app.models import Message, User
from app.schemas.uploads import UploadResponse

router = APIRouter()


def _ensure_uploads_dir() -> Path:
    settings.uploads_dir.mkdir(parents=True, exist_ok=True)
    return settings.uploads_dir


def _validate_type(filename: str, content_type: str | None) -> str:
    """Checked together, extension AND declared MIME type against the
    allowlist — never the extension alone (a renamed .exe could claim any
    extension it likes, but a browser-declared Content-Type for it won't
    match what that extension is allowed to be)."""
    suffix = Path(filename).suffix.lower()
    allowed_mimes = settings.allowed_upload_types.get(suffix)
    if allowed_mimes is None:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail=f"File type {suffix or '(no extension)'} is not supported.",
        )
    # Browsers don't always send a content_type (or send a generic
    # application/octet-stream) — fall back to sniffing from the extension
    # itself rather than rejecting an otherwise-valid upload over a missing
    # header, but still require that "sniffed" type to be an allowed one.
    declared = content_type or mimetypes.guess_type(filename)[0] or ""
    if declared not in allowed_mimes:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail=f"File content does not match an allowed type for {suffix} files.",
        )
    return declared


@router.post("", response_model=UploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_file(
    file: UploadFile,
    current_user: User = Depends(get_current_user),
) -> UploadResponse:
    if not file.filename:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="A filename is required.")

    mime_type = _validate_type(file.filename, file.content_type)

    uploads_dir = _ensure_uploads_dir()
    # Random, collision-safe stored name — the client-supplied filename is
    # kept only as display metadata (attachment_filename), never used to
    # build a filesystem path, so there's nothing for a crafted "../../x"
    # filename to traverse into.
    suffix = Path(file.filename).suffix.lower()
    stored_name = f"{uuid.uuid4().hex}{suffix}"
    destination = uploads_dir / stored_name

    size = 0
    try:
        with destination.open("wb") as out:
            while chunk := await file.read(1024 * 1024):
                size += len(chunk)
                if size > settings.max_upload_size_bytes:
                    out.close()
                    destination.unlink(missing_ok=True)
                    max_mb = settings.max_upload_size_bytes // (1024 * 1024)
                    raise HTTPException(
                        status.HTTP_413_CONTENT_TOO_LARGE,
                        detail=f"File is too large. Maximum size is {max_mb} MB.",
                    )
                out.write(chunk)
    finally:
        await file.close()

    return UploadResponse(
        attachment_filename=file.filename,
        attachment_path=stored_name,
        attachment_mime_type=mime_type,
        attachment_size=size,
    )


@router.get("/{message_id}")
def download_attachment(
    message_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Authenticated, authorized attachment download — deliberately NOT a
    static file mount. Resolves the owning message, confirms it actually has
    a file attached, and confirms current_user is a participant in that
    message's conversation (the same membership check every other
    conversation-scoped route uses) before streaming anything from disk."""
    message = db.get(Message, message_id)
    if message is None or message.message_type != "file" or not message.attachment_path:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Attachment not found")

    if find_member_conversation(db, message.conversation_id, current_user.id) is None:
        # 404, not 403 — same reasoning as get_conversation_for_member: a
        # non-participant shouldn't be able to confirm this attachment exists.
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Attachment not found")

    file_path = settings.uploads_dir / message.attachment_path
    if not file_path.is_file():
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Attachment not found")

    return FileResponse(
        path=file_path,
        media_type=message.attachment_mime_type or "application/octet-stream",
        filename=message.attachment_filename or message.attachment_path,
    )
