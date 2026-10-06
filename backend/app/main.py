from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.routers import auth, contacts, conversations, messages, users
from app.websocket import endpoint as websocket_endpoint

app = FastAPI(title=settings.app_name)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(contacts.router, prefix="/contacts", tags=["contacts"])
app.include_router(users.router, prefix="/users", tags=["users"])
app.include_router(conversations.router, prefix="/conversations", tags=["conversations"])
app.include_router(
    messages.router, prefix="/conversations/{conversation_id}/messages", tags=["messages"]
)
app.include_router(websocket_endpoint.router, tags=["websocket"])


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
