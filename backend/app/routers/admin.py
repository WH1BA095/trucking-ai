"""
Read-only database viewer for the in-app "DB" tab.

Safety: table names are always validated against the live schema before being
used in a query (no arbitrary SQL, no injection), limit/offset are bound
parameters, and the whole router is gated behind settings.admin_enabled. It is
read-only — no writes. Turn it off (ADMIN_ENABLED=false) before hosting until
there's real auth, since it exposes every table (chat history, raw payloads).
"""
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.encoders import jsonable_encoder
from sqlalchemy import inspect, text

from app.config import settings
from app.database import engine
from app.auth import require_permission

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_permission("view_db"))])


def _guard():
    if not settings.admin_enabled:
        raise HTTPException(status_code=403, detail="Admin viewer is disabled")


def _table_names() -> list[str]:
    return sorted(inspect(engine).get_table_names())


# Never expose these in the viewer, even to an admin (password hashes, secrets).
_SENSITIVE = ("password", "secret", "token", "hash")


def _redact(row: dict) -> dict:
    return {
        k: ("••••••" if v is not None and any(s in k.lower() for s in _SENSITIVE) else v)
        for k, v in row.items()
    }


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
def get_table(
    table: str,
    request: Request,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    """Columns + a page of rows for one table (newest-ish first when possible).

    Optional per-column filters arrive as `f.<column>=value` and match a
    case-insensitive substring of the column's text form, so you can find a row
    by id/name instead of paging through the table by eye. Filtering happens in
    SQL across the whole table, not just the current page.

    Safety: column names are validated against the live schema before being
    quoted into the query, and every value is a bound parameter.
    """
    _guard()
    if table not in _table_names():
        raise HTTPException(status_code=404, detail="Unknown table")

    columns = [c["name"] for c in inspect(engine).get_columns(table)]

    conditions: list[str] = []
    filter_params: dict = {}
    for key, value in request.query_params.items():
        if not key.startswith("f.") or not value.strip():
            continue
        column = key[2:]
        if column not in columns:
            raise HTTPException(status_code=400, detail=f"Unknown column: {column}")
        name = f"flt_{len(conditions)}"
        # CAST(... AS TEXT) so numeric/uuid/json/timestamp columns are searchable too.
        conditions.append(f'CAST("{column}" AS TEXT) ILIKE :{name}')
        filter_params[name] = f"%{value.strip()}%"
    where = f" WHERE {' AND '.join(conditions)}" if conditions else ""

    order = ' ORDER BY created_at DESC' if "created_at" in columns else ""
    with engine.connect() as conn:
        total = conn.execute(text(f'SELECT COUNT(*) FROM "{table}"{where}'), filter_params).scalar()
        rows = conn.execute(
            text(f'SELECT * FROM "{table}"{where}{order} LIMIT :limit OFFSET :offset'),
            {**filter_params, "limit": limit, "offset": offset},
        ).mappings().all()

    return {
        "table": table,
        "columns": columns,
        "total": total,
        "limit": limit,
        "offset": offset,
        "rows": jsonable_encoder([_redact(dict(r)) for r in rows]),
    }
