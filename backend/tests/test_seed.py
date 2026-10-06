from app.core.security import hash_password, verify_password
from app.db.seed import DEMO_USERNAMES, DEV_SEED_PASSWORD, seed
from app.models import Contact, Conversation, Message, User
from tests.helpers import auth_headers, register_and_login


def test_fresh_db_creates_all_five_demo_users(client):
    db = client.db_sessionmaker()
    try:
        seed(db)
        usernames = {u.username for u in db.query(User).filter(User.username.in_(DEMO_USERNAMES)).all()}
        assert usernames == {"alice", "bob", "carol", "dave", "erin"}
    finally:
        db.close()


def test_seeded_demo_password_validates_via_login_endpoint(client):
    db = client.db_sessionmaker()
    try:
        seed(db)
    finally:
        db.close()

    resp = client.post("/auth/login", json={"username": "alice", "password": DEV_SEED_PASSWORD})
    assert resp.status_code == 200
    assert "access_token" in resp.json()


def test_verify_password_accepts_seeded_alice_hash_directly(client):
    """Directly exercises the password hasher/verifier against a freshly
    seeded user's stored hash — independent of the login endpoint."""
    db = client.db_sessionmaker()
    try:
        seed(db)
        seeded_alice = db.query(User).filter_by(username="alice").first()
        assert seeded_alice is not None
        assert verify_password("password123", seeded_alice.password_hash) is True
        assert verify_password("wrong-password", seeded_alice.password_hash) is False
    finally:
        db.close()


def test_running_seed_twice_does_not_duplicate_users(client):
    db = client.db_sessionmaker()
    try:
        seed(db)
        seed(db)
        count = db.query(User).filter(User.username.in_(DEMO_USERNAMES)).count()
        assert count == 5
    finally:
        db.close()


def test_running_seed_twice_does_not_duplicate_conversations_or_messages(client):
    db = client.db_sessionmaker()
    try:
        seed(db)
        convo_count_1 = db.query(Conversation).count()
        message_count_1 = db.query(Message).count()

        seed(db)
        convo_count_2 = db.query(Conversation).count()
        message_count_2 = db.query(Message).count()

        assert convo_count_1 == convo_count_2 == 3  # 2 direct + 1 group
        assert message_count_1 == message_count_2 == 14
    finally:
        db.close()


def test_partial_database_missing_one_demo_user_gets_created(client):
    """Four of the five demo accounts already exist (as if an earlier,
    interrupted seed run — or the old table-wide guard — left the set
    incomplete); the missing one must still get created with the standard
    dev password, without touching the other four or erroring out."""
    db = client.db_sessionmaker()
    try:
        dev_hash = hash_password("password123")
        for username in ["alice", "bob", "carol", "dave"]:  # erin deliberately missing
            db.add(User(username=username, display_name=username.capitalize(), password_hash=dev_hash))
        db.commit()

        seed(db)

        usernames = {u.username for u in db.query(User).filter(User.username.in_(DEMO_USERNAMES)).all()}
        assert usernames == {"alice", "bob", "carol", "dave", "erin"}

        erin = db.query(User).filter_by(username="erin").first()
        assert verify_password("password123", erin.password_hash) is True
    finally:
        db.close()


def test_partial_seed_does_not_build_conversation_graph(client):
    """When any demo account already existed, seed() creates only the
    missing login(s) and deliberately does not attempt to build the sample
    conversation/message graph (see seed.py's docstring for why)."""
    db = client.db_sessionmaker()
    try:
        dev_hash = hash_password("password123")
        db.add(User(username="alice", display_name="Alice", password_hash=dev_hash))
        db.commit()

        seed(db)

        assert db.query(Conversation).count() == 0
        assert db.query(Message).count() == 0
    finally:
        db.close()


def test_existing_non_demo_user_is_preserved(client):
    db = client.db_sessionmaker()
    try:
        real_hash = hash_password("a-real-users-own-password")
        db.add(User(username="frank", display_name="Frank Miller", password_hash=real_hash))
        db.commit()

        seed(db)

        frank = db.query(User).filter_by(username="frank").first()
        assert frank is not None
        assert verify_password("a-real-users-own-password", frank.password_hash) is True
        assert db.query(User).filter(User.username.in_(DEMO_USERNAMES)).count() == 5
    finally:
        db.close()


def test_existing_demo_user_password_is_never_overwritten(client):
    """An existing row under a demo username (whatever its real password is)
    must never be touched — seed() cannot tell a genuine demo account from
    a real account that happens to share the username, so it always leaves
    it alone."""
    db = client.db_sessionmaker()
    try:
        custom_hash = hash_password("a-totally-different-password")
        db.add(User(username="alice", display_name="Alice", password_hash=custom_hash))
        db.commit()

        seed(db)

        alice = db.query(User).filter_by(username="alice").first()
        assert verify_password("a-totally-different-password", alice.password_hash) is True
        assert verify_password("password123", alice.password_hash) is False
    finally:
        db.close()


def test_existing_data_preserved_when_demo_user_predates_seed_call(client):
    """Covers the production scenario this fix targets: a demo account and
    its own conversation already exist (e.g. created through ordinary API
    use) before seed() ever runs — nothing about that pre-existing data is
    touched or duplicated."""
    alice, alice_token = register_and_login(client, "alice")
    bob, _ = register_and_login(client, "bob")
    convo = client.post(
        "/conversations/direct", json={"user_id": bob["id"]}, headers=auth_headers(alice_token)
    ).json()
    client.post(
        f"/conversations/{convo['id']}/messages", json={"content": "hello"}, headers=auth_headers(alice_token)
    )

    db = client.db_sessionmaker()
    try:
        seed(db)

        # The pre-existing conversation/message must still be exactly there.
        assert db.query(Conversation).count() == 1
        assert db.query(Message).count() == 1
        assert db.query(Message).first().content == "hello"

        # carol/dave/erin get created as missing demo logins; alice/bob (now
        # demo usernames too) are untouched, still able to log in with
        # whatever password register_and_login used.
        usernames = {u.username for u in db.query(User).filter(User.username.in_(DEMO_USERNAMES)).all()}
        assert usernames == {"alice", "bob", "carol", "dave", "erin"}
    finally:
        db.close()

    resp = client.post("/auth/login", json={"username": "alice", "password": "testpass123"})
    assert resp.status_code == 200


def test_contacts_not_duplicated_on_second_seed_call(client):
    db = client.db_sessionmaker()
    try:
        seed(db)
        count_1 = db.query(Contact).count()
        seed(db)
        count_2 = db.query(Contact).count()
        assert count_1 == count_2 == 9
    finally:
        db.close()
