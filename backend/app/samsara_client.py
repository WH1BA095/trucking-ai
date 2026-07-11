"""
Thin wrapper around the Samsara REST API.

Every Samsara-specific detail (endpoint paths, response shapes, pagination)
lives in this one file, so if an endpoint changes you fix it here instead of
hunting through routers and the sync job.

Verified against a live account (2026-07): the fleet snapshot comes from a
single stats endpoint that returns GPS + engine state + fault codes for every
vehicle in one paginated call, which is why we don't hit per-vehicle endpoints.
"""
import httpx

from app.config import settings


class SamsaraClient:
    def __init__(self):
        self.base_url = settings.samsara_base_url.rstrip("/")
        self.headers = {
            "Authorization": f"Bearer {settings.samsara_api_token}",
            "Accept": "application/json",
        }

    def _get(self, path: str, params: dict | None = None) -> dict:
        with httpx.Client(timeout=25.0) as client:
            resp = client.get(f"{self.base_url}{path}", headers=self.headers, params=params or {})
            resp.raise_for_status()
            return resp.json()

    def _get_all(self, path: str, params: dict | None = None) -> list[dict]:
        """Follow Samsara's cursor pagination and return every `data` item.

        Samsara caps each page and signals more via pagination.hasNextPage +
        endCursor; without this a large fleet would be silently truncated to
        the first page.
        """
        results: list[dict] = []
        params = dict(params or {})
        while True:
            page = self._get(path, params)
            results.extend(page.get("data", []))
            pagination = page.get("pagination") or {}
            if pagination.get("hasNextPage") and pagination.get("endCursor"):
                params["after"] = pagination["endCursor"]
            else:
                return results

    def ping(self) -> int:
        """Cheap reachability + auth check for the self-test.

        Fetches a single vehicle (no telemetry) and returns how many came back.
        Raises on network/HTTP errors so the caller can record the failure.
        """
        data = self._get("/fleet/vehicles", params={"limit": 1})
        return len(data.get("data", []))

    def list_vehicles(self) -> list[dict]:
        """Vehicle roster: id, name, make/model, license plate. No live telemetry here."""
        return self._get_all("/fleet/vehicles")

    # Every telemetry field this account actually reports (verified live). Each
    # arrives as {value, time} (or a typed sub-object) under the matching key on
    # the stats item; unit conversion to human values happens in sync_job.
    STAT_TYPES = [
        "gps", "engineStates", "faultCodes", "obdOdometerMeters", "obdEngineSeconds",
        "defLevelMilliPercent", "engineCoolantTemperatureMilliC", "batteryMilliVolts",
        "ambientAirTemperatureMilliC", "engineRpm", "engineLoadPercent",
    ]
    STATS_TYPES_PER_CALL = 3  # Samsara rejects requesting too many stat types at once

    def get_vehicle_stats(self) -> list[dict]:
        """Latest telemetry snapshot for all vehicles, merged by vehicle id.

        Samsara caps the number of stat types per request, so we fetch in small
        batches and merge them. Replaces the older /locations and per-vehicle
        /fault-codes endpoints.
        """
        merged: dict[str, dict] = {}
        for i in range(0, len(self.STAT_TYPES), self.STATS_TYPES_PER_CALL):
            batch = ",".join(self.STAT_TYPES[i:i + self.STATS_TYPES_PER_CALL])
            for item in self._get_all("/fleet/vehicles/stats", params={"types": batch}):
                merged.setdefault(item["id"], {}).update(item)
        return list(merged.values())

    def get_driver_assignments(self) -> list[dict]:
        """Current driver-vehicle assignments across the fleet.

        Each item carries driver.{id,name} and vehicle.{id,name}; sync_job keeps
        the most recent non-passenger assignment per vehicle.
        """
        return self._get_all("/fleet/driver-vehicle-assignments", params={"filterBy": "vehicles"})

    def get_hos_clocks(self) -> list[dict]:
        """Hours-of-Service clocks per driver: duty status + remaining drive/
        shift/cycle time + violations (requires the ELD read token scope)."""
        return self._get_all("/fleet/hos/clocks")

    def get_vehicle_gps_history(self, vehicle_id: str, start_iso: str, end_iso: str) -> list[dict]:
        """Time-ordered GPS points for one vehicle over a window — the driven route.

        This is the one dashboard read that hits Samsara live (not cached in our
        DB): the route feature the user explicitly asked for. It's still a
        server-side, non-agent call, so the chat agent stays DB-only.
        """
        points: list[dict] = []
        params = {"vehicleIds": vehicle_id, "types": "gps", "startTime": start_iso, "endTime": end_iso}
        while True:
            page = self._get("/fleet/vehicles/stats/history", params)
            for item in page.get("data", []):
                points.extend(item.get("gps", []))
            pagination = page.get("pagination") or {}
            if pagination.get("hasNextPage") and pagination.get("endCursor"):
                params["after"] = pagination["endCursor"]
            else:
                return points

    def get_latest_dashcam_media(self, vehicle_id: str) -> str | None:
        """Most recent dash cam clip/snapshot URL for a vehicle, if available.

        NOTE: unverified — the current account's token lacks the "Media
        Retrieval" permission, so this returns None (401 is swallowed below).
        Grant that scope and re-verify path/params before relying on video.
        """
        try:
            data = self._get("/cameras/media", params={"vehicleId": vehicle_id, "limit": 1})
            items = data.get("data", [])
            return items[0]["url"] if items else None
        except httpx.HTTPStatusError:
            # No camera / no media permission — treat as "no media", not a hard failure.
            return None


samsara_client = SamsaraClient()
