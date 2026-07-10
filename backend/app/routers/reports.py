import logging
import threading

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db, SessionLocal
from app.models import TruckReport, Vehicle, User
from app.schemas import ReportOut, GenerateReportRequest
from app.agent.reports import generate_report
from app.auth import get_current_user, require_permission

router = APIRouter(prefix="/reports", tags=["reports"])
logger = logging.getLogger("reports")

# Guards against overlapping bulk runs (each is 1 LLM call per vehicle).
_bulk_lock = threading.Lock()


@router.get("", response_model=list[ReportOut])
def list_reports(vehicle_id: str | None = None, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Saved reports, newest first. Users see their own; admins see everyone's."""
    q = db.query(TruckReport)
    if user.role != "admin":
        q = q.filter(TruckReport.user_id == user.id)
    if vehicle_id:
        q = q.filter(TruckReport.vehicle_id == vehicle_id)
    return q.order_by(TruckReport.created_at.desc()).all()


@router.post("/generate", response_model=ReportOut)
def generate(body: GenerateReportRequest, user: User = Depends(require_permission("generate_reports")), db: Session = Depends(get_db)):
    """Generate + save a report for a vehicle on demand (the "Generate report" button)."""
    vehicle = db.get(Vehicle, body.vehicle_id)
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    return generate_report(db, vehicle, user.id)


def _bulk_generate(user_id: str):
    """Generate a fresh report for every vehicle (runs in a background thread)."""
    db = SessionLocal()
    try:
        for v in db.query(Vehicle).all():
            try:
                generate_report(db, v, user_id)
            except Exception:
                logger.exception("bulk report failed for vehicle %s", v.name)
    finally:
        db.close()
        _bulk_lock.release()


@router.post("/generate-all")
def generate_all(user: User = Depends(require_permission("generate_reports")), db: Session = Depends(get_db)):
    """Kick off report generation for the whole fleet in the background."""
    if not _bulk_lock.acquire(blocking=False):
        raise HTTPException(status_code=409, detail="A bulk report run is already in progress")
    total = db.query(Vehicle).count()
    threading.Thread(target=_bulk_generate, args=(user.id,), daemon=True).start()
    return {"started": True, "count": total}
