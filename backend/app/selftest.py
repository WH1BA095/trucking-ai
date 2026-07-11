"""
System self-test + the runtime-error recorder — everything that writes to the
`system_logs` table.

The self-test is a health check for the *owner* (not the customer/admin UI): a
quick sweep that proves each moving part is alive — the database, Samsara,
Anthropic, that the sync job is keeping data fresh, and how much data we hold.
Each component becomes one row (kind="scheduled_test"); the daily scheduler runs
it every morning, and the owner can also trigger it on demand from the journal.

Runtime errors are the other, deliberately separate kind: unhandled exceptions
caught by the app (a request handler or the background sync job) land here as
kind="runtime_error" so real failures never get lost among the routine checks.
"""
import logging
import traceback
from datetime import datetime, timedelta, timezone

import anthropic
import httpx
from sqlalchemy import func, text

from app.config import settings
from app.database import SessionLocal, engine
from app.models import SystemLog, Vehicle
from app.samsara_client import samsara_client

logger = logging.getLogger("selftest")

KIND_SCHEDULED = "scheduled_test"
KIND_RUNTIME = "runtime_error"


def _write(db, kind: str, level: str, component: str, message: str, details: dict | None = None) -> SystemLog:
    row = SystemLog(kind=kind, level=level, component=component, message=message, details=details)
    db.add(row)
    return row


# --- individual checks -------------------------------------------------------
# Each returns (level, message, details). They must not raise — a broken check
# should report itself as an "error" row, never abort the whole self-test.

def _check_database() -> tuple[str, str, dict]:
    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))
    return "ok", "Database connection OK", {}


def _check_samsara() -> tuple[str, str, dict]:
    if not settings.samsara_api_token:
        return "warning", "Samsara token not configured", {}
    count = samsara_client.ping()
    return "ok", "Samsara API reachable", {"sample_vehicles": count}


def _check_anthropic() -> tuple[str, str, dict]:
    if not settings.anthropic_api_key:
        return "warning", "Anthropic API key not configured", {}
    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
    # A 1-token completion is the most SDK-version-proof reachability + auth
    # check (the Models API isn't in every anthropic SDK version). Runs once a
    # day (plus on demand), so the token cost is negligible.
    try:
        client.messages.create(
            model=settings.agent_model,
            max_tokens=1,
            messages=[{"role": "user", "content": "ping"}],
        )
    except anthropic.AuthenticationError:
        return "error", "Anthropic API key rejected (401)", {}
    return "ok", "Anthropic API reachable", {"model": settings.agent_model}


def _check_sync_freshness(db) -> tuple[str, str, dict]:
    """Is the background sync actually keeping vehicle data fresh?"""
    latest = db.query(func.max(Vehicle.updated_at)).scalar()
    if latest is None:
        return "warning", "No vehicles synced yet", {"last_sync": None}
    # updated_at is stored tz-naive UTC; compare in UTC.
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    age = (now - latest).total_seconds()
    # Stale if we've missed several sync cycles (or > 15 min, whichever is larger).
    threshold = max(settings.sync_interval_seconds * 3, 900)
    details = {"last_sync": latest.isoformat(), "age_seconds": int(age)}
    if age > threshold:
        return "warning", f"Vehicle data is stale ({int(age // 60)} min old)", details
    return "ok", f"Vehicle data is fresh ({int(age)}s old)", details


def _check_data(db) -> tuple[str, str, dict]:
    vehicles = db.query(func.count(Vehicle.id)).scalar() or 0
    faults = sum(1 for (fc,) in db.query(Vehicle.fault_codes).all() if fc)
    level = "ok" if vehicles else "warning"
    msg = f"{vehicles} vehicles in database" if vehicles else "No vehicles in database"
    return level, msg, {"vehicles": vehicles, "vehicles_with_faults": faults}


def run_self_test() -> list[dict]:
    """Run every check, write one system_logs row per component, return results.

    Used by both the daily scheduler and the on-demand "Run self-test now" button.
    """
    db = SessionLocal()
    results: list[dict] = []
    try:
        # (component, callable) — DB-backed checks take the session.
        checks = [
            ("database", _check_database),
            ("samsara", _check_samsara),
            ("anthropic", _check_anthropic),
            ("sync_job", lambda: _check_sync_freshness(db)),
            ("data", lambda: _check_data(db)),
        ]
        for component, fn in checks:
            try:
                level, message, details = fn()
            except Exception as exc:  # a failing check is itself a finding, not a crash
                level, message = "error", f"Check failed: {exc}"
                details = {"error": str(exc)}
                logger.warning("self-test check %s failed: %s", component, exc)
            _write(db, KIND_SCHEDULED, level, component, message, details)
            results.append({"component": component, "level": level, "message": message, "details": details})
        db.commit()
        logger.info("Self-test complete: %s", {r["component"]: r["level"] for r in results})
    except Exception:
        logger.exception("Self-test run failed")
        db.rollback()
    finally:
        db.close()
    return results


def record_runtime_error(component: str, message: str, details: dict | None = None) -> None:
    """Persist an unhandled error as a runtime_error row.

    Best-effort and self-contained: opens its own session and never raises, so
    it's safe to call from an exception handler or the sync job's except block.
    """
    db = SessionLocal()
    try:
        _write(db, KIND_RUNTIME, "error", component, message, details)
        db.commit()
    except Exception:
        logger.exception("Failed to record runtime error to system_logs")
        db.rollback()
    finally:
        db.close()


def record_exception(component: str, exc: BaseException) -> None:
    """Convenience wrapper: record an exception with its traceback."""
    tb = "".join(traceback.format_exception(type(exc), exc, exc.__traceback__))
    record_runtime_error(component, f"{type(exc).__name__}: {exc}", {"traceback": tb})
