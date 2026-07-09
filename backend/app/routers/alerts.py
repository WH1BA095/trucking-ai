from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Vehicle
from app.schemas import AlertOut
from app.notifications import build_alert_message

router = APIRouter(prefix="/alerts", tags=["alerts"])

# Only these levels are shown as alerts; "info"/"ok" are not actionable.
ALERT_LEVELS = {"critical": 0, "warning": 1, "emissions": 2}


@router.get("", response_model=list[AlertOut])
def list_alerts(db: Session = Depends(get_db)):
    """Vehicles with an active fault lamp, most severe first.

    Severity comes from the J1939 lamp hierarchy computed in sync_job
    (critical = red STOP = not drivable; warning/emissions = drivable).
    """
    out = []
    for v in db.query(Vehicle).all():
        d = v.details or {}
        level = d.get("alert_level")
        if level not in ALERT_LEVELS:
            continue
        drivable = bool(d.get("drivable", level != "critical"))
        out.append(AlertOut(
            vehicle_id=v.id,
            name=v.name,
            driver_name=v.driver_name,
            latitude=v.latitude,
            longitude=v.longitude,
            location=d.get("location"),
            alert_level=level,
            drivable=drivable,
            lamps=d.get("lamps") or [],
            fault_codes=v.fault_codes,
            message=build_alert_message(v, d) if level == "critical" else "",
        ))
    out.sort(key=lambda a: (ALERT_LEVELS[a.alert_level], a.name))
    return out
