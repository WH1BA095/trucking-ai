from datetime import datetime
from typing import Optional, Any
from pydantic import BaseModel, ConfigDict, Field

# ~1.5 MB base64 avatar cap (keeps the DB/row size sane).
AVATAR_MAX = 2_000_000


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

    model_config = ConfigDict(from_attributes=True)


class ReportOut(BaseModel):
    id: str
    vehicle_id: str
    vehicle_name: Optional[str] = None
    title: str
    content_en: str
    content_ru: str
    snapshot: Optional[Any] = None
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


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

    model_config = ConfigDict(from_attributes=True)


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=1, max_length=200)


class TokenResponse(BaseModel):
    token: str
    user: UserOut


class ProfileUpdate(BaseModel):
    username: Optional[str] = Field(default=None, min_length=1, max_length=50)
    password: Optional[str] = Field(default=None, max_length=200)
    avatar: Optional[str] = Field(default=None, max_length=AVATAR_MAX)


class UserCreate(BaseModel):
    username: str = Field(min_length=1, max_length=50)
    password: str = Field(max_length=200)
    role: str = "moderator"
    permissions: list[str] = []


class UserUpdate(BaseModel):
    username: Optional[str] = Field(default=None, min_length=1, max_length=50)
    password: Optional[str] = Field(default=None, max_length=200)
    role: Optional[str] = None
    permissions: Optional[list[str]] = None


class SystemLogOut(BaseModel):
    id: str
    kind: str
    level: str
    component: Optional[str] = None
    message: str
    details: Optional[Any] = None
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)


class ChatResponse(BaseModel):
    reply: str
