from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator


class RegisterRequest(BaseModel):
    username: str = Field(min_length=3, max_length=50)
    phone_number: str | None = Field(default=None, max_length=20)
    display_name: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=8, max_length=72)  # 72 bytes = bcrypt's hard limit
    avatar_url: str | None = Field(default=None, max_length=500)


class OtpRequestRequest(BaseModel):
    """Mock "send OTP" step. Stateless — identifies who the (fake) code would
    go to for display purposes only; nothing is generated, stored, or sent."""

    username: str | None = None
    phone_number: str | None = None


class OtpRequestResponse(BaseModel):
    message: str
    # Deliberately returned in the response: this is a disclosed development
    # mock, not real verification, so there is nothing to hide (the
    # assignment explicitly permits a fixed, known OTP).
    dev_otp: str


class RegisterWithOtpRequest(RegisterRequest):
    otp: str = Field(min_length=4, max_length=4)


class LoginRequest(BaseModel):
    username: str | None = None
    phone_number: str | None = None
    password: str

    @model_validator(mode="after")
    def _require_identifier(self) -> "LoginRequest":
        if not self.username and not self.phone_number:
            raise ValueError("Provide either username or phone_number")
        return self


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    phone_number: str | None
    display_name: str
    avatar_url: str | None
    is_online: bool
    last_seen_at: datetime | None
    created_at: datetime
