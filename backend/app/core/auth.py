import jwt
from fastapi import HTTPException, Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .config import settings

_bearer = HTTPBearer(auto_error=False)


def require_auth(creds: HTTPAuthorizationCredentials | None = Security(_bearer)) -> None:
    if not settings.auth_enabled:
        return  # auth explicitly disabled (AUTH_ENABLED=false)
    if not creds:
        raise HTTPException(status_code=401, detail="Missing token")
    try:
        jwt.decode(creds.credentials, settings.jwt_secret.get_secret_value(), algorithms=["HS256"])
    except jwt.PyJWTError:
        # `from None`: why the token failed is not the caller's business.
        raise HTTPException(status_code=401, detail="Invalid or expired token") from None
