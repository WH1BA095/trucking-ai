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
from datetime import datetime, timedelta, timezone

from apscheduler.schedulers.background import BackgroundScheduler

from app.config import settings
from app.database import SessionLocal
from app.models import Vehicle, VehicleEvent
from app.notifications import notify_admin_critical
from app.samsara_client import samsara_client
from app.selftest import record_exception, run_self_test

logger = logging.getLogger("sync_job")


def _dtc_severity(dtc: dict) -> str:
    """Per-code severity from the J1939 FMI description + MIL status.

    Samsara's fmiDescription carries the severity words ("High—most severe",
    "moderate", "least"); MIL on means the code is actively lighting a lamp.
    """
    desc = (dtc.get("fmiDescription") or "").lower()
    if "most severe" in desc:
        return "high"
    if "moderate" in desc:
        return "medium"
    if "least" in desc or "low" in desc:
        return "low"
    return "medium" if dtc.get("milStatus") else "low"


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
            "severity": _dtc_severity(dtc),
            "mil": bool(dtc.get("milStatus")),
        })
    return codes


def _active_lamps(fault_block: dict | None) -> list[str]:
    lights = ((fault_block or {}).get("j1939") or {}).get("checkEngineLights") or {}
    return [k.replace("IsOn", "") for k, v in lights.items() if v]


def _has_active_warning(fault_block: dict | None) -> bool:
    """True if any dashboard check-engine light is currently lit."""
    return bool(_active_lamps(fault_block))


def _alert_level(fault_block: dict | None, fault_codes: list[dict]) -> str:
    """Fleet-wide severity bucket, following the J1939 lamp hierarchy.

    critical  = red STOP lamp — do not drive, stop now.
    warning   = amber warning/protect lamp — drivable, service soon.
    emissions = emissions lamp (DEF/DPF) — drivable, schedule service.
    info      = stored codes but no lamp lit.
    ok        = nothing.
    """
    lights = ((fault_block or {}).get("j1939") or {}).get("checkEngineLights") or {}
    if lights.get("stopIsOn"):
        return "critical"
    if lights.get("warningIsOn") or lights.get("protectIsOn"):
        return "warning"
    if lights.get("emissionsIsOn"):
        return "emissions"
    return "info" if fault_codes else "ok"


def _derive_status(engine_state: str | None, speed_mph: float | None) -> str:
    """Motion only — moving vs stopped. Fault is a separate dimension now
    (see alert_level), so a moving truck with a lit lamp still reads as 'moving'
    on the map, with the fault shown as a separate marker."""
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


def _driver_map(assignments: list[dict]) -> dict[str, dict]:
    """vehicle_id -> {name, id} of the current driver (latest non-passenger assignment)."""
    best: dict[str, tuple[str, dict]] = {}  # vid -> (startTime, {name, id})
    for a in assignments:
        if a.get("isPassenger"):
            continue
        vid = (a.get("vehicle") or {}).get("id")
        driver = a.get("driver") or {}
        name = driver.get("name")
        start = a.get("startTime") or ""
        if not vid or not name:
            continue
        if vid not in best or start > best[vid][0]:
            best[vid] = (start, {"name": (name or "").strip(), "id": driver.get("id")})
    return {vid: info for vid, (_, info) in best.items()}


FUEL_WINDOW_DAYS = 7  # rolling window for the Fuel & Energy report


def _fuel_map(reports: list[dict]) -> dict[str, dict]:
    """vehicle_id -> normalized fuel economy over the report window (human units)."""

    def gallons(ml):
        return round(ml / 3785.411784, 1) if isinstance(ml, (int, float)) else None

    def miles(m):
        return round(m * 0.000621371) if isinstance(m, (int, float)) else None

    out: dict[str, dict] = {}
    for r in reports:
        vid = (r.get("vehicle") or {}).get("id")
        if not vid:
            continue
        run = r.get("engineRunTimeDurationMs") or 0
        idle = r.get("engineIdleTimeDurationMs") or 0
        mpg = r.get("efficiencyMpge")
        cost = (r.get("estFuelEnergyCost") or {}).get("amount")
        out[str(vid)] = {
            # mpg is 0 for trucks that barely moved (parked/idling) — not meaningful, drop it.
            "mpg": round(mpg, 1) if isinstance(mpg, (int, float)) and mpg else None,
            "gallons": gallons(r.get("fuelConsumedMl")),
            "miles": miles(r.get("distanceTraveledMeters")),
            "cost_usd": round(cost) if isinstance(cost, (int, float)) else None,
            "idle_pct": round(idle / run * 100) if run else None,
            "period_days": FUEL_WINDOW_DAYS,
        }
    return out


def _hos_map(clocks: list[dict]) -> dict[str, dict]:
    """driver_id -> normalized HOS: duty status + remaining hours + violation flag."""

    def hours(ms):
        return round(ms / 3_600_000, 1) if isinstance(ms, (int, float)) else None

    out = {}
    for c in clocks:
        did = (c.get("driver") or {}).get("id")
        if not did:
            continue
        clk = c.get("clocks") or {}
        viol = c.get("violations") or {}
        out[did] = {
            "status": (c.get("currentDutyStatus") or {}).get("hosStatusType"),
            "drive_remaining_h": hours((clk.get("drive") or {}).get("driveRemainingDurationMs")),
            "shift_remaining_h": hours((clk.get("shift") or {}).get("shiftRemainingDurationMs")),
            "cycle_remaining_h": hours((clk.get("cycle") or {}).get("cycleRemainingDurationMs")),
            "break_in_h": hours((clk.get("break") or {}).get("timeUntilBreakDurationMs")),
            "violation": any((viol.get(k) or 0) > 0 for k in viol),
        }
    return out


def sync_vehicles_once():
    db = SessionLocal()
    try:
        vehicles = samsara_client.list_vehicles()
        # One call returns gps + engine + faults + telemetry for the whole fleet.
        stats = {s["id"]: s for s in samsara_client.get_vehicle_stats()}
        drivers = _driver_map(samsara_client.get_driver_assignments())
        try:
            hos_by_driver = _hos_map(samsara_client.get_hos_clocks())
        except Exception:
            # HOS needs the ELD token scope; if it's missing don't fail the sync.
            logger.warning("HOS fetch failed (missing ELD scope?) — skipping HOS this run")
            hos_by_driver = {}

        try:
            now = datetime.now(timezone.utc)
            start = now - timedelta(days=FUEL_WINDOW_DAYS)
            rfc = lambda d: d.strftime("%Y-%m-%dT%H:%M:%SZ")  # noqa: E731
            fuel_by_vehicle = _fuel_map(samsara_client.get_fuel_energy(rfc(start), rfc(now)))
        except Exception:
            # Fuel & Energy needs the Fuel/Reports scope; skip it rather than fail the sync.
            logger.warning("Fuel & Energy fetch failed (missing scope?) — skipping fuel this run")
            fuel_by_vehicle = {}

        for v in vehicles:
            vehicle_id = str(v["id"])
            s = stats.get(v["id"], {})
            gps = s.get("gps") or {}
            engine_state = (s.get("engineState") or {}).get("value")
            speed_mph = gps.get("speedMilesPerHour")

            fault_block = s.get("faultCodes")
            fault_codes = _extract_fault_codes(fault_block)
            new_status = _derive_status(engine_state, speed_mph)
            alert_level = _alert_level(fault_block, fault_codes)

            video_url = (
                samsara_client.get_latest_dashcam_media(vehicle_id)
                if settings.samsara_fetch_media else None
            )

            existing = db.get(Vehicle, vehicle_id)
            if existing is None:
                existing = Vehicle(id=vehicle_id)
                db.add(existing)

            prev_level = (existing.details or {}).get("alert_level")

            # Log an event when the status actually changes — this is what
            # summaries/reports read from, not just the current snapshot.
            if existing.status and existing.status != new_status:
                db.add(VehicleEvent(
                    vehicle_id=vehicle_id,
                    event_type="status_change",
                    description=f"{existing.status} -> {new_status}",
                ))

            driver_info = drivers.get(v["id"]) or {}

            details = _build_details(v, s)
            details["alert_level"] = alert_level
            details["drivable"] = alert_level != "critical"
            details["lamps"] = _active_lamps(fault_block)
            details["hos"] = hos_by_driver.get(driver_info.get("id"))

            # Fuel: 7-day economy report + (when the truck reports it) the live
            # tank level %, converted to gallons via the configured tank size.
            # Most tractors don't broadcast fuelPercents, so level stays absent.
            fuel = dict(fuel_by_vehicle.get(vehicle_id) or {})
            # Samsara quirk: request type is "fuelPercents" (plural) but the
            # response key is "fuelPercent" (singular), as {time, value}.
            fp = s.get("fuelPercent")
            level_pct = fp.get("value") if isinstance(fp, dict) else (fp if isinstance(fp, (int, float)) else None)
            if level_pct is not None:
                fuel["level_percent"] = level_pct
                if settings.fuel_tank_gallons:
                    fuel["remaining_gallons"] = round(settings.fuel_tank_gallons * level_pct / 100, 1)
            details["fuel"] = fuel or None

            existing.name = v.get("name", vehicle_id)
            existing.driver_name = driver_info.get("name")
            existing.latitude = gps.get("latitude")
            existing.longitude = gps.get("longitude")
            existing.heading = gps.get("headingDegrees")
            existing.speed_mph = speed_mph
            existing.status = new_status
            existing.engine_state = engine_state
            existing.fault_codes = fault_codes
            existing.details = details
            existing.last_video_url = video_url
            existing.raw_samsara_payload = {"vehicle": v, "stats": s}
            existing.updated_at = datetime.now(timezone.utc)

            # Fire the admin alert hook when a truck newly becomes non-drivable.
            if alert_level == "critical" and prev_level != "critical":
                db.add(VehicleEvent(
                    vehicle_id=vehicle_id,
                    event_type="critical_fault",
                    description=f"Critical fault at {details.get('location') or 'unknown location'}",
                ))
                notify_admin_critical(existing, details)

        db.commit()
        logger.info("Synced %d vehicles from Samsara", len(vehicles))
    except Exception as exc:
        logger.exception("Samsara sync failed")
        db.rollback()
        # Surface the failure in the owner's health journal, not just the log file.
        record_exception("sync_job", exc)
    finally:
        db.close()


scheduler = BackgroundScheduler()


def start_scheduler():
    scheduler.add_job(sync_vehicles_once, "interval", seconds=settings.sync_interval_seconds, id="samsara_sync")
    # Daily health self-test before the workday (own timezone), so the owner has
    # a fresh "all systems OK" (or a warning) waiting each morning.
    scheduler.add_job(
        run_self_test, "cron",
        hour=settings.selftest_hour, minute=0,
        timezone=settings.selftest_timezone, id="daily_selftest",
    )
    scheduler.start()
    # Run once immediately on startup instead of waiting for the first interval.
    sync_vehicles_once()
