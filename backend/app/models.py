import uuid
from datetime import datetime

from sqlalchemy import Column, String, Float, DateTime, ForeignKey, Text, JSON
from sqlalchemy.dialects.postgresql import UUID

from app.database import Base


def gen_uuid():
    return str(uuid.uuid4())


class Vehicle(Base):
    """One row per truck. Mirrors Samsara's vehicle object, kept fresh by sync_job.py."""
    __tablename__ = "vehicles"

    id = Column(String, primary_key=True)  # Samsara vehicle id — reuse it directly, no need to invent our own
    name = Column(String, nullable=False)
    driver_name = Column(String, nullable=True)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    heading = Column(Float, nullable=True)
    speed_mph = Column(Float, nullable=True)
    status = Column(String, nullable=True)  # e.g. "moving", "idle", "stopped", "fault"
    engine_state = Column(String, nullable=True)
    fault_codes = Column(JSON, nullable=True)  # list of {spn, fmi, fault, description, source, count}
    # Normalized, human-unit extras: static (vin, make, model, year, license_plate,
    # tags) + telemetry (odometer_miles, engine_hours, def_percent, coolant_temp_f,
    # battery_volts, ambient_temp_f, engine_rpm, engine_load_percent). One JSON blob
    # so we can extend it without a migration on every new Samsara field.
    details = Column(JSON, nullable=True)
    last_video_url = Column(String, nullable=True)  # dash cam clip / snapshot link, if available
    raw_samsara_payload = Column(JSON, nullable=True)  # keep the raw response — cheap insurance for debugging
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class VehicleEvent(Base):
    """History log — every fault/status change we've seen, so the agent has something to summarize."""
    __tablename__ = "vehicle_events"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    vehicle_id = Column(String, ForeignKey("vehicles.id"), nullable=False)
    event_type = Column(String, nullable=False)  # "fault_code", "status_change", "incident", ...
    description = Column(Text, nullable=True)
    payload = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class TruckReport(Base):
    """An agent-generated report about one vehicle, saved for later viewing in
    the Reports tab. `content` is the agent's written analysis; `snapshot` keeps
    the telemetry the report was based on, so it stays meaningful over time."""
    __tablename__ = "truck_reports"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    vehicle_id = Column(String, ForeignKey("vehicles.id"), nullable=False, index=True)
    vehicle_name = Column(String, nullable=True)  # denormalized for easy listing
    title = Column(String, nullable=False)
    # Same report in both languages (generated together, kept in sync); the UI
    # shows one based on the interface language.
    content_en = Column(Text, nullable=False)
    content_ru = Column(Text, nullable=False)
    snapshot = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class ChatMessage(Base):
    """Conversation log, scoped per user, so context never mixes between people."""
    __tablename__ = "chat_messages"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    user_id = Column(String, nullable=False, index=True)
    role = Column(String, nullable=False)  # "user" | "assistant"
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
