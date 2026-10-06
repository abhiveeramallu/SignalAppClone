"""Populates a freshly-initialized database with sample users, contacts,
conversations (direct + group) and message history so the app is usable
immediately.

Idempotent at the level of each of the five fixed demo accounts, not the
whole `users` table: on every call, any demo username that doesn't exist
yet gets created with the shared dev password; a demo username that
already exists (whether it's the original demo row from an earlier run,
or — in principle — an unrelated real account someone happens to have
registered under that name) is never touched, so a password is never
silently overwritten. This matters specifically because the `users` table
can be non-empty without the demo accounts actually existing yet (e.g. a
real user registered through the app before this ever ran) — the previous
"skip if any user exists" guard would wrongly treat that as "already
seeded" and leave the demo accounts, including their password123 login,
missing entirely.

Usage: python -m app.db.seed

DEV CREDENTIALS: every seeded user shares the same development-only password,
DEV_SEED_PASSWORD below (hashed with the real app password hasher, never
stored in plaintext, never logged). This is for local/demo convenience only.
"""

from datetime import datetime, timedelta, timezone

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.db.init_db import init_db
from app.db.session import SessionLocal
from app.models import Contact, Conversation, ConversationParticipant, Message, MessageStatus, User
from app.models.conversation import compute_direct_key

DEV_SEED_PASSWORD = "password123"

# One entry per fixed demo account. `last_seen_offset` is relative to "now"
# at seed time; omitted for the two users seeded as online.
_DEMO_USER_SPECS = [
    {"username": "alice", "phone_number": "+15550000001", "display_name": "Alice Johnson", "is_online": True},
    {
        "username": "bob",
        "phone_number": "+15550000002",
        "display_name": "Bob Smith",
        "is_online": False,
        "last_seen_offset": timedelta(minutes=12),
    },
    {"username": "carol", "phone_number": "+15550000003", "display_name": "Carol Davis", "is_online": True},
    {
        "username": "dave",
        "phone_number": "+15550000004",
        "display_name": "Dave Wilson",
        "is_online": False,
        "last_seen_offset": timedelta(hours=2),
    },
    {
        "username": "erin",
        "phone_number": "+15550000005",
        "display_name": "Erin Clark",
        "is_online": False,
        "last_seen_offset": timedelta(days=1),
    },
]
DEMO_USERNAMES = [spec["username"] for spec in _DEMO_USER_SPECS]


def _make_direct_conversation(db, user_a: User, user_b: User) -> Conversation:
    conversation = Conversation(type="direct", direct_key=compute_direct_key(user_a.id, user_b.id))
    db.add(conversation)
    db.flush()  # assign conversation.id
    db.add_all(
        [
            ConversationParticipant(conversation_id=conversation.id, user_id=user_a.id, role="member"),
            ConversationParticipant(conversation_id=conversation.id, user_id=user_b.id, role="member"),
        ]
    )
    return conversation


def _add_message(db, conversation: Conversation, sender: User, recipients: list[User], content: str,
                  created_at: datetime, recipient_status: str) -> Message:
    message = Message(conversation_id=conversation.id, sender_id=sender.id, content=content, created_at=created_at)
    db.add(message)
    db.flush()  # assign message.id
    for recipient in recipients:
        db.add(
            MessageStatus(
                message_id=message.id,
                user_id=recipient.id,
                status=recipient_status,
                updated_at=created_at,
            )
        )
    conversation.updated_at = created_at
    return message


def _ensure_demo_users(db: Session, now: datetime) -> tuple[dict[str, User], bool]:
    """Creates whichever of the five fixed demo accounts don't exist yet,
    each with the shared dev password — never touches one that's already
    there. Returns (all five demo users keyed by username, whether any of
    them already existed before this call)."""
    existing = {row.username: row for row in db.query(User).filter(User.username.in_(DEMO_USERNAMES)).all()}
    any_preexisting = len(existing) > 0

    dev_password_hash = hash_password(DEV_SEED_PASSWORD)
    for spec in _DEMO_USER_SPECS:
        if spec["username"] in existing:
            continue
        last_seen = now - spec["last_seen_offset"] if "last_seen_offset" in spec else None
        user = User(
            username=spec["username"],
            phone_number=spec["phone_number"],
            display_name=spec["display_name"],
            is_online=spec["is_online"],
            last_seen_at=last_seen,
            password_hash=dev_password_hash,
        )
        db.add(user)
        try:
            db.flush()  # assigns user.id; surfaces a uniqueness race here, not later at commit
        except IntegrityError:
            # Another process created this exact demo user between our
            # existence check and this insert (e.g. a concurrent worker's
            # own startup seeding) — not an error, just means it already
            # exists now; drop this attempt and pick up what's actually there.
            db.rollback()
            existing = {row.username: row for row in db.query(User).filter(User.username.in_(DEMO_USERNAMES)).all()}
            continue
        existing[spec["username"]] = user

    return existing, any_preexisting


def seed(db: Session | None = None) -> None:
    """Ensures the five demo accounts exist (creating only whichever are
    missing) and, the first time ALL five are created fresh in the same
    call, also builds the sample contacts/conversations/messages around
    them. If any demo account already existed, the conversation/message
    graph is left alone entirely — rebuilding it would either duplicate an
    existing one or wire up sample history for a row that may not actually
    be the original demo account, and creating the missing login(s) above
    is already enough to make the app usable.

    `db` defaults to a new session on the real engine (unchanged CLI
    behavior below); callers that need a different bind — e.g. app startup
    honoring a test's dependency-injected database — pass an existing
    session in explicitly, and remain responsible for closing it themselves.
    """
    owns_session = db is None
    if db is None:
        db = SessionLocal()
    try:
        # Naive UTC, to match SQLite's CURRENT_TIMESTAMP (used by server_default=func.now()).
        now = datetime.now(timezone.utc).replace(tzinfo=None)

        users_by_username, any_preexisting = _ensure_demo_users(db, now)
        db.commit()  # the accounts themselves are durable even if nothing below runs

        if any(name not in users_by_username for name in DEMO_USERNAMES):
            # Lost an insert race above and the retry still didn't find it —
            # leave it for the next call rather than building history around
            # an incomplete set of users.
            return

        if any_preexisting:
            print("Demo accounts already present; created any missing ones, left existing data untouched.")
            return

        alice = users_by_username["alice"]
        bob = users_by_username["bob"]
        carol = users_by_username["carol"]
        dave = users_by_username["dave"]
        erin = users_by_username["erin"]

        db.add_all(
            [
                Contact(owner_id=alice.id, contact_user_id=bob.id),
                Contact(owner_id=alice.id, contact_user_id=carol.id),
                Contact(owner_id=alice.id, contact_user_id=dave.id),
                Contact(owner_id=alice.id, contact_user_id=erin.id),
                Contact(owner_id=bob.id, contact_user_id=alice.id),
                Contact(owner_id=bob.id, contact_user_id=carol.id),
                Contact(owner_id=carol.id, contact_user_id=alice.id),
                Contact(owner_id=carol.id, contact_user_id=bob.id),
                Contact(owner_id=dave.id, contact_user_id=alice.id),
            ]
        )

        # --- Direct conversation: alice <-> bob ---
        alice_bob = _make_direct_conversation(db, alice, bob)
        _add_message(db, alice_bob, bob, [alice], "Hey Alice! Are we still on for the trip?",
                     now - timedelta(days=2, hours=5), "read")
        _add_message(db, alice_bob, alice, [bob], "Yes! Can't wait",
                     now - timedelta(days=2, hours=4, minutes=50), "read")
        _add_message(db, alice_bob, bob, [alice], "Great, I'll bring the camping gear.",
                     now - timedelta(days=1, hours=2), "read")
        _add_message(db, alice_bob, alice, [bob], "Perfect, I'll handle the food.",
                     now - timedelta(days=1, hours=1, minutes=45), "delivered")
        _add_message(db, alice_bob, bob, [alice], "Sounds good, see you Friday!",
                     now - timedelta(minutes=20), "sent")

        # --- Direct conversation: alice <-> carol ---
        alice_carol = _make_direct_conversation(db, alice, carol)
        _add_message(db, alice_carol, alice, [carol], "Hey Carol, long time!",
                     now - timedelta(days=3), "read")
        _add_message(db, alice_carol, carol, [alice], "I know! We should catch up soon.",
                     now - timedelta(days=2, hours=23, minutes=50), "read")
        _add_message(db, alice_carol, alice, [carol], "Definitely, coffee this weekend?",
                     now - timedelta(hours=6), "delivered")

        # --- Group conversation: Weekend Trip (alice=admin, bob/carol/dave=members) ---
        group = Conversation(type="group", name="Weekend Trip", direct_key=None)
        db.add(group)
        db.flush()
        db.add_all(
            [
                ConversationParticipant(conversation_id=group.id, user_id=alice.id, role="admin"),
                ConversationParticipant(conversation_id=group.id, user_id=bob.id, role="member"),
                ConversationParticipant(conversation_id=group.id, user_id=carol.id, role="member"),
                ConversationParticipant(conversation_id=group.id, user_id=dave.id, role="member"),
            ]
        )
        group_members = [alice, bob, carol, dave]

        def others(sender: User) -> list[User]:
            return [u for u in group_members if u.id != sender.id]

        _add_message(db, group, alice, others(alice), "Welcome to the Weekend Trip group!",
                     now - timedelta(days=2, hours=6), "read")
        _add_message(db, group, bob, others(bob), "Excited for this!",
                     now - timedelta(days=2, hours=5, minutes=50), "read")
        _add_message(db, group, carol, others(carol), "Me too, what time are we leaving?",
                     now - timedelta(days=1, hours=10), "read")
        _add_message(db, group, dave, others(dave), "I'm free from 8am.",
                     now - timedelta(days=1, hours=9, minutes=40), "read")
        _add_message(db, group, alice, others(alice), "8am works, let's meet at the trailhead.",
                     now - timedelta(hours=3), "delivered")
        _add_message(db, group, bob, others(bob), "Sounds good!",
                     now - timedelta(minutes=30), "sent")

        db.commit()
        print("Seeded 5 users, 2 direct conversations, 1 group conversation, 14 messages.")
        print(f"Dev login: any of alice/bob/carol/dave/erin, password={DEV_SEED_PASSWORD!r}")
    finally:
        if owns_session:
            db.close()


if __name__ == "__main__":
    init_db()
    seed()
