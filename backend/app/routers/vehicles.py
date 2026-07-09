from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Vehicle
from app.schemas import VehicleOut
from app.samsara_client import samsara_client

router = APIRouter(prefix="/vehicles", tags=["vehicles"])

MAX_ROUTE_POINTS = 400  # downsample dense GPS feeds so the map stays snappy


@router.get("", response_model=list[VehicleOut])
def list_vehicles(db: Session = Depends(get_db)):
    """Everything the map needs in one call: position, status, fault codes."""
    return db.query(Vehicle).all()


@router.get("/{vehicle_id}", response_model=VehicleOut)
def get_vehicle(vehicle_id: str, db: Session = Depends(get_db)):
    """Detail panel data when a user clicks a truck on the map."""
    vehicle = db.get(Vehicle, vehicle_id)
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    return vehicle


@router.get("/{vehicle_id}/route")
def get_route(vehicle_id: str, hours: int = 8, db: Session = Depends(get_db)):
    """The driven route (GPS trail) for a vehicle over the last `hours`.

    Fetched live from Samsara — see SamsaraClient.get_vehicle_gps_history.
    """
    vehicle = db.get(Vehicle, vehicle_id)
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    end = datetime.now(timezone.utc)
    start = end - timedelta(hours=max(1, min(hours, 72)))
    fmt = "%Y-%m-%dT%H:%M:%SZ"
    raw = samsara_client.get_vehicle_gps_history(vehicle_id, start.strftime(fmt), end.strftime(fmt))

    coords = [
        [p["latitude"], p["longitude"]]
        for p in raw
        if p.get("latitude") is not None and p.get("longitude") is not None
    ]
    step = max(1, len(coords) // MAX_ROUTE_POINTS)
    return {"vehicle_id": vehicle_id, "points": coords[::step]}
