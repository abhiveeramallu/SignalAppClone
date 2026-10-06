"""Populates a freshly-initialized database with sample users, contacts,
conversations (direct + group) and message history so the app is usable
immediately. Safe to re-run: skips if users already exist.

Usage: python -m app.db.seed

DEV CREDENTIALS: every seeded user shares the same development-only password,
DEV_SEED_PASSWORD below (hashed with the real app password hasher, never
stored in plaintext). This is for local/demo convenience only.
"""

from datetime import datetime, timedelta, timezone

from app.core.security import hash_password
from app.db.init_db import init_db
from app.db.session import SessionLocal
from app.models import Contact, Conversation, ConversationParticipant, Message, MessageStatus, User
from app.models.conversation import compute_direct_key

DEV_SEED_PASSWORD = "password123"


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


def seed() -> None:
    db = SessionLocal()
    try:
        if db.query(User).count() > 0:
            print("Database already seeded, skipping.")
            return

        # Naive UTC, to match SQLite's CURRENT_TIMESTAMP (used by server_default=func.now()).
        now = datetime.now(timezone.utc).replace(tzinfo=None)

        dev_password_hash = hash_password(DEV_SEED_PASSWORD)

        alice = User(username="alice", phone_number="+15550000001", display_name="Alice Johnson",
                     is_online=True, password_hash=dev_password_hash)
        bob = User(username="bob", phone_number="+15550000002", display_name="Bob Smith",
                   is_online=False, last_seen_at=now - timedelta(minutes=12), password_hash=dev_password_hash)
        carol = User(username="carol", phone_number="+15550000003", display_name="Carol Davis",
                     is_online=True, password_hash=dev_password_hash)
        dave = User(username="dave", phone_number="+15550000004", display_name="Dave Wilson",
                    is_online=False, last_seen_at=now - timedelta(hours=2), password_hash=dev_password_hash)
        erin = User(username="erin", phone_number="+15550000005", display_name="Erin Clark",
                    is_online=False, last_seen_at=now - timedelta(days=1), password_hash=dev_password_hash)
        db.add_all([alice, bob, carol, dave, erin])
        db.flush()  # assign user ids

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
        db.close()


if __name__ == "__main__":
    init_db()
    seed()
