import logging
import threading

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db, SessionLocal
from app.models import TruckReport, Vehicle
from app.schemas import ReportOut, GenerateReportRequest
from app.agent.reports import generate_report

router = APIRouter(prefix="/reports", tags=["reports"])
logger = logging.getLogger("reports")

# Guards against overlapping bulk runs (each is 1 LLM call per vehicle).
_bulk_lock = threading.Lock()


@router.get("", response_model=list[ReportOut])
def list_reports(vehicle_id: str | None = None, db: Session = Depends(get_db)):
    """All saved truck reports, newest first. Optionally filter by vehicle_id.

    The Reports tab loads everything once and groups by vehicle client-side.
    """
    q = db.query(TruckReport)
    if vehicle_id:
        q = q.filter(TruckReport.vehicle_id == vehicle_id)
    return q.order_by(TruckReport.created_at.desc()).all()


@router.post("/generate", response_model=ReportOut)
def generate(body: GenerateReportRequest, db: Session = Depends(get_db)):
    """Generate + save a report for a vehicle on demand (the "Generate report" button)."""
    vehicle = db.get(Vehicle, body.vehicle_id)
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    return generate_report(db, vehicle)


def _bulk_generate():
    """Generate a fresh report for every vehicle (runs in a background thread).

    Each report is a new append-only row, so prior reports are preserved for
    comparison. Commits per-vehicle so the Reports tab fills in progressively.
    """
    db = SessionLocal()
    try:
        vehicles = db.query(Vehicle).all()
        for v in vehicles:
            try:
                generate_report(db, v)
            except Exception:
                logger.exception("bulk report failed for vehicle %s", v.name)
    finally:
        db.close()
        _bulk_lock.release()


@router.post("/generate-all")
def generate_all(db: Session = Depends(get_db)):
    """Kick off report generation for the whole fleet in the background.

    Returns immediately with the number of vehicles queued; the frontend polls
    GET /reports to watch them appear. One LLM call per vehicle.
    """
    if not _bulk_lock.acquire(blocking=False):
        raise HTTPException(status_code=409, detail="A bulk report run is already in progress")
    total = db.query(Vehicle).count()
    threading.Thread(target=_bulk_generate, daemon=True).start()
    return {"started": True, "count": total}
