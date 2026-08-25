"""Admin route coverage: privilege checks, self-modification guards, and the
password-reset / user-deletion flows an admin actually uses to manage an
instance (see docs/guide/projects-and-accounts.md for the supported
password-recovery path this backs)."""

import asyncio
import uuid

import pytest
from fastapi.testclient import TestClient
from planqer.database import User, engine
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select


@pytest.fixture
def app():
    from planqer.api import app

    return app


@pytest.fixture
def client(app):
    with TestClient(app) as test_client:
        yield test_client


def _register_and_login(client, password="testpassword123"):
    email = f"user-{uuid.uuid4()}@example.com"
    client.post("/api/auth/register", json={"email": email, "password": password})
    token = client.post(
        "/api/auth/login", json={"email": email, "password": password}
    ).json()["access_token"]
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"}).json()
    return {
        "email": email,
        "password": password,
        "id": me["id"],
        "headers": {"Authorization": f"Bearer {token}"},
    }


def _set_admin(email, is_admin):
    async def _do():
        async with AsyncSession(engine) as session:
            user = (
                await session.execute(select(User).where(User.email == email))
            ).scalar_one()
            user.is_admin = is_admin
            await session.commit()

    asyncio.run(_do())


@pytest.fixture
def admin(client):
    user = _register_and_login(client)
    _set_admin(user["email"], True)
    return user


@pytest.fixture
def other_user(client):
    # Registration auto-promotes the very first user ever created in this test
    # run to admin, so demote explicitly rather than depend on test order.
    user = _register_and_login(client)
    _set_admin(user["email"], False)
    return user


def test_admin_endpoints_reject_missing_credentials(client):
    assert client.get("/admin/users").status_code == 401
    assert client.get("/admin/stats").status_code == 401


def test_admin_endpoints_reject_non_admin(client, other_user):
    headers = other_user["headers"]
    assert client.get("/admin/users", headers=headers).status_code == 403
    assert client.get("/admin/stats", headers=headers).status_code == 403
    assert (
        client.put(
            f"/admin/users/{other_user['id']}/toggle-active", headers=headers
        ).status_code
        == 403
    )
    assert (
        client.delete(f"/admin/users/{other_user['id']}", headers=headers).status_code
        == 403
    )


def test_list_users_and_stats_as_admin(client, admin, other_user):
    users = client.get("/admin/users", headers=admin["headers"]).json()
    emails = {u["email"] for u in users}
    assert admin["email"] in emails
    assert other_user["email"] in emails

    stats = client.get("/admin/stats", headers=admin["headers"]).json()
    assert stats["total_users"] >= 2
    assert stats["admin_users"] >= 1


def test_toggle_admin_success(client, admin, other_user):
    response = client.put(
        f"/admin/users/{other_user['id']}/toggle-admin",
        json={"is_admin": True},
        headers=admin["headers"],
    )
    assert response.status_code == 200

    users = {
        u["email"]: u
        for u in client.get("/admin/users", headers=admin["headers"]).json()
    }
    assert users[other_user["email"]]["is_admin"] is True


def test_toggle_admin_cannot_modify_self(client, admin):
    response = client.put(
        f"/admin/users/{admin['id']}/toggle-admin",
        json={"is_admin": False},
        headers=admin["headers"],
    )
    assert response.status_code == 400


def test_toggle_admin_unknown_user_404(client, admin):
    response = client.put(
        f"/admin/users/{uuid.uuid4()}/toggle-admin",
        json={"is_admin": True},
        headers=admin["headers"],
    )
    assert response.status_code == 404


def test_deactivated_user_cannot_log_in(client, admin, other_user):
    toggle = client.put(
        f"/admin/users/{other_user['id']}/toggle-active", headers=admin["headers"]
    )
    assert toggle.status_code == 200

    login = client.post(
        "/api/auth/login",
        json={"email": other_user["email"], "password": other_user["password"]},
    )
    assert login.status_code == 400
    assert "Inactive user" in login.json()["detail"]


def test_toggle_active_cannot_modify_self(client, admin):
    response = client.put(
        f"/admin/users/{admin['id']}/toggle-active", headers=admin["headers"]
    )
    assert response.status_code == 400


def test_reset_password_lets_user_log_in_with_new_password(client, admin, other_user):
    response = client.put(
        f"/admin/users/{other_user['id']}/password",
        json={"password": "brand-new-password"},
        headers=admin["headers"],
    )
    assert response.status_code == 200

    old_password = client.post(
        "/api/auth/login",
        json={"email": other_user["email"], "password": other_user["password"]},
    )
    assert old_password.status_code == 401

    new_password = client.post(
        "/api/auth/login",
        json={"email": other_user["email"], "password": "brand-new-password"},
    )
    assert new_password.status_code == 200


def test_reset_password_unknown_user_404(client, admin):
    response = client.put(
        f"/admin/users/{uuid.uuid4()}/password",
        json={"password": "brand-new-password"},
        headers=admin["headers"],
    )
    assert response.status_code == 404


def test_delete_user_cannot_delete_self(client, admin):
    response = client.delete(f"/admin/users/{admin['id']}", headers=admin["headers"])
    assert response.status_code == 400


def test_delete_user_unknown_user_404(client, admin):
    response = client.delete(f"/admin/users/{uuid.uuid4()}", headers=admin["headers"])
    assert response.status_code == 404


def test_delete_user_removes_account_and_its_saved_project(client, admin, other_user):
    # A saved project is a row with a foreign key to the user; deleting the
    # user must not trip over it (no ON DELETE CASCADE on this schema).
    save = client.post(
        "/api/projects/",
        json={
            "name": "Test plan",
            "parts_data": {"100": 2},
            "board_lengths": [200],
            "saw_blade_width": 3,
            "optimization_result": {
                "cut_list": [[100, 100]],
                "visualization": "data:image/svg+xml;base64,PHN2Zy8+",
            },
        },
        headers=other_user["headers"],
    )
    assert save.status_code == 200

    response = client.delete(
        f"/admin/users/{other_user['id']}", headers=admin["headers"]
    )
    assert response.status_code == 200

    users = {
        u["email"] for u in client.get("/admin/users", headers=admin["headers"]).json()
    }
    assert other_user["email"] not in users
