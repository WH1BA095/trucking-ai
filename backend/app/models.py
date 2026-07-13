import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, String, Float, Integer, DateTime, ForeignKey, Text, JSON
from sqlalchemy.dialects.postgresql import UUID

from app.database import Base


def gen_uuid():
    return str(uuid.uuid4())


def utcnow():
    return datetime.now(timezone.utc)


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
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)


class VehicleEvent(Base):
    """History log — every fault/status change we've seen, so the agent has something to summarize."""
    __tablename__ = "vehicle_events"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    vehicle_id = Column(String, ForeignKey("vehicles.id"), nullable=False)
    event_type = Column(String, nullable=False)  # "fault_code", "status_change", "incident", ...
    description = Column(Text, nullable=True)
    payload = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=utcnow)


class User(Base):
    """Dashboard account. Login/password auth, a role, and a list of permission
    keys that gate what the user can see/do."""
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=gen_uuid)
    username = Column(String, unique=True, nullable=False, index=True)
    password_hash = Column(String, nullable=False)
    role = Column(String, nullable=False, default="moderator")  # "admin" | "moderator"
    permissions = Column(JSON, nullable=True)  # list of permission keys
    avatar = Column(Text, nullable=True)  # base64 data URL
    created_at = Column(DateTime, default=utcnow)


class TruckReport(Base):
    """An agent-generated report about one vehicle, saved for later viewing in
    the Reports tab. `content` is the agent's written analysis; `snapshot` keeps
    the telemetry the report was based on, so it stays meaningful over time."""
    __tablename__ = "truck_reports"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    user_id = Column(String, ForeignKey("users.id"), nullable=True, index=True)  # creator
    vehicle_id = Column(String, ForeignKey("vehicles.id"), nullable=False, index=True)
    vehicle_name = Column(String, nullable=True)  # denormalized for easy listing
    title = Column(String, nullable=False)
    # Same report in both languages (generated together, kept in sync); the UI
    # shows one based on the interface language.
    content_en = Column(Text, nullable=False)
    content_ru = Column(Text, nullable=False)
    snapshot = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=utcnow)


class ChatMessage(Base):
    """Conversation log, scoped per user, so context never mixes between people."""
    __tablename__ = "chat_messages"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    user_id = Column(String, nullable=False, index=True)
    role = Column(String, nullable=False)  # "user" | "assistant"
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=utcnow)


class VehicleModelSpec(Base):
    """Cached typical diesel tank capacity per make/model.

    Resolved once by the LLM (from make/model/year) and reused, so we never
    re-ask on every sync. Used to turn the reported fuel level % into gallons
    remaining without assuming one tank size for the whole fleet. Keyed by a
    normalized "make|model" string.
    """
    __tablename__ = "vehicle_model_specs"

    id = Column(String, primary_key=True)   # normalized "make|model"
    make = Column(String, nullable=True)
    model = Column(String, nullable=True)
    tank_gallons = Column(Integer, nullable=False)
    source = Column(String, nullable=True)  # "llm" | "manual"
    created_at = Column(DateTime, default=utcnow)


class SystemLog(Base):
    """Health journal for the owner — proof the system is alive and working.

    Two deliberately separate kinds so they never get confused:
      - "scheduled_test": a row per component from the daily (or on-demand)
        self-test — DB, Samsara, Anthropic, sync freshness, data counts.
      - "runtime_error":  an unhandled exception caught by the app (request
        handler or the background sync job).
    `level` colors the row in the UI: ok / warning / error.
    """
    __tablename__ = "system_logs"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    kind = Column(String, nullable=False, index=True)   # "scheduled_test" | "runtime_error"
    level = Column(String, nullable=False)              # "ok" | "warning" | "error"
    component = Column(String, nullable=True)           # "database", "samsara", "sync_job", ...
    message = Column(Text, nullable=False)
    details = Column(JSON, nullable=True)               # component-specific extras (counts, traceback)
    created_at = Column(DateTime, default=utcnow, index=True)
