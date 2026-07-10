from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User
from app.schemas import (
    LoginRequest, TokenResponse, UserOut, ProfileUpdate, UserCreate, UserUpdate,
)
from app.auth import (
    PERMISSIONS, hash_password, verify_password, create_token,
    get_current_user, require_admin,
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == body.username).first()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    return TokenResponse(token=create_token(user.id), user=user)


@router.get("/permissions")
def list_permissions():
    """The full set of permission keys for the admin's checkboxes."""
    return PERMISSIONS


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user


@router.patch("/me", response_model=UserOut)
def update_me(body: ProfileUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """The user edits their own profile (login, password, avatar)."""
    if body.username and body.username != user.username:
        if db.query(User).filter(User.username == body.username, User.id != user.id).first():
            raise HTTPException(status_code=409, detail="Username already taken")
        user.username = body.username
    if body.password:
        user.password_hash = hash_password(body.password)
    if body.avatar is not None:
        user.avatar = body.avatar
    db.commit()
    db.refresh(user)
    return user


# --- Admin user management ---

@router.get("/users", response_model=list[UserOut])
def list_users(_: User = Depends(require_admin), db: Session = Depends(get_db)):
    return db.query(User).order_by(User.created_at).all()


@router.post("/users", response_model=UserOut)
def create_user(body: UserCreate, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    if db.query(User).filter(User.username == body.username).first():
        raise HTTPException(status_code=409, detail="Username already taken")
    user = User(
        username=body.username,
        password_hash=hash_password(body.password),
        role=body.role,
        permissions=body.permissions,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.patch("/users/{user_id}", response_model=UserOut)
def update_user(user_id: str, body: UserUpdate, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if body.username and body.username != user.username:
        if db.query(User).filter(User.username == body.username, User.id != user_id).first():
            raise HTTPException(status_code=409, detail="Username already taken")
        user.username = body.username
    if body.password:
        user.password_hash = hash_password(body.password)
    if body.role is not None:
        user.role = body.role
    if body.permissions is not None:
        user.permissions = body.permissions
    db.commit()
    db.refresh(user)
    return user


@router.delete("/users/{user_id}")
def delete_user(user_id: str, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    if user_id == admin.id:
        raise HTTPException(status_code=400, detail="You can't delete your own account")
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    db.delete(user)
    db.commit()
    return {"deleted": True}
