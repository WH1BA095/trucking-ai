"""
One-shot report generation, used by the "Generate report" button (and reusable
elsewhere). Reads the vehicle snapshot from our DB, asks Claude to write an
operational analysis, and saves it as a TruckReport.

Uses the heavier `report_model` (Sonnet) rather than the routine chat model —
reports are the "deeper analysis" side of the Haiku/Sonnet split.
"""
import json

import anthropic
from sqlalchemy.orm import Session

from app.config import settings
from app.models import TruckReport, Vehicle
from app.agent.tools import _vehicle_snapshot

client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

REPORT_SYSTEM = (
    "You are a fleet operations analyst. Write a concise, operational status report "
    "for a single truck from the JSON telemetry provided. Cover: current status & "
    "location, key telemetry (odometer, engine hours, DEF, temperatures, battery), any "
    "fault codes and what they imply, and a short 'Recommended actions' section. Use "
    "clear markdown with short sections. Do not invent data that isn't present."
)


def generate_report(db: Session, vehicle: Vehicle) -> TruckReport:
    snapshot = _vehicle_snapshot(db, vehicle)
    resp = client.messages.create(
        model=settings.report_model,
        max_tokens=900,
        system=REPORT_SYSTEM,
        messages=[{"role": "user", "content": f"Truck data:\n{json.dumps(snapshot, ensure_ascii=False)}"}],
    )
    content = "".join(b.text for b in resp.content if b.type == "text")

    report = TruckReport(
        vehicle_id=vehicle.id,
        vehicle_name=vehicle.name,
        title=f"Status report — Truck {vehicle.name}",
        content=content,
        snapshot=snapshot,
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    return report
