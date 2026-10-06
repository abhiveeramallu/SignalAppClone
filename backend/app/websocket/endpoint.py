"""WebSocket event protocol.

Client -> Server:
    authenticate       {token}
    send_message       {conversation_id, content}
    message_delivered  {message_id}            -- "I (a recipient) received and processed this message"
    mark_read          {conversation_id}        -- "I have viewed this conversation"
    typing_start       {conversation_id}
    typing_stop        {conversation_id}

Server -> Client:
    authenticated      {user_id}
    new_message        {message: MessageResponse}
    message_status     {message_id, conversation_id, user_id, status}  -- one recipient's status changed;
                                                                           sent only to the message's sender,
                                                                           so they can resolve their aggregate
                                                                           display status (see Part I/message_service)
    messages_read      {conversation_id, user_id, message_ids,         -- broadcast to the other participants
                         statuses: {message_id: status}}                  when `user_id` marks those messages
                                                                           read; `statuses` gives each message's
                                                                           recomputed aggregate so a sender can
                                                                           update their own sent-message display
                                                                           (Part I/J) — a reader isn't necessarily
                                                                           the only other participant in a group
    typing             {conversation_id, user: {id, display_name}, is_typing}
    group_updated      {conversation_id}  -- group membership/role/name/avatar changed; clients
                                               refetch REST state (GET /conversations, GET
                                               /conversations/{id}) rather than trusting anything
                                               carried on the event itself (there isn't anything).
                                               Emitted from app/routers/conversations.py's group-
                                               management endpoints, not from this dispatch loop.
    error              {code, message}

Delivery uses an explicit client acknowledgement (message_delivered) rather
than marking "delivered" the instant the server pushes new_message — that
would conflate "broadcast completed" with "client actually processed it",
which Step 9's spec explicitly warns against. Read state is a separate,
explicit event (mark_read) — never inferred from GET history or from the
WebSocket simply being connected.
"""

from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from starlette import status as ws_status

from app.core.deps import find_member_conversation, resolve_user_from_token
from app.db.session import get_db
from app.models import ConversationParticipant, Message, MessageStatus, User
from app.schemas.messages import MessageResponse, MessageSender
from app.services.message_service import (
    MessageValidationError,
    create_message,
    resolve_sender_aggregate_status,
    update_message_status,
)
from app.websocket.manager import manager

router = APIRouter()


@contextmanager
def _db_session(websocket: WebSocket):
    """A short-lived session per event — never held open for the connection's
    lifetime (a WebSocket can stay open for hours; a request-scoped session
    would just sit there idle/stale in between events).

    Resolves get_db through websocket.app.dependency_overrides rather than
    importing SessionLocal directly, so a WebSocket-opened session honors the
    same override the test suite uses for every REST route (app.dependency_
    overrides[get_db] = ...). Hardcoding SessionLocal here would silently
    write to the real database even under tests, since WebSocket handlers
    sit outside FastAPI's per-request Depends() resolution.
    """
    db_dependency = websocket.app.dependency_overrides.get(get_db, get_db)
    generator = db_dependency()
    db = next(generator)
    try:
        yield db
    finally:
        next(generator, None)  # resumes the generator past `yield`, running its own `finally: db.close()`


def _error_event(code: str, message: str) -> dict:
    return {"type": "error", "code": code, "message": message}


def _set_presence(websocket: WebSocket, user_id: int, *, is_online: bool) -> None:
    """Keeps `is_online`/`last_seen_at` honest against the real connection
    manager state, rather than a static seeded value that never changes
    (previously true, not merely simulated-and-disclosed — this makes it
    genuinely backend-tracked). A user with several open tabs/devices only
    goes offline once their LAST connection drops."""
    if is_online or manager.connection_count(user_id) == 0:
        with _db_session(websocket) as db:
            user = db.get(User, user_id)
            if user is None:
                return
            user.is_online = is_online
            if not is_online:
                user.last_seen_at = datetime.now(timezone.utc).replace(tzinfo=None)
            db.commit()


def _other_participant_ids(db, conversation_id: int, exclude_user_id: int) -> list[int]:
    return [
        row.user_id
        for row in db.query(ConversationParticipant.user_id)
        .filter(
            ConversationParticipant.conversation_id == conversation_id,
            ConversationParticipant.user_id != exclude_user_id,
        )
        .all()
    ]


async def _authenticate(websocket: WebSocket) -> User | None:
    """First event on every connection must be {"type": "authenticate", "token": "<JWT>"}.
    Returns the resolved User, or None after sending an error + closing the socket."""
    try:
        raw: Any = await websocket.receive_json()
    except WebSocketDisconnect:
        raise
    except Exception:
        await websocket.send_json(_error_event("MALFORMED_MESSAGE", "Expected a JSON authenticate event."))
        await websocket.close(code=ws_status.WS_1008_POLICY_VIOLATION)
        return None

    if not isinstance(raw, dict) or raw.get("type") != "authenticate" or not isinstance(raw.get("token"), str):
        await websocket.send_json(
            _error_event(
                "NOT_AUTHENTICATED", "First event must be {'type': 'authenticate', 'token': '<JWT>'}."
            )
        )
        await websocket.close(code=ws_status.WS_1008_POLICY_VIOLATION)
        return None

    with _db_session(websocket) as db:
        user = resolve_user_from_token(db, raw["token"])

    if user is None:
        await websocket.send_json(_error_event("NOT_AUTHENTICATED", "Invalid or expired token."))
        await websocket.close(code=ws_status.WS_1008_POLICY_VIOLATION)
        return None

    await websocket.send_json({"type": "authenticated", "user_id": user.id})
    return user


async def _handle_send_message(websocket: WebSocket, user: User, raw: dict) -> None:
    conversation_id = raw.get("conversation_id")
    content = raw.get("content")
    if not isinstance(conversation_id, int) or not isinstance(content, str):
        await websocket.send_json(
            _error_event(
                "MALFORMED_MESSAGE", "send_message requires an integer conversation_id and string content."
            )
        )
        return

    with _db_session(websocket) as db:
        conversation = find_member_conversation(db, conversation_id, user.id)
        if conversation is None:
            await websocket.send_json(
                _error_event("NOT_CONVERSATION_MEMBER", "You are not a member of this conversation.")
            )
            return

        try:
            # Same service function POST /conversations/{id}/messages uses —
            # one persistence path, not two. Commits internally.
            message, statuses = create_message(db, conversation, user, content)
        except MessageValidationError as exc:
            await websocket.send_json(_error_event("INVALID_MESSAGE", str(exc)))
            return

        recipient_ids = [s.user_id for s in statuses]
        response = MessageResponse(
            id=message.id,
            conversation_id=message.conversation_id,
            sender=MessageSender.model_validate(user),
            content=message.content,
            created_at=message.created_at,
            # Uniform "sent" is accurate for every recipient here: this is a
            # snapshot taken immediately after creation, before any delivery/
            # read transition has had a chance to happen.
            status="sent",
        )

    # Broadcast only after the session above is closed — i.e. only after the
    # commit inside create_message() has actually happened. If persistence
    # had failed, we'd have returned in the except block above and never
    # reach this line at all.
    event = {"type": "new_message", "message": response.model_dump(mode="json")}
    participant_ids = set(recipient_ids) | {user.id}
    await manager.broadcast_to_users(participant_ids, event)


async def _handle_message_delivered(websocket: WebSocket, user: User, raw: dict) -> None:
    message_id = raw.get("message_id")
    if not isinstance(message_id, int):
        await websocket.send_json(
            _error_event("MALFORMED_MESSAGE", "message_delivered requires an integer message_id.")
        )
        return

    with _db_session(websocket) as db:
        message = db.get(Message, message_id)
        if message is None:
            await websocket.send_json(_error_event("INVALID_MESSAGE", "Message not found."))
            return
        if find_member_conversation(db, message.conversation_id, user.id) is None:
            await websocket.send_json(
                _error_event("NOT_CONVERSATION_MEMBER", "You are not a member of this conversation.")
            )
            return
        if message.sender_id == user.id:
            # Can't deliver-ack your own message — there's no recipient status
            # row for the sender. Not an error, just nothing to do.
            return

        updated = update_message_status(db, message_id, user.id, "delivered")
        sender_id = message.sender_id
        conversation_id = message.conversation_id
        # Recompute the sender's aggregate now, inside the same session — in a
        # group, other recipients may still be at 'sent', so the value the
        # sender should see can differ from the single row that just changed
        # (e.g. this ack can't move a 3-person group past 'sent' on its own).
        # This keeps the WebSocket push consistent with what REST computes
        # (Part J) instead of forwarding the raw per-recipient value.
        aggregate_status = resolve_sender_aggregate_status(db, message_id) if updated is not None else None

    if updated is not None:
        # Only the sender needs this — they're the one resolving an aggregate
        # status from recipients' rows. Never touches the sender's own status.
        await manager.send_to_user(
            sender_id,
            {
                "type": "message_status",
                "message_id": message_id,
                "conversation_id": conversation_id,
                "user_id": user.id,
                "status": aggregate_status,
            },
        )


async def _handle_mark_read(websocket: WebSocket, user: User, raw: dict) -> None:
    conversation_id = raw.get("conversation_id")
    if not isinstance(conversation_id, int):
        await websocket.send_json(
            _error_event("MALFORMED_MESSAGE", "mark_read requires an integer conversation_id.")
        )
        return

    with _db_session(websocket) as db:
        if find_member_conversation(db, conversation_id, user.id) is None:
            await websocket.send_json(
                _error_event("NOT_CONVERSATION_MEMBER", "You are not a member of this conversation.")
            )
            return

        # Only THIS user's rows, only ones not already read. Everything this
        # query returns has status 'sent' or 'delivered' (both rank below
        # 'read'), so setting it to 'read' is always a forward transition —
        # correct by construction, no per-row rank check needed here.
        rows = (
            db.query(MessageStatus)
            .join(Message, Message.id == MessageStatus.message_id)
            .filter(
                Message.conversation_id == conversation_id,
                MessageStatus.user_id == user.id,
                MessageStatus.status != "read",
            )
            .all()
        )
        message_ids = [row.message_id for row in rows]
        for row in rows:
            row.status = "read"
        if rows:
            db.commit()

        other_ids = _other_participant_ids(db, conversation_id, user.id)

        # Per-message aggregate, additive to the spec's literal payload — a
        # group read doesn't mean every OTHER recipient has also read it, so
        # recipients can't safely assume 'read' just because `message_ids`
        # names a message; each one needs its own current aggregate. Keyed
        # by message_id (as a string: JSON object keys are always strings).
        statuses = {
            str(message_id): resolve_sender_aggregate_status(db, message_id) for message_id in message_ids
        }

    if message_ids:
        event = {
            "type": "messages_read",
            "conversation_id": conversation_id,
            "user_id": user.id,
            "message_ids": message_ids,
            "statuses": statuses,
        }
        # The senders of those messages, not the reader themself. A recipient
        # only applies `statuses[id]` to messages they themselves sent — for
        # everyone else's messages in the same batch, this event isn't about
        # their own view of it (see the frontend handler for why).
        await manager.broadcast_to_users(other_ids, event)


async def _handle_typing(websocket: WebSocket, user: User, raw: dict, *, is_typing: bool) -> None:
    conversation_id = raw.get("conversation_id")
    if not isinstance(conversation_id, int):
        await websocket.send_json(
            _error_event("MALFORMED_MESSAGE", "typing events require an integer conversation_id.")
        )
        return

    with _db_session(websocket) as db:
        if find_member_conversation(db, conversation_id, user.id) is None:
            await websocket.send_json(
                _error_event("NOT_CONVERSATION_MEMBER", "You are not a member of this conversation.")
            )
            return
        other_ids = _other_participant_ids(db, conversation_id, user.id)

    # Never persisted — no Message, MessageStatus, or dedicated table. Purely
    # an in-memory broadcast, and never echoed back to the sender.
    event = {
        "type": "typing",
        "conversation_id": conversation_id,
        "user": {"id": user.id, "display_name": user.display_name},
        "is_typing": is_typing,
    }
    await manager.broadcast_to_users(other_ids, event)


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    await websocket.accept()

    user = await _authenticate(websocket)
    if user is None:
        return

    manager.connect(user.id, websocket)
    _set_presence(websocket, user.id, is_online=True)
    try:
        while True:
            try:
                raw: Any = await websocket.receive_json()
            except WebSocketDisconnect:
                raise
            except Exception:
                # Any malformed/non-JSON input — never let it crash the loop.
                await websocket.send_json(_error_event("MALFORMED_MESSAGE", "Message must be valid JSON."))
                continue

            if not isinstance(raw, dict) or "type" not in raw:
                await websocket.send_json(_error_event("MALFORMED_MESSAGE", "Event must include a 'type' field."))
                continue

            event_type = raw.get("type")
            if event_type == "send_message":
                await _handle_send_message(websocket, user, raw)
            elif event_type == "message_delivered":
                await _handle_message_delivered(websocket, user, raw)
            elif event_type == "mark_read":
                await _handle_mark_read(websocket, user, raw)
            elif event_type == "typing_start":
                await _handle_typing(websocket, user, raw, is_typing=True)
            elif event_type == "typing_stop":
                await _handle_typing(websocket, user, raw, is_typing=False)
            elif event_type == "authenticate":
                # Already authenticated on this connection — harmless re-ack.
                await websocket.send_json({"type": "authenticated", "user_id": user.id})
            else:
                await websocket.send_json(
                    _error_event("UNKNOWN_EVENT_TYPE", f"Unknown event type: {event_type!r}")
                )
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(user.id, websocket)
        _set_presence(websocket, user.id, is_online=False)
