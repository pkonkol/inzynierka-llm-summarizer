from datetime import datetime, timedelta, timezone

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
    return AuthStatusResponse(enabled=bool(settings.auth_secret))


@router.post("/token", response_model=TokenResponse)
def get_token(payload: TokenRequest) -> TokenResponse:
    if not settings.auth_secret:
        raise HTTPException(status_code=404, detail="Authentication is disabled")
    if payload.password != settings.auth_secret:
        raise HTTPException(status_code=401, detail="Invalid password")
    exp = datetime.now(timezone.utc) + timedelta(hours=settings.jwt_expire_hours)
    token = jwt.encode({"exp": exp}, settings.jwt_secret, algorithm="HS256")
    return TokenResponse(token=token)
