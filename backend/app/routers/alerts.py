from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Vehicle
from app.schemas import AlertOut
from app.notifications import build_alert_message
from app.auth import get_current_user

router = APIRouter(prefix="/alerts", tags=["alerts"], dependencies=[Depends(get_current_user)])

# Only these levels are shown as alerts; "info"/"ok" are not actionable.
ALERT_LEVELS = {"critical": 0, "warning": 1, "emissions": 2}
SEV_RANK = {"high": 0, "medium": 1, "low": 2}


def _max_severity(fault_codes) -> str | None:
    """Highest per-code severity on the vehicle (high > medium > low)."""
    sevs = {c.get("severity") for c in (fault_codes or [])}
    for s in ("high", "medium", "low"):
        if s in sevs:
            return s
    return None


@router.get("", response_model=list[AlertOut])
def list_alerts(db: Session = Depends(get_db)):
    """Vehicles with an active fault lamp, most severe first.

    Two dimensions: the J1939 lamp level (drivability — critical = red STOP =
    not drivable) and the worst individual fault-code severity. Sorted by lamp
    level, then by worst code severity, so high-severity faults surface first.
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
            max_severity=_max_severity(v.fault_codes),
            lamps=d.get("lamps") or [],
            fault_codes=v.fault_codes,
            message=build_alert_message(v, d) if level == "critical" else "",
        ))
    out.sort(key=lambda a: (ALERT_LEVELS[a.alert_level], SEV_RANK.get(a.max_severity, 3), a.name))
    return out
