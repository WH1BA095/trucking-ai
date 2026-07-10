def H(token):
    return {"Authorization": f"Bearer {token}"}


def test_login_success(client):
    r = client.post("/auth/login", json={"username": "admin", "password": "admin123456"})
    assert r.status_code == 200
    body = r.json()
    assert body["token"]
    assert body["user"]["username"] == "admin"
    assert body["user"]["role"] == "admin"


def test_login_bad_password(client):
    r = client.post("/auth/login", json={"username": "admin", "password": "wrong"})
    assert r.status_code == 401


def test_protected_requires_auth(client):
    assert client.get("/vehicles").status_code == 401
    assert client.get("/alerts").status_code == 401
    assert client.get("/reports").status_code == 401


def test_protected_with_token(client, admin_token):
    assert client.get("/vehicles", headers=H(admin_token)).status_code == 200
    assert client.get("/reports", headers=H(admin_token)).status_code == 200


def test_bad_token_rejected(client):
    assert client.get("/vehicles", headers=H("not-a-real-token")).status_code == 401


def test_password_policy_min_length(client, admin_token):
    r = client.post("/auth/users", headers=H(admin_token),
                    json={"username": "shortpw", "password": "123", "role": "moderator", "permissions": []})
    assert r.status_code == 400


def test_role_whitelist(client, admin_token):
    r = client.post("/auth/users", headers=H(admin_token),
                    json={"username": "badrole", "password": "password1", "role": "superadmin", "permissions": []})
    assert r.status_code == 400


def test_permission_whitelist(client, admin_token):
    r = client.post("/auth/users", headers=H(admin_token),
                    json={"username": "badperm", "password": "password1", "role": "moderator", "permissions": ["hack"]})
    assert r.status_code == 400


def test_db_viewer_redacts_password_hash(client, admin_token):
    rows = client.get("/admin/tables/users", headers=H(admin_token)).json()["rows"]
    assert rows and all(r["password_hash"] == "••••••" for r in rows)


def test_login_rate_limit(client):
    codes = [client.post("/auth/login", json={"username": "admin", "password": "x"}).status_code for _ in range(12)]
    assert 429 in codes
