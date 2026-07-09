from datetime import datetime
from typing import Optional, Any
from pydantic import BaseModel


class VehicleOut(BaseModel):
    id: str
    name: str
    driver_name: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    heading: Optional[float] = None
    speed_mph: Optional[float] = None
    status: Optional[str] = None
    engine_state: Optional[str] = None
    fault_codes: Optional[Any] = None
    details: Optional[dict] = None
    last_video_url: Optional[str] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ReportOut(BaseModel):
    id: str
    vehicle_id: str
    vehicle_name: Optional[str] = None
    title: str
    content_en: str
    content_ru: str
    snapshot: Optional[Any] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class AlertOut(BaseModel):
    vehicle_id: str
    name: str
    driver_name: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    location: Optional[str] = None
    alert_level: str
    drivable: bool
    lamps: list[str] = []
    fault_codes: Optional[Any] = None
    message: str


class GenerateReportRequest(BaseModel):
    vehicle_id: str


class ChatRequest(BaseModel):
    user_id: str
    message: str


class ChatResponse(BaseModel):
    reply: str
