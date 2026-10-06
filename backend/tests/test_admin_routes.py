"""Admin route coverage: privilege checks, self-modification guards, and the
password-reset / user-deletion flows an admin actually uses to manage an
instance (see docs/guide/projects-and-accounts.md for the supported
password-recovery path this backs)."""

import asyncio
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from planqer.database import (
    ProjectGroup,
    User,
    UserProject,
    UserSettings,
    UserSheetProject,
    UserTileProject,
    engine,
)

pytestmark = pytest.mark.api


@pytest.fixture
def app():
    from planqer.api import app

    return app


@pytest.fixture
def client(app):
    with TestClient(app) as test_client:
        test_client.headers["X-Planqer-Setup-Secret"] = "test-setup-secret"
        yield test_client


def _register_and_login(client, password="Testpassword" + "123!"):
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
    new_password = "Brand-new-password" + "1!"
    response = client.put(
        f"/admin/users/{other_user['id']}/password",
        json={"password": new_password},
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
        json={"email": other_user["email"], "password": new_password},
    )
    assert new_password.status_code == 200


def test_reset_password_revokes_existing_session_only_for_reset_user(
    client, admin, other_user
):
    unrelated_user = _register_and_login(client)

    reset_response = client.put(
        f"/admin/users/{other_user['id']}/password",
        json={"password": "Brand-new-password" + "1!"},
        headers=admin["headers"],
    )
    assert reset_response.status_code == 200

    revoked_session = client.get("/api/auth/me", headers=other_user["headers"])
    unrelated_session = client.get("/api/auth/me", headers=unrelated_user["headers"])

    assert revoked_session.status_code == 401
    assert unrelated_session.status_code == 200
    assert unrelated_session.json()["id"] == unrelated_user["id"]


def test_cli_password_reset_revokes_existing_session(client, other_user):
    from create_admin import set_user_password

    asyncio.run(
        set_user_password(
            other_user["email"], password="Cli-reset-password" + "1!", force=True
        )
    )

    response = client.get("/api/auth/me", headers=other_user["headers"])

    assert response.status_code == 401


def test_reset_password_unknown_user_404(client, admin):
    new_password = "Brand-new-password" + "1!"
    response = client.put(
        f"/admin/users/{uuid.uuid4()}/password",
        json={"password": new_password},
        headers=admin["headers"],
    )
    assert response.status_code == 404


def test_reset_password_enforces_shared_policy(client, admin, other_user):
    response = client.put(
        f"/admin/users/{other_user['id']}/password",
        json={"password": "weak"},
        headers=admin["headers"],
    )

    assert response.status_code == 422
    assert "at least 8 characters" in response.text


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


def test_delete_user_removes_all_owned_data_but_not_another_users_data(
    client, admin, other_user
):
    other_user_id = uuid.UUID(other_user["id"])
    admin_id = uuid.UUID(admin["id"])
    target_group = client.post(
        "/api/project-groups/",
        json={"name": "Target group"},
        headers=other_user["headers"],
    ).json()
    group_id = target_group["id"]

    board = client.post(
        "/api/projects/",
        json={
            "name": "Target board",
            "project_group_id": group_id,
            "parts_data": {"100": 1},
            "board_lengths": [200],
            "saw_blade_width": 3,
            "optimization_result": {"cut_list": [[100]]},
        },
        headers=other_user["headers"],
    )
    sheet = client.post(
        "/api/sheet-projects/",
        json={
            "name": "Target sheet",
            "project_group_id": group_id,
            "parts_data": [
                {"name": "panel", "width": 100, "height": 100, "quantity": 1}
            ],
            "sheet_width": 500,
            "sheet_height": 500,
            "kerf_width": 3,
            "sheet_thickness": 12,
            "optimization_result": {"sheets": []},
        },
        headers=other_user["headers"],
    )
    tile = client.post(
        "/api/tile-projects/",
        json={
            "name": "Target tile",
            "project_group_id": group_id,
            "surface_data": {"width": 300, "height": 300, "cutouts": []},
            "tile_data": {"width": 100, "height": 100, "allow_rotation": True},
            "bond_data": {"pattern": "stack", "offset_fraction": 0.5},
            "options_data": {},
        },
        headers=other_user["headers"],
    )
    assert board.status_code == sheet.status_code == tile.status_code == 200

    admin_group = client.post(
        "/api/project-groups/",
        json={"name": "Admin group"},
        headers=admin["headers"],
    ).json()
    admin_board = client.post(
        "/api/projects/",
        json={
            "name": "Admin board",
            "project_group_id": admin_group["id"],
            "parts_data": {"100": 1},
            "board_lengths": [200],
            "saw_blade_width": 3,
            "optimization_result": {"cut_list": [[100]]},
        },
        headers=admin["headers"],
    )
    assert admin_board.status_code == 200

    response = client.delete(
        f"/admin/users/{other_user['id']}", headers=admin["headers"]
    )
    assert response.status_code == 200

    async def counts():
        async with AsyncSession(engine) as session:
            return {
                "user": (
                    await session.execute(select(User).where(User.id == other_user_id))
                ).scalar_one_or_none(),
                "settings": (
                    await session.execute(
                        select(UserSettings).where(
                            UserSettings.user_id == other_user_id
                        )
                    )
                )
                .scalars()
                .all(),
                "groups": (
                    await session.execute(
                        select(ProjectGroup).where(
                            ProjectGroup.user_id == other_user_id
                        )
                    )
                )
                .scalars()
                .all(),
                "boards": (
                    await session.execute(
                        select(UserProject).where(UserProject.user_id == other_user_id)
                    )
                )
                .scalars()
                .all(),
                "sheets": (
                    await session.execute(
                        select(UserSheetProject).where(
                            UserSheetProject.user_id == other_user_id
                        )
                    )
                )
                .scalars()
                .all(),
                "tiles": (
                    await session.execute(
                        select(UserTileProject).where(
                            UserTileProject.user_id == other_user_id
                        )
                    )
                )
                .scalars()
                .all(),
                "admin_boards": (
                    await session.execute(
                        select(UserProject).where(UserProject.user_id == admin_id)
                    )
                )
                .scalars()
                .all(),
            }

    remaining = asyncio.run(counts())
    assert remaining["user"] is None
    assert all(
        not remaining[key]
        for key in ("settings", "groups", "boards", "sheets", "tiles")
    )
    assert len(remaining["admin_boards"]) == 1
