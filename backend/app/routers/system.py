"""
System health journal for the owner: view the self-test / runtime-error log,
run a self-test on demand, or clear the journal.

Gated behind the `view_logs` permission (admins have it implicitly). This is an
owner-facing "is everything healthy?" view, separate from the customer/admin UI.
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.auth import require_permission, rate_limit, User
from app.database import get_db
from app.models import SystemLog
from app.schemas import SystemLogOut
from app.selftest import run_self_test

router = APIRouter(prefix="/system", tags=["system"])

LOG_LIMIT = 500  # journal is a recent-history view, not an archive


@router.get("/logs", response_model=list[SystemLogOut])
def list_logs(
    kind: str | None = Query(None, description='Filter by kind: "scheduled_test" or "runtime_error"'),
    _user: User = Depends(require_permission("view_logs")),
    db: Session = Depends(get_db),
):
    """Most recent system-log rows, newest first, optionally filtered by kind."""
    q = db.query(SystemLog)
    if kind:
        q = q.filter(SystemLog.kind == kind)
    return q.order_by(SystemLog.created_at.desc()).limit(LOG_LIMIT).all()


@router.post("/selftest", response_model=list[SystemLogOut])
def run_selftest_now(
    user: User = Depends(require_permission("view_logs")),
    db: Session = Depends(get_db),
):
    """Run the health self-test right now and return the fresh result rows."""
    rate_limit(f"selftest:{user.id}", max_calls=6, window=60)  # self-test hits Samsara + Anthropic
    run_self_test()
    return (
        db.query(SystemLog)
        .filter(SystemLog.kind == "scheduled_test")
        .order_by(SystemLog.created_at.desc())
        .limit(20)
        .all()
    )


@router.delete("/logs")
def clear_logs(
    kind: str | None = Query(None, description="Only clear this kind; omit to clear everything"),
    _user: User = Depends(require_permission("view_logs")),
    db: Session = Depends(get_db),
):
    """Clear the journal (optionally just one kind)."""
    q = db.query(SystemLog)
    if kind:
        q = q.filter(SystemLog.kind == kind)
    deleted = q.delete(synchronize_session=False)
    db.commit()
    return {"deleted": deleted}
