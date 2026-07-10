"""
Thin wrapper around the Alvys TMS Public API (loads/trips/drivers/trucks).

STATUS: scaffold. Auth (OAuth2 client-credentials) follows Alvys docs
(https://docs.alvys.com — token at auth.alvys.com, API at api.alvys.com/public).
The exact endpoint paths, query params, pagination and response shapes below are
placeholders and MUST be verified against a live account once client_id/secret
arrive (same way we verified samsara_client.py). All Alvys-specific detail lives
in this one file.

Mirrors the Samsara pattern: sync_job pulls this into our DB; the agent/dashboard
read only from the DB, never Alvys live during a request.
"""
import time

import httpx

from app.config import settings


class AlvysClient:
    def __init__(self):
        self.base_url = settings.alvys_base_url.rstrip("/")
        self._token: str | None = None
        self._token_exp: float = 0.0

    # --- auth ---
    def _get_token(self) -> str:
        """OAuth2 client-credentials token, cached until shortly before expiry."""
        if self._token and time.time() < self._token_exp - 30:
            return self._token
        resp = httpx.post(
            settings.alvys_token_url,
            data={
                "grant_type": "client_credentials",
                "client_id": settings.alvys_client_id,
                "client_secret": settings.alvys_client_secret,
                "audience": settings.alvys_audience,
            },
            timeout=25.0,
        )
        resp.raise_for_status()
        body = resp.json()
        self._token = body["access_token"]
        self._token_exp = time.time() + body.get("expires_in", 3600)
        return self._token

    def _headers(self) -> dict:
        return {"Authorization": f"Bearer {self._get_token()}", "Accept": "application/json"}

    def _get(self, path: str, params: dict | None = None) -> dict:
        with httpx.Client(timeout=25.0) as client:
            resp = client.get(f"{self.base_url}{path}", headers=self._headers(), params=params or {})
            resp.raise_for_status()
            return resp.json()

    # --- data (PLACEHOLDER paths — verify with real creds) ---
    def list_loads(self) -> list[dict]:
        """Loads/orders: reference #, status, pickup & delivery stops, dates,
        assigned truck/driver. TODO: confirm path (e.g. /loads), pagination shape."""
        return self._get("/loads").get("data", [])

    def list_trips(self) -> list[dict]:
        """Trips: the movement legs tying a load to a truck/driver over time.
        TODO: confirm path (e.g. /trips) and how trip links to a Samsara vehicle."""
        return self._get("/trips").get("data", [])


alvys_client = AlvysClient()
