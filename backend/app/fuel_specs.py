"""
Resolve a truck's diesel tank capacity from its make/model using the LLM, and
cache the answer per model so we never ask twice.

Tank size isn't in Samsara (it's a build-spec option), so to turn the reported
fuel level % into gallons remaining we look up a *typical* capacity for the
model. The value is an estimate (a given model ships with different tank
configs), but it's far better than one fixed number for the whole fleet.

The LLM call happens in the background sync job (never in chat) and only on a
cache miss, so it costs a handful of Haiku calls once per unseen model.
"""
import logging
import re

import anthropic
from sqlalchemy.orm import Session

from app.config import settings
from app.database import SessionLocal
from app.models import VehicleModelSpec

logger = logging.getLogger("fuel_specs")

# Sanity bounds for a Class-8 tractor's total diesel capacity (US gallons).
TANK_MIN, TANK_MAX = 50, 400

_client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

_SYSTEM = (
    "You are a heavy-duty truck specifications expert. Given a tractor's year, "
    "make and model, respond with ONLY an integer: the typical TOTAL diesel fuel "
    "capacity in US gallons (sum both saddle tanks for a sleeper tractor). Pick "
    "the most common factory configuration. Output just the number, nothing else."
)


def _key(make: str | None, model: str | None) -> str:
    return f"{(make or '').strip().lower()}|{(model or '').strip().lower()}"


def load_cache(db: Session | None = None) -> dict[str, int]:
    """Load all known model→gallons pairs into a dict for a sync run."""
    own = db is None
    db = db or SessionLocal()
    try:
        return {s.id: s.tank_gallons for s in db.query(VehicleModelSpec).all()}
    finally:
        if own:
            db.close()


def _ask_llm(make: str | None, model: str | None, year) -> int | None:
    prompt = " ".join(str(x) for x in (year, make, model) if x).strip()
    resp = _client.messages.create(
        model=settings.agent_model,
        max_tokens=8,
        system=_SYSTEM,
        messages=[{"role": "user", "content": prompt}],
    )
    text = "".join(b.text for b in resp.content if b.type == "text")
    m = re.search(r"\d+", text)
    return int(m.group()) if m else None


def resolve(cache: dict[str, int], make: str | None, model: str | None, year=None) -> int | None:
    """Tank capacity for this model: from cache, else ask the LLM and store it.

    Returns None (caller falls back to the global default) if make/model are
    missing, there's no API key, or the LLM answer is out of sane bounds.
    Never raises — a failure just yields None.
    """
    if not make and not model:
        return None
    key = _key(make, model)
    if key in cache:
        return cache[key]
    if not settings.anthropic_api_key:
        return None
    try:
        gallons = _ask_llm(make, model, year)
    except Exception:
        logger.exception("tank capacity LLM lookup failed for %s %s", make, model)
        return None
    if not (gallons and TANK_MIN <= gallons <= TANK_MAX):
        logger.warning("Implausible tank capacity for %s %s: %r — ignoring", make, model, gallons)
        return None

    cache[key] = gallons
    db = SessionLocal()
    try:
        if not db.get(VehicleModelSpec, key):
            db.add(VehicleModelSpec(id=key, make=make, model=model, tank_gallons=gallons, source="llm"))
            db.commit()
            logger.info("Resolved tank capacity: %s %s -> %d gal", make, model, gallons)
    except Exception:
        logger.exception("failed to cache tank capacity for %s %s", make, model)
        db.rollback()
    finally:
        db.close()
    return gallons
