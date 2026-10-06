# Secure Messaging Platform

## 1. Overview

This is a Signal-inspired secure messaging platform built as a full-stack assignment. It implements authentication, contacts, direct and group conversations, real-time messaging over WebSockets, delivery/read receipts, typing indicators, group administration, and a responsive UI.

**Real Signal Protocol end-to-end encryption is not implemented; encryption is simulated/not implemented as permitted by the assignment.** Messages are transmitted over a standard authenticated REST/WebSocket API and stored as plaintext in the database — this project demonstrates application architecture and real-time messaging mechanics, not production-grade cryptography.

## 2. Features

### Authentication
- Registration (username, display name, password, optional phone number)
- Login (by username or phone number)
- JWT session tokens (bearer auth for REST, sent in the first WebSocket message)
- bcrypt password hashing
- Session persistence across page refresh (`GET /auth/me` on load)

### Messaging
- Direct messaging between two users
- Persistent message history
- Cursor-based pagination (`before_id`)
- Sent / delivered / read status per message, correctly aggregated for group recipients
- Real-time delivery over a single WebSocket connection
- Typing indicators (ephemeral, never persisted)

### Conversations
- Conversation list sorted by most recent activity
- Unread counts (backend-computed, source of truth is the database)
- Client-side conversation search (name, username, last-message preview)
- Contacts list with client-side search
- Direct-conversation deduplication (reopening a chat with the same user reuses the existing conversation)

### Groups
- Group creation with an initial member set
- Group details panel (members, roles, avatar, member count)
- Add / remove members (admin-only)
- Promote / demote admins, with protection against removing the last remaining admin
- Rename group
- Real-time membership sync (`group_updated` event → REST refetch)

### UX
- Responsive layout (mobile list/chat navigation, desktop two-pane layout)
- Loading, error, and empty states across all async operations
- Settings page with Privacy / Notifications / Appearance placeholders
- Live connection status indicator (Connected / Connecting / Reconnecting / Offline)
- Toast notifications for meaningful events (failures, group changes, errors)

### Explicitly not implemented
- Signal Protocol end-to-end encryption
- Real SMS OTP verification
- Voice calls
- Video calls
- Stories
- Linked devices
- File/media attachments
- Disappearing messages
- Message reactions or replies

## 3. Tech Stack

**Frontend**
- Next.js 16 (App Router)
- React 19
- TypeScript
- Tailwind CSS v4

**Backend**
- Python / FastAPI
- SQLAlchemy 2.0
- SQLite
- PyJWT
- bcrypt
- WebSockets (native FastAPI/Starlette support)

**Testing**
- pytest
- FastAPI `TestClient` for REST and same-task WebSocket tests
- A real in-process `uvicorn.Server` fixture for WebSocket tests that need to observe a server-initiated push triggered from a different connection's own task (`TestClient`'s synchronous WS bridge deadlocks on that specific pattern)

## 4. Architecture

```
Browser
   |
   | REST (HTTPS/JSON)
   v
Next.js  --------->  FastAPI  --------->  SQLAlchemy  --------->  SQLite
   |                     ^
   | WebSocket           |
   v                     |
FastAPI WebSocket  ------+
   Manager
```

- **REST** handles all persistent CRUD and history: auth, contacts, conversation/message history, group management.
- **WebSocket** (`/ws`, one connection per client) handles real-time events: new messages, delivery/read receipts, typing, and group-membership change notifications.
- **SQLite** is the single persistence layer for both paths — a REST write and a WebSocket-triggered write use the same database through the same SQLAlchemy models.
- **`ConnectionManager`** (`backend/app/websocket/manager.py`) is a small in-process, in-memory registry mapping `user_id → set of open WebSocket connections`. It is intentionally not backed by Redis or any external pub-sub — this assignment targets a single FastAPI process, and a single in-memory manager is sufficient and simpler for that scope. (A multi-process deployment would need a shared broker; see §17.)
- **`MessageStatus`** stores one row per `(message, recipient)` pair, because delivery/read state is inherently per-recipient — in a group, each member can be at a different status, and the sender's displayed status is the aggregate (minimum rank) across all of them.

## 5. Project Structure

```
backend/
  app/
    core/        # config, JWT/password helpers, auth dependencies
    db/          # engine/session setup, init_db, seed data
    models/      # SQLAlchemy ORM models (one file per table)
    schemas/     # Pydantic request/response models
    routers/     # REST endpoints (auth, contacts, conversations, messages)
    services/    # shared business logic (message_service: status rules, creation)
    websocket/   # the /ws endpoint, event dispatch, ConnectionManager
    main.py      # FastAPI app, CORS, router registration
  tests/         # pytest suite (one file per feature area)
  requirements.txt
  .env.example

frontend/
  app/
    (auth)/      # /login, /register — public routes
    (main)/      # /, /settings — authenticated routes (redirect to /login if signed out)
    layout.tsx   # root layout: AuthProvider + WebSocketProvider
  components/
    auth/        # login/register forms
    chat/        # message bubbles, composer, header, group details modal
    contacts/    # new conversation / new group modal
    conversation-list/
    layout/      # AppShell (top-level state), Sidebar, MainChatArea
    profile/     # user menu
    ui/          # small shared primitives (Avatar, Button, Spinner, Toast, ...)
  lib/
    api.ts       # typed REST client
    ws.tsx       # WebSocketClient + React provider/hook
    auth-context.tsx
    types.ts     # shared frontend types (mirrors backend schemas)
  package.json
  .env.example
```

## 6. Database Schema

Six tables:

| Table | Purpose |
|---|---|
| `users` | Account + profile data, password hash, live online/last-seen state |
| `contacts` | Directional "A knows B" relationship |
| `conversations` | A direct or group conversation (`type` discriminates) |
| `conversation_participants` | Membership rows; carries `role` (`member`/`admin`) for groups |
| `messages` | Message content, sender, conversation, timestamp |
| `message_status` | Per-recipient delivery state (`sent`/`delivered`/`read`) for one message |

- **Direct conversations** are deduplicated via `conversations.direct_key`, a deterministic, order-independent key computed from the two user IDs (`compute_direct_key`), with a unique constraint.
- **Group conversations** have `direct_key = NULL` and `type = 'group'`; membership and role live in `conversation_participants`.
- **`message_status`** exists per-recipient (not per-message) because a group message has multiple recipients who each progress through sent → delivered → read independently. The sender's own displayed status is derived, not stored — it's the minimum-rank status across that message's recipient rows.

```
User
 |
 +-- Contact (owner_id, contact_user_id)
 |
 +-- ConversationParticipant (user_id, conversation_id, role)
              |
              v
        Conversation (type, name, direct_key)
              |
              v
           Message (conversation_id, sender_id, content)
              |
              v
        MessageStatus (message_id, user_id, status)
```

## 7. Authentication

```
Registration:  POST /auth/register  →  bcrypt-hash the password  →  insert into users
Login:         POST /auth/login     →  verify bcrypt hash        →  issue a JWT (sub=user_id, exp)
```

**Authenticated REST calls** send the token as a bearer header:
```
Authorization: Bearer <token>
```

**WebSocket authentication** is a first-message handshake, not a URL parameter:
```json
{ "type": "authenticate", "token": "<JWT>" }
```
The JWT is **never** placed in the WebSocket URL (`ws://.../ws`) — it would otherwise end up in server access logs and browser network-history URLs.

There is no server-side logout/session-revocation endpoint — sessions are stateless JWTs; "logout" on the frontend removes the token from `localStorage` and disconnects the WebSocket.

## 8. WebSocket Protocol

**Client → Server:** `authenticate`, `send_message`, `message_delivered`, `mark_read`, `typing_start`, `typing_stop`

**Server → Client:** `authenticated`, `new_message`, `message_status`, `messages_read`, `typing`, `group_updated`, `error`

Examples:

```json
// Client → Server: send_message
{ "type": "send_message", "conversation_id": 3, "content": "hey, are we still on for Friday?" }
```

```json
// Server → Client: new_message
{
  "type": "new_message",
  "message": {
    "id": 42,
    "conversation_id": 3,
    "sender": { "id": 1, "username": "alice", "display_name": "Alice Johnson", "avatar_url": null },
    "content": "hey, are we still on for Friday?",
    "created_at": "2026-10-07T14:30:00",
    "status": "sent"
  }
}
```

```json
// Client → Server: typing_start
{ "type": "typing_start", "conversation_id": 3 }
```

```json
// Client → Server: mark_read
{ "type": "mark_read", "conversation_id": 3 }
```

## 9. API Endpoints

**Auth**
| Method | Path | Description |
|---|---|---|
| POST | `/auth/register` | Create an account |
| POST | `/auth/login` | Exchange credentials for a JWT |
| GET | `/auth/me` | Resolve the current user from a bearer token |

**Contacts**
| Method | Path | Description |
|---|---|---|
| GET | `/contacts` | List the current user's contacts |
| POST | `/contacts/{user_id}` | Add a contact |
| DELETE | `/contacts/{user_id}` | Remove a contact |

**Conversations**
| Method | Path | Description |
|---|---|---|
| GET | `/conversations` | List the current user's conversations, newest activity first |
| POST | `/conversations/direct` | Create or reuse a direct conversation |
| POST | `/conversations/group` | Create a group conversation |
| GET | `/conversations/{conversation_id}` | Get conversation + participant detail |
| PATCH | `/conversations/{conversation_id}` | Rename a group / update its avatar URL (admin-only) |

**Messages**
| Method | Path | Description |
|---|---|---|
| GET | `/conversations/{conversation_id}/messages` | Paginated message history |
| POST | `/conversations/{conversation_id}/messages` | Send a message over REST |

**Groups / Member Management**
| Method | Path | Description |
|---|---|---|
| POST | `/conversations/{conversation_id}/members` | Add a member (admin-only) |
| DELETE | `/conversations/{conversation_id}/members/{user_id}` | Remove a member (admin-only) |
| PATCH | `/conversations/{conversation_id}/members/{user_id}` | Promote/demote a member's role (admin-only) |

Plus `GET /health` (liveness check) and the WebSocket endpoint at `/ws`.

## 10. Local Setup

**Backend:**
```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python -m app.db.init_db
python -m app.db.seed
uvicorn app.main:app --reload --port 8000
```

**Frontend:**
```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev
```

The frontend reads its API base URL from:
```
NEXT_PUBLIC_API_URL=http://localhost:8000
```

**CORS:** the backend's allowed origin list (`cors_origins` in `backend/app/core/config.py`) defaults to `http://localhost:3000` only. If the frontend runs on a different origin or port, add it to `cors_origins` (or set it via environment configuration) — otherwise the browser will block every request with a CORS error.

## 11. Seed Credentials

*Development only — never use these in a real deployment.*

Running `python -m app.db.seed` creates five users, all sharing the password below:

| Username | Display name |
|---|---|
| `alice` | Alice Johnson |
| `bob` | Bob Smith |
| `carol` | Carol Davis |
| `dave` | Dave Wilson |
| `erin` | Erin Clark |

Password for all seed users: `password123`

## 12. Testing

**Backend: 163 tests passing.**

```bash
cd backend
source venv/bin/activate
pytest
```

Test categories:
- Authentication (registration, login, token handling)
- Contacts (list/add/remove, authorization)
- Conversations (direct dedup, group creation, listing, detail)
- Messages (send, persist, paginate, validation)
- WebSocket (connection lifecycle, auth, real-time delivery, presence)
- Delivery/read receipts (monotonic status transitions, group aggregation)
- Typing indicators (ephemeral, membership-scoped)
- Group management (add/remove/promote/demote/rename, admin authorization)
- Security (authorization edge cases, removed-member access revocation)
- Full-suite regression (every prior test must stay green after each step)

**Frontend:**
```bash
cd frontend
npx next typegen
npx tsc --noEmit
npm run lint
npm run build
```
All four complete successfully with no errors.

## 13. Security Considerations

**Implemented:**
- bcrypt password hashing
- JWT with expiration (`exp` claim)
- JWT secret read from environment configuration, not hardcoded for production use
- Per-request authorization (every conversation/message/group route checks membership)
- Group admin authorization, enforced server-side independent of frontend UI hiding
- Per-recipient message status rows, so one user's status can never be read or written as another's
- JWT sent only in the WebSocket message body, never in the connection URL
- Input validation (message length/emptiness, group name, role enum, malformed JSON/WebSocket events all rejected safely)
- `password_hash` is never included in any API response

**Limitations (explicit, by assignment design):**
- No real end-to-end encryption — this is not a production-secure messaging product
- JWT is stored in browser `localStorage`, which is the assignment-acceptable approach but is not resistant to XSS the way an httpOnly cookie would be
- The WebSocket connection manager is in-process/in-memory — it does not survive a process restart and does not span multiple backend processes
- SQLite is appropriate for assignment/demo scale, not for concurrent production load
- Phone-based OTP verification is mocked (a fixed, unused code) rather than real SMS delivery

This application should not be described as production-secure.

## 14. Deployment Notes

- **Backend:** runs under FastAPI/Uvicorn (`uvicorn app.main:app`).
- **Frontend:** a standard Next.js app (`npm run build && npm run start`).
- Required environment variables: `SIGNAL_JWT_SECRET_KEY`, `SIGNAL_JWT_ALGORITHM`, `SIGNAL_ACCESS_TOKEN_EXPIRE_MINUTES` (backend); `NEXT_PUBLIC_API_URL` (frontend).
- **A production JWT secret MUST be supplied through environment configuration** — the code ships with an insecure, clearly-labeled development default that must never be reused.
- **CORS must include the deployed frontend's real origin** — the default only allows `localhost:3000`.
- SQLite's persistence depends entirely on the deployment environment's filesystem; an ephemeral filesystem (common on many PaaS platforms) would lose data on redeploy.

No deployment URL exists for this project — it has not been deployed.

## 15. Assignment Assumptions

- Phone-based OTP is mocked, not real SMS, per the assignment's explicit allowance.
- Real Signal cryptographic protocol is not implemented, per the assignment's explicit allowance.
- Voice/video calls are inert UI placeholders only.
- Stories and linked devices are out of scope and not present at all (not even as placeholders beyond what Settings documents as "Coming soon").
- SQLite was chosen as the persistence layer for assignment scope; see §17 for a production alternative.
- Redis/external pub-sub was intentionally omitted — a single in-process `ConnectionManager` is sufficient for a single-process deployment target.
- Contacts are drawn from known/seeded users; there is no global user-search endpoint (see §16).
- Group membership is modeled through `conversation_participants`, shared with direct conversations rather than a separate group-specific table.

## 16. Known Limitations

- No real Signal Protocol end-to-end encryption.
- No real SMS delivery for OTP (mocked/unused).
- No file or media attachments.
- No voice or video calls.
- No stories.
- No linked devices.
- **Contact discovery is limited**: adding a user as a contact requires already knowing their numeric user ID, because no global user-search endpoint was added. In practice this means the UI can only build on the contact graph already present in the seed data (or contacts added by ID directly through the API). This is a scope boundary, not a bug — building discovery would require a new backend search surface, which was intentionally not added.

## 17. Future Improvements

- Implement the real Signal Protocol for genuine end-to-end encryption
- Move persistence to PostgreSQL for production-scale concurrent access
- Introduce Redis (or another pub/sub broker) to let the WebSocket layer span multiple backend processes/instances
- Add object storage (e.g. S3-compatible) for message attachments
- Add push notifications for backgrounded/closed clients
- Add a proper contact-discovery/search endpoint
- Add refresh-token rotation instead of a single long-lived access token
- Move the JWT out of `localStorage` into a more XSS-resistant storage strategy (e.g. httpOnly cookie + CSRF protection)
