from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent.parent


class Settings(BaseSettings):
    app_name: str = "Signal Clone API"
    database_path: Path = BACKEND_DIR / "signal_clone.db"
    cors_origins: list[str] = ["http://localhost:3000"]

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
