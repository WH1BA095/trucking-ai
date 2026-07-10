"""
Tools the agent can call. Each tool reads from (or writes to) our own database
— never calls Samsara live during a chat.

Add new tools here as the project grows — this file is the single place that
defines what the agent is allowed to do.
"""
from sqlalchemy.orm import Session

from app.models import Vehicle, VehicleEvent

TOOL_DEFINITIONS = [
    {
        "name": "get_fleet_summary",
        "description": "Get a summary of all vehicles: how many are moving, idle, or have active fault codes.",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "get_vehicle_details",
        "description": "Get full details for one specific vehicle by its name or id: status, telemetry (odometer, engine hours, DEF level, coolant temp, battery, etc.), fault codes and recent events.",
        "input_schema": {
            "type": "object",
            "properties": {
                "vehicle_name_or_id": {"type": "string", "description": "Vehicle name or Samsara vehicle id"}
            },
            "required": ["vehicle_name_or_id"],
        },
    },
    {
        "name": "generate_truck_report",
        "description": (
            "Generate and save a full status report for a vehicle, so the user can view it in the "
            "Reports tab. Call this when the user asks you to generate/create/make/save a report for "
            "a truck. The report is written and saved automatically in both English and Russian — you "
            "do NOT write the report text yourself. After it's saved, confirm briefly and tell the "
            "user it's available in the Reports tab."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "vehicle_name_or_id": {"type": "string", "description": "Vehicle name or Samsara vehicle id the report is about"},
            },
            "required": ["vehicle_name_or_id"],
        },
    },
]


def _find_vehicle(db: Session, name_or_id: str) -> Vehicle | None:
    return (
        db.query(Vehicle)
        .filter((Vehicle.id == name_or_id) | (Vehicle.name.ilike(f"%{name_or_id}%")))
        .first()
    )


def get_fleet_summary(db: Session) -> dict:
    vehicles = db.query(Vehicle).all()
    return {
        "total": len(vehicles),
        "moving": sum(1 for v in vehicles if v.status == "moving"),
        "idle": sum(1 for v in vehicles if v.status == "idle"),
        "fault": sum(1 for v in vehicles if v.status == "fault"),
        "vehicles_with_faults": [
            {"id": v.id, "name": v.name, "fault_codes": v.fault_codes}
            for v in vehicles if v.fault_codes
        ],
    }


def _vehicle_snapshot(db: Session, vehicle: Vehicle) -> dict:
    recent_events = (
        db.query(VehicleEvent)
        .filter(VehicleEvent.vehicle_id == vehicle.id)
        .order_by(VehicleEvent.created_at.desc())
        .limit(5)
        .all()
    )
    return {
        "id": vehicle.id,
        "name": vehicle.name,
        "driver_name": vehicle.driver_name,
        "status": vehicle.status,
        "speed_mph": vehicle.speed_mph,
        "engine_state": vehicle.engine_state,
        "latitude": vehicle.latitude,
        "longitude": vehicle.longitude,
        "details": vehicle.details,
        "fault_codes": vehicle.fault_codes,
        "last_video_url": vehicle.last_video_url,
        "recent_events": [{"type": e.event_type, "description": e.description} for e in recent_events],
    }


def get_vehicle_details(db: Session, vehicle_name_or_id: str) -> dict:
    vehicle = _find_vehicle(db, vehicle_name_or_id)
    if not vehicle:
        return {"error": f"No vehicle found matching '{vehicle_name_or_id}'"}
    return _vehicle_snapshot(db, vehicle)


def generate_truck_report(db: Session, vehicle_name_or_id: str, user_id: str | None = None) -> dict:
    vehicle = _find_vehicle(db, vehicle_name_or_id)
    if not vehicle:
        return {"error": f"No vehicle found matching '{vehicle_name_or_id}'"}
    # Local import avoids a circular import (reports.py imports from this module).
    from app.agent.reports import generate_report

    report = generate_report(db, vehicle, user_id)
    return {"saved": True, "report_id": report.id, "vehicle": vehicle.name}


def execute_tool(db: Session, name: str, tool_input: dict, user_id: str | None = None) -> dict:
    if name == "get_fleet_summary":
        return get_fleet_summary(db)
    if name == "get_vehicle_details":
        return get_vehicle_details(db, tool_input["vehicle_name_or_id"])
    if name == "generate_truck_report":
        return generate_truck_report(db, tool_input["vehicle_name_or_id"], user_id)
    return {"error": f"Unknown tool: {name}"}
