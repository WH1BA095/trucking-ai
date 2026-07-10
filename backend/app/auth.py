"""
Authentication & authorization: password hashing (bcrypt), JWT tokens, the
current-user dependency, permission checks, and the first-run admin seed.
"""
import logging
import time
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.config import settings
from app.database import SessionLocal, get_db
from app.models import User

logger = logging.getLogger("auth")

MIN_PASSWORD_LEN = 8
DEFAULT_JWT_SECRET = "dev-secret-change-me"
DEFAULT_ADMIN_PASSWORD = "admin123456"

# All permission keys the UI/checkboxes offer. Admins implicitly have all.
PERMISSIONS = [
    "view_map",
    "view_reports",
    "generate_reports",
    "view_alerts",
    "view_db",
    "manage_users",
]
ROLES = {"admin", "moderator"}


def validate_role(role: str) -> None:
    from fastapi import HTTPException, status
    if role not in ROLES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid role (allowed: {', '.join(ROLES)})")


def validate_permissions(perms: list[str]) -> None:
    from fastapi import HTTPException, status
    bad = [p for p in (perms or []) if p not in PERMISSIONS]
    if bad:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Unknown permissions: {', '.join(bad)}")

bearer = HTTPBearer(auto_error=False)


def validate_password(password: str) -> None:
    """Raise 400 if the password is too weak."""
    if len(password or "") < MIN_PASSWORD_LEN:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Password must be at least {MIN_PASSWORD_LEN} characters",
        )


# --- Login rate limiting (simple in-memory, per IP) ---
_LOGIN_WINDOW = 300      # seconds
_LOGIN_MAX_ATTEMPTS = 10
_login_hits: dict[str, deque] = defaultdict(deque)


def check_login_rate(ip: str) -> None:
    now = time.time()
    hits = _login_hits[ip]
    while hits and now - hits[0] > _LOGIN_WINDOW:
        hits.popleft()
    if len(hits) >= _LOGIN_MAX_ATTEMPTS:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Too many attempts, try again later")
    hits.append(now)


# Generic per-key rate limiter (used to cap expensive per-user endpoints — chat,
# report generation — so an authenticated user can't rack up LLM cost).
_rate_hits: dict[str, deque] = defaultdict(deque)


def rate_limit(key: str, max_calls: int, window: int) -> None:
    now = time.time()
    hits = _rate_hits[key]
    while hits and now - hits[0] > window:
        hits.popleft()
    if len(hits) >= max_calls:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Rate limit exceeded, slow down")
    hits.append(now)


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode(), password_hash.encode())
    except ValueError:
        return False


def create_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(hours=settings.jwt_expire_hours),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


def has_permission(user: User, permission: str) -> bool:
    return user.role == "admin" or permission in (user.permissions or [])


def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> User:
    if creds is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    try:
        payload = jwt.decode(creds.credentials, settings.jwt_secret, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")
    user = db.get(User, payload.get("sub"))
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User no longer exists")
    return user


def require_permission(permission: str):
    """Dependency factory: 403 unless the current user has the permission."""
    def _dep(user: User = Depends(get_current_user)) -> User:
        if not has_permission(user, permission):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied")
        return user
    return _dep


def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin only")
    return user


def seed_admin():
    """Create the default admin account on first run (admin / admin123456)."""
    db = SessionLocal()
    try:
        if db.query(User).count() == 0:
            db.add(User(
                username="admin",
                password_hash=hash_password(DEFAULT_ADMIN_PASSWORD),
                role="admin",
                permissions=list(PERMISSIONS),
            ))
            db.commit()
    finally:
        db.close()


def security_startup_warnings():
    """Loud warnings for insecure-by-default settings — must be fixed before hosting."""
    if settings.jwt_secret == DEFAULT_JWT_SECRET:
        logger.critical("SECURITY: JWT_SECRET is the default value — set a strong JWT_SECRET before hosting!")
    db = SessionLocal()
    try:
        admin = db.query(User).filter(User.username == "admin").first()
        if admin and verify_password(DEFAULT_ADMIN_PASSWORD, admin.password_hash):
            logger.critical("SECURITY: default admin password is unchanged — change it before hosting!")
    finally:
        db.close()
