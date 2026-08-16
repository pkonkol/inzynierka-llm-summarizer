import jwt
import structlog
from fastapi import HTTPException, Request, Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .config import settings

log = structlog.get_logger(__name__)

_bearer = HTTPBearer(auto_error=False)


def require_auth(
    request: Request, creds: HTTPAuthorizationCredentials | None = Security(_bearer)
) -> None:
    if not settings.auth_enabled:
        return  # auth explicitly disabled (AUTH_ENABLED=false)
    if not creds:
        log.warning("unauthorized request", path=request.url.path, reason="missing_token")
        raise HTTPException(status_code=401, detail="Missing token")
    try:
        jwt.decode(creds.credentials, settings.jwt_secret.get_secret_value(), algorithms=["HS256"])
    except jwt.PyJWTError:
        log.warning("unauthorized request", path=request.url.path, reason="invalid_token")
        # `from None`: why the token failed is not the caller's business.
        raise HTTPException(status_code=401, detail="Invalid or expired token") from None
