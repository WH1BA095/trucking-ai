"""
Single source of truth for configuration.

Nothing else in the codebase should call os.environ directly — everything
reads from this Settings object. That's what makes moving from local Docker
Postgres to a hosted managed Postgres (or swapping the LLM model) a one-line
.env change instead of a code change.
"""
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# Absolute path to the project-root .env, computed from this file's location
# (backend/app/config.py -> repo root). Using an absolute path means the config
# loads the same .env no matter which directory uvicorn is launched from —
# otherwise running from backend/ would silently look for a non-existent
# backend/.env and fall back to defaults. On hosting, env vars are injected into
# the environment directly and are still picked up whether or not this file exists.
ENV_FILE = Path(__file__).resolve().parents[2] / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ENV_FILE, env_file_encoding="utf-8", extra="ignore")

    database_url: str = "postgresql+psycopg2://postgres:localpass@localhost:5432/trucking_agent"

    anthropic_api_key: str = ""
    agent_model: str = "claude-haiku-4-5-20251001"  # routine chat
    report_model: str = "claude-sonnet-5"  # deeper analysis for generated reports

    samsara_api_token: str = ""
    samsara_base_url: str = "https://api.samsara.com"
    # Dash cam media needs the "Media Retrieval" token scope; off by default so
    # we don't fire a per-vehicle request every sync that just 401s.
    samsara_fetch_media: bool = False

    sync_interval_seconds: int = 300
    allowed_origins: str = "http://localhost:3000"

    # Admin alerts (SMS not wired yet — see app/notifications.py)
    admin_phone: str = ""

    @property
    def allowed_origins_list(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]


settings = Settings()
