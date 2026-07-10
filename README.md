# Fleet AI Dashboard

Dashboard + AI agent for a US trucking company. Live truck map, per-truck detail
(telemetry, faults, HOS), an AI assistant over the fleet data, bilingual reports,
fault alerts, and role-based accounts.

## Architecture

```
Samsara API ─┐
Alvys API   ─┼─► [ sync job (interval) ] ─► Postgres ─► FastAPI ─► Next.js UI
             │                                            │
             └────────────────────────────────────────► AI agent (reads DB only)
```

- **Backend:** Python + FastAPI. LLMs: Claude Haiku 4.5 (chat), Sonnet 5 (reports).
- **DB:** PostgreSQL (+pgvector image). Schema via **Alembic**.
- **Frontend:** Next.js + React, map via react-leaflet.
- **Principle:** the agent and dashboard read only from our DB. A background job
  syncs external APIs (Samsara, later Alvys) into the DB. Config is 100% env vars.

## Local setup

Prereqs: Docker, Python 3.12, Node 20+.

```bash
# 1. config
cp .env.example .env          # fill in ANTHROPIC_API_KEY, SAMSARA_API_TOKEN, JWT_SECRET
cp frontend/.env.local.example frontend/.env.local

# 2. database
docker compose up -d db

# 3. backend
cd backend
python3.12 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
alembic upgrade head          # create/upgrade schema
uvicorn app.main:app --reload --port 8000

# 4. frontend (new terminal)
cd frontend
npm install
npm run dev
```

Open http://localhost:3000 and log in (default admin: `admin` / `admin123456` —
**change it immediately** in the profile menu).

## Common tasks

```bash
# run tests (uses an isolated trucking_agent_test DB)
cd backend && python -m pytest

# after changing models.py — create + apply a migration
cd backend
alembic revision --autogenerate -m "describe change"
alembic upgrade head
```

## Deploy (staging / self-hosted)

Full stack in containers:

```bash
cp .env.example .env          # real secrets + your domain
docker compose -f docker-compose.prod.yml up -d --build
```

Before hosting publicly:
- Set a strong `JWT_SECRET` (`python -c "import secrets;print(secrets.token_urlsafe(48))"`).
- Set `ALLOWED_ORIGINS` and `NEXT_PUBLIC_API_URL` to your real domain.
- Serve over **HTTPS** (reverse proxy: Nginx/Caddy in front of the containers).
- Set `ADMIN_ENABLED=false` (the DB-viewer tab) until it's gated behind admin auth.
- Use a managed Postgres with backups.
- Run a single backend replica (the sync scheduler runs in-process).

## Key env vars

| Var | What |
|---|---|
| `DATABASE_URL` | Postgres connection |
| `ANTHROPIC_API_KEY` | Claude API key |
| `AGENT_MODEL` / `REPORT_MODEL` | chat / report models |
| `SAMSARA_API_TOKEN` | Samsara API (read scopes: vehicles, stats, faults, ELD; media optional) |
| `ALVYS_CLIENT_ID` / `ALVYS_CLIENT_SECRET` | Alvys TMS (planned — see docs/) |
| `JWT_SECRET` | signs login tokens (change in prod) |
| `SYNC_INTERVAL_SECONDS` | how often to pull from Samsara |
| `ALLOWED_ORIGINS` | CORS origin(s) |
| `ADMIN_ENABLED` | read-only DB viewer tab (off in prod) |

## Docs

- `docs/alvys-integration-plan.md` — Alvys TMS integration plan.
