"""
Thin wrapper around the Alvys TMS Public API (loads/trips/drivers/trucks/...).

STATUS: written against the official docs (https://docs.alvys.com) and details
confirmed by Alvys support (2026-07), but NOT yet exercised against a live
tenant — we don't have client credentials yet. Verify response shapes the same
way we did for samsara_client.py once the Client ID/Secret arrive.

Key facts (confirmed, easy to get wrong):
  * Auth is OAuth2 client-credentials at auth.alvys.com/oauth/token. The token
    call takes client_id, client_secret, grant_type AND `audience`.
  * The word "public" belongs in the **audience** (https://api.alvys.com/public/),
    NOT in the base URL — the base URL is plain https://api.alvys.com.
  * Reads are POST ".../search" calls, not GETs. Paths are
    /api/p/v{version}/{resource}/search (mostly v1.0; some newer ones v2.0).
  * Pagination lives in the request body: Page (zero-based) + PageSize.
    Responses come back as {Page, PageSize, Total, Items, Facets}.
  * Scopes are enforced per request — the API client application must be created
    with the read scopes we need (e.g. load:read).
  * Rate limits aren't published, so we retry with backoff.
  * Alvys does NOT enforce read-only on their side; keeping this client
    read-only (search calls only) is our responsibility.

Mirrors the Samsara pattern: sync_job pulls this into our DB; the agent and the
dashboard read only from the DB, never Alvys live during a request.
"""
import logging
import time

import httpx

from app.config import settings

logger = logging.getLogger("alvys_client")

# Resources exposed as POST /{resource}/search (per Alvys docs + support).
SEARCHABLE = (
    "loads", "trips", "carriers", "customers", "drivers", "trucks",
    "trailers", "invoices", "fuel", "deductions", "tolls", "locations",
)


class AlvysClient:
    PAGE_SIZE = 100
    MAX_RETRIES = 3

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
        return {
            "Authorization": f"Bearer {self._get_token()}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

    def _post(self, path: str, body: dict) -> dict:
        """POST with retry/backoff — Alvys doesn't publish rate limits."""
        url = f"{self.base_url}{path}"
        for attempt in range(self.MAX_RETRIES):
            with httpx.Client(timeout=30.0) as client:
                resp = client.post(url, headers=self._headers(), json=body)
            if resp.status_code < 400:
                return resp.json()
            # Back off on throttling / transient server errors, fail fast otherwise.
            if resp.status_code in (429, 500, 502, 503, 504) and attempt < self.MAX_RETRIES - 1:
                wait = 2 ** attempt
                logger.warning("Alvys %s -> %s, retrying in %ss", path, resp.status_code, wait)
                time.sleep(wait)
                continue
            resp.raise_for_status()
        raise RuntimeError(f"Alvys request failed after {self.MAX_RETRIES} attempts: {path}")

    # --- generic search ---
    def search(self, resource: str, filters: dict | None = None, version: str | None = None,
               page_size: int | None = None) -> list[dict]:
        """Every page of POST /api/p/v{version}/{resource}/search, as one list.

        NOTE: some resources (loads) require at least one filter — a bare
        page-only body is rejected — so callers pass Status/date ranges.
        """
        version = version or settings.alvys_api_version
        page_size = page_size or self.PAGE_SIZE
        path = f"/api/p/v{version}/{resource}/search"

        items: list[dict] = []
        page = 0  # zero-based
        while True:
            body = {"Page": page, "PageSize": page_size, **(filters or {})}
            data = self._post(path, body)
            batch = data.get("Items") or []
            items.extend(batch)
            total = data.get("Total") or 0
            page += 1
            if not batch or len(items) >= total:
                return items

    # --- convenience wrappers (verify shapes once credentials land) ---
    def search_loads(self, statuses: list[str] | None = None, updated_since: str | None = None) -> list[dict]:
        """Loads. Needs at least one filter: pass statuses and/or updated_since (ISO)."""
        filters: dict = {}
        if statuses:
            filters["Status"] = statuses
        if updated_since:
            filters["UpdatedAtRange"] = {"Start": updated_since}
        return self.search("loads", filters)

    def search_trips(self, filters: dict | None = None) -> list[dict]:
        return self.search("trips", filters)


alvys_client = AlvysClient()
