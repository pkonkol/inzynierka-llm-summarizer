import hmac
from datetime import UTC, datetime, timedelta

import jwt
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..core.config import settings

router = APIRouter(prefix="/auth", tags=["auth"])


class TokenRequest(BaseModel):
    password: str


class TokenResponse(BaseModel):
    token: str


class AuthStatusResponse(BaseModel):
    enabled: bool


@router.get("/status", response_model=AuthStatusResponse)
def get_auth_status() -> AuthStatusResponse:
    return AuthStatusResponse(enabled=settings.auth_enabled)


@router.post("/token", response_model=TokenResponse)
def get_token(payload: TokenRequest) -> TokenResponse:
    if not settings.auth_enabled:
        raise HTTPException(status_code=404, detail="Authentication is disabled")
    if not hmac.compare_digest(payload.password, settings.auth_secret.get_secret_value()):
        raise HTTPException(status_code=401, detail="Invalid password")
    exp = datetime.now(UTC) + timedelta(hours=settings.jwt_expire_hours)
    token = jwt.encode({"exp": exp}, settings.jwt_secret.get_secret_value(), algorithm="HS256")
    return TokenResponse(token=token)
