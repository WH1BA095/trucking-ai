def H(token):
    return {"Authorization": f"Bearer {token}"}


def _make_moderator(client, admin_token, username, permissions):
    client.post("/auth/users", headers=H(admin_token),
                json={"username": username, "password": "password1", "role": "moderator", "permissions": permissions})
    return client.post("/auth/login", json={"username": username, "password": "password1"}).json()["token"]


def test_moderator_limited_permissions(client, admin_token):
    # only map + alerts, nothing sensitive
    tok = _make_moderator(client, admin_token, "mod_limited", ["view_map", "view_alerts"])

    # allowed
    assert client.get("/vehicles", headers=H(tok)).status_code == 200
    assert client.get("/alerts", headers=H(tok)).status_code == 200

    # denied — lacks the permission
    assert client.get("/admin/tables", headers=H(tok)).status_code == 403          # no view_db
    assert client.post("/reports/generate-all", headers=H(tok)).status_code == 403  # no generate_reports
    assert client.get("/auth/users", headers=H(tok)).status_code == 403             # not admin


def test_moderator_cannot_manage_users(client, admin_token):
    tok = _make_moderator(client, admin_token, "mod_nomgmt", ["manage_users"])  # even with the key, non-admins are blocked from admin-only route? manage_users is a perm, not admin
    # /auth/users is admin-only (require_admin), so a moderator is blocked regardless
    assert client.get("/auth/users", headers=H(tok)).status_code == 403


def test_admin_has_everything(client, admin_token):
    assert client.get("/admin/tables", headers=H(admin_token)).status_code == 200
    assert client.get("/auth/users", headers=H(admin_token)).status_code == 200
