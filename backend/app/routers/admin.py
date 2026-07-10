"""
Read-only database viewer for the in-app "DB" tab.

Safety: table names are always validated against the live schema before being
used in a query (no arbitrary SQL, no injection), limit/offset are bound
parameters, and the whole router is gated behind settings.admin_enabled. It is
read-only — no writes. Turn it off (ADMIN_ENABLED=false) before hosting until
there's real auth, since it exposes every table (chat history, raw payloads).
"""
from fastapi import APIRouter, HTTPException, Query
from fastapi.encoders import jsonable_encoder
from sqlalchemy import inspect, text

from app.config import settings
from app.database import engine

router = APIRouter(prefix="/admin", tags=["admin"])


def _guard():
    if not settings.admin_enabled:
        raise HTTPException(status_code=403, detail="Admin viewer is disabled")


def _table_names() -> list[str]:
    return sorted(inspect(engine).get_table_names())


@router.get("/tables")
def list_tables():
    """All table names with their row counts."""
    _guard()
    out = []
    with engine.connect() as conn:
        for name in _table_names():
            count = conn.execute(text(f'SELECT COUNT(*) FROM "{name}"')).scalar()
            out.append({"name": name, "rows": count})
    return out


@router.get("/tables/{table}")
def get_table(table: str, limit: int = Query(100, ge=1, le=500), offset: int = Query(0, ge=0)):
    """Columns + a page of rows for one table (newest-ish first when possible)."""
    _guard()
    if table not in _table_names():
        raise HTTPException(status_code=404, detail="Unknown table")

    columns = [c["name"] for c in inspect(engine).get_columns(table)]
    order = ' ORDER BY created_at DESC' if "created_at" in columns else ""
    with engine.connect() as conn:
        total = conn.execute(text(f'SELECT COUNT(*) FROM "{table}"')).scalar()
        rows = conn.execute(
            text(f'SELECT * FROM "{table}"{order} LIMIT :limit OFFSET :offset'),
            {"limit": limit, "offset": offset},
        ).mappings().all()

    return {
        "table": table,
        "columns": columns,
        "total": total,
        "limit": limit,
        "offset": offset,
        "rows": jsonable_encoder([dict(r) for r in rows]),
    }
