"""
Test setup: points the app at an isolated `trucking_agent_test` database so
tests never touch dev/prod data. The scheduler/Samsara sync never runs here
because we use TestClient without its startup context.
"""
import os

import psycopg2
import pytest

# Must be set BEFORE importing the app (settings read env at import time).
os.environ["DATABASE_URL"] = "postgresql+psycopg2://postgres:localpass@localhost:5432/trucking_agent_test"
os.environ["JWT_SECRET"] = "test-secret"
os.environ.setdefault("ANTHROPIC_API_KEY", "test")
os.environ["SAMSARA_API_TOKEN"] = ""


def _create_test_db():
    conn = psycopg2.connect(dbname="postgres", user="postgres", password="localpass", host="localhost", port="5432")
    conn.autocommit = True
    cur = conn.cursor()
    cur.execute("SELECT 1 FROM pg_database WHERE datname='trucking_agent_test'")
    if not cur.fetchone():
        cur.execute("CREATE DATABASE trucking_agent_test")
    conn.close()


_create_test_db()

from app.database import Base, engine  # noqa: E402
import app.models  # noqa: E402,F401
from app.main import app  # noqa: E402
from app.auth import seed_admin, _login_hits  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def _setup_schema():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    seed_admin()
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture(autouse=True)
def _reset_login_rate():
    # keep the in-memory login rate limiter from leaking across tests
    _login_hits.clear()
    yield


@pytest.fixture
def client():
    from fastapi.testclient import TestClient
    return TestClient(app)


@pytest.fixture
def admin_token(client):
    return client.post("/auth/login", json={"username": "admin", "password": "admin123456"}).json()["token"]


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}
