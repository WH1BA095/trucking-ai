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
    max_severity: Optional[str] = None
    lamps: list[str] = []
    fault_codes: Optional[Any] = None
    message: str


class GenerateReportRequest(BaseModel):
    vehicle_id: str


class UserOut(BaseModel):
    id: str
    username: str
    role: str
    permissions: Optional[list[str]] = None
    avatar: Optional[str] = None

    class Config:
        from_attributes = True


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    token: str
    user: UserOut


class ProfileUpdate(BaseModel):
    username: Optional[str] = None
    password: Optional[str] = None
    avatar: Optional[str] = None


class UserCreate(BaseModel):
    username: str
    password: str
    role: str = "moderator"
    permissions: list[str] = []


class UserUpdate(BaseModel):
    username: Optional[str] = None
    password: Optional[str] = None
    role: Optional[str] = None
    permissions: Optional[list[str]] = None


class ChatRequest(BaseModel):
    message: str


class ChatResponse(BaseModel):
    reply: str
