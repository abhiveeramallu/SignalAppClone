from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent.parent


class Settings(BaseSettings):
    app_name: str = "Signal Clone API"
    database_path: Path = BACKEND_DIR / "signal_clone.db"
    cors_origins: list[str] = ["http://localhost:3000"]

    # Local filesystem storage for message attachments — fine for an
    # assignment/demo, but NOT durable: on an ephemeral filesystem (e.g.
    # Render's default disk), everything under this directory is lost on
    # every redeploy/restart. See README for the production caveat.
    uploads_dir: Path = BACKEND_DIR / "uploads"
    max_upload_size_bytes: int = 10 * 1024 * 1024  # 10 MB
    # Extension -> MIME allowlist (checked together, never extension alone —
    # Part 3F explicitly rules out trusting the extension by itself).
    allowed_upload_types: dict[str, set[str]] = {
        ".jpg": {"image/jpeg"},
        ".jpeg": {"image/jpeg"},
        ".png": {"image/png"},
        ".gif": {"image/gif"},
        ".webp": {"image/webp"},
        ".pdf": {"application/pdf"},
        ".txt": {"text/plain"},
        ".doc": {"application/msword"},
        ".docx": {"application/vnd.openxmlformats-officedocument.wordprocessingml.document"},
        ".zip": {"application/zip", "application/x-zip-compressed"},
    }

    # Development-only default so the app can boot without a .env file.
    # Production MUST set SIGNAL_JWT_SECRET_KEY to a strong random secret.
    jwt_secret_key: str = "dev-only-insecure-secret-change-me"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24  # 24h, convenient for assignment/dev use

    # Fixed mock OTP for the registration-verification flow the assignment
    # explicitly allows ("verification can be mocked with a fixed OTP").
    # Checked by POST /auth/register/verify-otp. Never generated, stored, or
    # sent anywhere — it's a single hardcoded value, not real phone
    # verification, and is deliberately the same for every registration.
    mock_otp_code: str = "1234"

    model_config = SettingsConfigDict(env_file=".env", env_prefix="SIGNAL_")


settings = Settings()
