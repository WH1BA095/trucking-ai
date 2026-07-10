"""
Authentication & authorization: password hashing (bcrypt), JWT tokens, the
current-user dependency, permission checks, and the first-run admin seed.
"""
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.config import settings
from app.database import SessionLocal, get_db
from app.models import User

# All permission keys the UI/checkboxes offer. Admins implicitly have all.
PERMISSIONS = [
    "view_map",
    "view_reports",
    "generate_reports",
    "view_alerts",
    "view_db",
    "manage_users",
]

bearer = HTTPBearer(auto_error=False)


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
                password_hash=hash_password("admin123456"),
                role="admin",
                permissions=list(PERMISSIONS),
            ))
            db.commit()
    finally:
        db.close()
