"""
Admin notifications for critical faults.

Right now this only logs — it's the single hook where SMS will plug in later.
When you're ready: add a provider (e.g. Twilio) here, read the destination from
settings.admin_phone, and send `build_alert_message(...)`. Nothing else in the
codebase needs to change, because the sync job already calls notify_admin_critical
the moment a truck newly becomes non-drivable.
"""
import logging

logger = logging.getLogger("notifications")


def build_alert_message(vehicle, details: dict) -> str:
    """Short, SMS-friendly English alert line for a non-drivable truck."""
    loc = details.get("location") or (
        f"{vehicle.latitude:.4f}, {vehicle.longitude:.4f}"
        if vehicle.latitude is not None else "unknown location"
    )
    faults = vehicle.fault_codes or []
    top = faults[0].get("fault") if faults else "critical fault"
    return (
        f"🔴 Truck {vehicle.name} at {loc}: {top}. "
        f"DO NOT DRIVE — stop the vehicle and arrange service."
    )


def notify_admin_critical(vehicle, details: dict) -> None:
    """Called when a truck newly enters a non-drivable (critical) state.

    TODO: wire real SMS here (send build_alert_message() to settings.admin_phone).
    """
    message = build_alert_message(vehicle, details)
    logger.warning("ADMIN ALERT (SMS not yet wired): %s", message)
