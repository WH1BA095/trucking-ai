"""
Pulls fresh data from Samsara and writes it into our own database.

This is the piece that makes the chat agent fast and independent of Samsara's
uptime/rate limits at chat time: the agent only ever reads from Postgres,
never calls Samsara live during a conversation.

Runs on a simple interval (APScheduler) for now. If you later get access to
Samsara webhooks, you can add a `/webhooks/samsara` route that updates the
same tables on push instead of poll — no other code needs to change.
"""
import logging
from datetime import datetime

from apscheduler.schedulers.background import BackgroundScheduler

from app.config import settings
from app.database import SessionLocal
from app.models import Vehicle, VehicleEvent
from app.samsara_client import samsara_client

logger = logging.getLogger("sync_job")


def _extract_fault_codes(fault_block: dict | None) -> list[dict]:
    """Flatten Samsara's J1939 fault data into a simple list of code dicts.

    Returns [] when the vehicle reports no stored diagnostic trouble codes.
    """
    j1939 = (fault_block or {}).get("j1939") or {}
    codes = []
    for dtc in j1939.get("diagnosticTroubleCodes") or []:
        codes.append({
            "spn": dtc.get("spnId"),
            "fmi": dtc.get("fmiId"),
            "description": dtc.get("spnDescription"),
            "fault": dtc.get("fmiDescription"),
            "source": dtc.get("sourceAddressName"),
            "count": dtc.get("occurrenceCount"),
        })
    return codes


def _has_active_warning(fault_block: dict | None) -> bool:
    """True if a dashboard check-engine light is currently lit (the urgent case).

    Distinct from merely having stored DTCs: most trucks carry historical codes,
    so we reserve the "fault" status for an actually-lit warning lamp and still
    surface the full code list separately for the detail view.
    """
    lights = ((fault_block or {}).get("j1939") or {}).get("checkEngineLights") or {}
    return any(bool(v) for v in lights.values())


def _derive_status(engine_state: str | None, speed_mph: float | None, active_warning: bool) -> str:
    """Collapse telemetry into the coarse buckets the map/summary use."""
    if active_warning:
        return "fault"
    if engine_state == "On" and (speed_mph or 0) > 0:
        return "moving"
    return "idle"


def _stat_value(stats: dict, key: str):
    """Samsara scalar stats arrive as {value, time}; pull the value or None."""
    v = stats.get(key)
    return v.get("value") if isinstance(v, dict) else None


def _round(x, n=1):
    return round(x, n) if isinstance(x, (int, float)) else None


def _build_details(vehicle: dict, stats: dict) -> dict:
    """Normalize static + telemetry into human units for the detail panel/reports."""
    odo_m = _stat_value(stats, "obdOdometerMeters")
    eng_s = _stat_value(stats, "obdEngineSeconds")
    def_mp = _stat_value(stats, "defLevelMilliPercent")
    coolant_mc = _stat_value(stats, "engineCoolantTemperatureMilliC")
    batt_mv = _stat_value(stats, "batteryMilliVolts")
    ambient_mc = _stat_value(stats, "ambientAirTemperatureMilliC")

    def c_to_f(milli_c):
        return _round(milli_c / 1000 * 9 / 5 + 32) if isinstance(milli_c, (int, float)) else None

    gps = stats.get("gps") or {}
    location = (gps.get("reverseGeo") or {}).get("formattedLocation")

    return {
        # location (human-readable address from Samsara reverse-geo)
        "location": location,
        # static
        "vin": vehicle.get("vin"),
        "make": vehicle.get("make"),
        "model": vehicle.get("model"),
        "year": vehicle.get("year"),
        "license_plate": vehicle.get("licensePlate"),
        "tags": [t.get("name") for t in (vehicle.get("tags") or []) if t.get("name")],
        # telemetry (human units)
        "odometer_miles": _round(odo_m * 0.000621371, 0) if isinstance(odo_m, (int, float)) else None,
        "engine_hours": _round(eng_s / 3600, 0) if isinstance(eng_s, (int, float)) else None,
        "def_percent": _round(def_mp / 1000) if isinstance(def_mp, (int, float)) else None,
        "coolant_temp_f": c_to_f(coolant_mc),
        "battery_volts": _round(batt_mv / 1000, 2) if isinstance(batt_mv, (int, float)) else None,
        "ambient_temp_f": c_to_f(ambient_mc),
        "engine_rpm": _stat_value(stats, "engineRpm"),
        "engine_load_percent": _stat_value(stats, "engineLoadPercent"),
    }


def _driver_map(assignments: list[dict]) -> dict[str, str]:
    """vehicle_id -> current driver name (latest non-passenger assignment)."""
    best: dict[str, tuple[str, str]] = {}  # vid -> (startTime, name)
    for a in assignments:
        if a.get("isPassenger"):
            continue
        vid = (a.get("vehicle") or {}).get("id")
        name = (a.get("driver") or {}).get("name")
        start = a.get("startTime") or ""
        if not vid or not name:
            continue
        if vid not in best or start > best[vid][0]:
            best[vid] = (start, name)
    return {vid: name for vid, (_, name) in best.items()}


def sync_vehicles_once():
    db = SessionLocal()
    try:
        vehicles = samsara_client.list_vehicles()
        # One call returns gps + engine + faults + telemetry for the whole fleet.
        stats = {s["id"]: s for s in samsara_client.get_vehicle_stats()}
        drivers = _driver_map(samsara_client.get_driver_assignments())

        for v in vehicles:
            vehicle_id = str(v["id"])
            s = stats.get(v["id"], {})
            gps = s.get("gps") or {}
            engine_state = (s.get("engineState") or {}).get("value")
            speed_mph = gps.get("speedMilesPerHour")

            fault_block = s.get("faultCodes")
            fault_codes = _extract_fault_codes(fault_block)
            new_status = _derive_status(engine_state, speed_mph, _has_active_warning(fault_block))

            video_url = (
                samsara_client.get_latest_dashcam_media(vehicle_id)
                if settings.samsara_fetch_media else None
            )

            existing = db.get(Vehicle, vehicle_id)
            if existing is None:
                existing = Vehicle(id=vehicle_id)
                db.add(existing)

            # Log an event when the status actually changes — this is what
            # summaries/reports read from, not just the current snapshot.
            if existing.status and existing.status != new_status:
                db.add(VehicleEvent(
                    vehicle_id=vehicle_id,
                    event_type="status_change",
                    description=f"{existing.status} -> {new_status}",
                ))

            existing.name = v.get("name", vehicle_id)
            existing.driver_name = drivers.get(v["id"])
            existing.latitude = gps.get("latitude")
            existing.longitude = gps.get("longitude")
            existing.heading = gps.get("headingDegrees")
            existing.speed_mph = speed_mph
            existing.status = new_status
            existing.engine_state = engine_state
            existing.fault_codes = fault_codes
            existing.details = _build_details(v, s)
            existing.last_video_url = video_url
            existing.raw_samsara_payload = {"vehicle": v, "stats": s}
            existing.updated_at = datetime.utcnow()

        db.commit()
        logger.info("Synced %d vehicles from Samsara", len(vehicles))
    except Exception:
        logger.exception("Samsara sync failed")
        db.rollback()
    finally:
        db.close()


scheduler = BackgroundScheduler()


def start_scheduler():
    scheduler.add_job(sync_vehicles_once, "interval", seconds=settings.sync_interval_seconds, id="samsara_sync")
    scheduler.start()
    # Run once immediately on startup instead of waiting for the first interval.
    sync_vehicles_once()
