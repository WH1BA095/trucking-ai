"""
One-shot report generation, used by the "Generate report" button, the bulk
run, and the chat agent's tool. Reads the vehicle snapshot from our DB, asks
Claude to write an operational analysis in English, then translates it to
Russian so every report is stored in both languages and stays consistent.

Uses the heavier `report_model` (Sonnet) — reports are the "deeper analysis"
side of the Haiku/Sonnet split.
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
    "location (city/state then coordinates), key telemetry (odometer, engine hours, "
    "DEF, temperatures, battery), any fault codes with their severity and whether the "
    "truck is safe to drive, and a short 'Recommended actions' section. Use clear "
    "markdown with short sections. Keep US units (mph, miles, °F). Do not invent data "
    "that isn't present."
)

TRANSLATE_SYSTEM = (
    "Translate the following fleet report into Russian. Keep the markdown structure "
    "(headings, tables, lists) identical, translate all prose, but KEEP US units as-is "
    "(mph -> миль/ч, miles -> миль, °F -> °F; never convert to km or °C). Output only "
    "the translated report, nothing else."
)


def _complete(system: str, user: str, max_tokens: int = 900) -> str:
    resp = client.messages.create(
        model=settings.report_model,
        max_tokens=max_tokens,
        system=system,
        messages=[{"role": "user", "content": user}],
    )
    return "".join(b.text for b in resp.content if b.type == "text")


def generate_report(db: Session, vehicle: Vehicle) -> TruckReport:
    snapshot = _vehicle_snapshot(db, vehicle)
    content_en = _complete(REPORT_SYSTEM, f"Truck data:\n{json.dumps(snapshot, ensure_ascii=False)}")
    content_ru = _complete(TRANSLATE_SYSTEM, content_en)

    report = TruckReport(
        vehicle_id=vehicle.id,
        vehicle_name=vehicle.name,
        title=f"Status report — Truck {vehicle.name}",
        content_en=content_en,
        content_ru=content_ru,
        snapshot=snapshot,
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    return report
