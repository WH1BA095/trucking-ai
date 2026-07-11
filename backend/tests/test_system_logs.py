"""
System journal endpoints: permission gating + list/clear behavior.

We don't exercise POST /system/selftest here — it makes real network calls to
Samsara/Anthropic. Instead we seed rows directly and verify the read/clear API
and the `view_logs` gate.
"""
from app.database import SessionLocal
from app.models import SystemLog


def H(token):
    return {"Authorization": f"Bearer {token}"}


def _make_moderator(client, admin_token, username, permissions):
    client.post("/auth/users", headers=H(admin_token),
                json={"username": username, "password": "password1", "role": "moderator", "permissions": permissions})
    return client.post("/auth/login", json={"username": username, "password": "password1"}).json()["token"]


def _seed_logs():
    db = SessionLocal()
    try:
        db.add(SystemLog(kind="scheduled_test", level="ok", component="database", message="Database connection OK"))
        db.add(SystemLog(kind="runtime_error", level="error", component="sync_job", message="boom"))
        db.commit()
    finally:
        db.close()


def test_view_logs_requires_permission(client, admin_token):
    tok = _make_moderator(client, admin_token, "mod_nologs", ["view_map"])
    assert client.get("/system/logs", headers=H(tok)).status_code == 403
    assert client.post("/system/selftest", headers=H(tok)).status_code == 403
    assert client.delete("/system/logs", headers=H(tok)).status_code == 403


def test_moderator_with_view_logs_can_read(client, admin_token):
    tok = _make_moderator(client, admin_token, "mod_logs", ["view_logs"])
    assert client.get("/system/logs", headers=H(tok)).status_code == 200


def test_list_filter_and_clear(client, admin_token):
    _seed_logs()

    both = client.get("/system/logs", headers=H(admin_token)).json()
    assert any(r["kind"] == "scheduled_test" for r in both)
    assert any(r["kind"] == "runtime_error" for r in both)

    only_runtime = client.get("/system/logs?kind=runtime_error", headers=H(admin_token)).json()
    assert only_runtime and all(r["kind"] == "runtime_error" for r in only_runtime)

    # Clear just one kind, then everything.
    client.delete("/system/logs?kind=runtime_error", headers=H(admin_token))
    after = client.get("/system/logs", headers=H(admin_token)).json()
    assert all(r["kind"] != "runtime_error" for r in after)

    client.delete("/system/logs", headers=H(admin_token))
    assert client.get("/system/logs", headers=H(admin_token)).json() == []
