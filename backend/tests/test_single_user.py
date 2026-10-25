from pathlib import Path

import pytest
import yaml
from fastapi.testclient import TestClient

from planqer.auth.single_user import OWNER_EMAIL, check_single_user_bind

pytestmark = pytest.mark.api


@pytest.fixture
def single_client(monkeypatch):
    monkeypatch.setenv("PLANQER_SINGLE_USER", "true")
    from planqer.api import app

    with TestClient(app) as client:
        yield client


def test_single_mode_needs_no_token(single_client):
    response = single_client.get("/api/auth/me")

    assert response.status_code == 200
    assert response.json()["email"] == OWNER_EMAIL
    assert response.json()["is_admin"] is True


def test_owner_is_created_even_if_the_random_password_breaks_the_policy(
    single_client, monkeypatch
):
    import asyncio

    from sqlalchemy import delete
    from sqlalchemy.ext.asyncio import AsyncSession

    from planqer.database import User, engine

    async def remove_owner():
        async with AsyncSession(engine) as session:
            await session.execute(delete(User).where(User.email == OWNER_EMAIL))
            await session.commit()

    asyncio.run(remove_owner())
    # No uppercase, digit or special character: fails every policy rule.
    monkeypatch.setattr("secrets.token_urlsafe", lambda n: "a" * 43)

    assert single_client.get("/api/auth/me").status_code == 200


def test_single_mode_owner_is_stable_across_requests(single_client):
    first = single_client.get("/api/auth/me").json()["id"]
    second = single_client.get("/api/auth/me").json()["id"]

    assert first == second


def test_single_mode_reports_no_setup_needed(single_client):
    response = single_client.get("/api/auth/setup-status")

    assert response.json() == {"needs_setup": False, "single_user": True}


def test_single_mode_blocks_registration(single_client):
    response = single_client.post(
        "/api/auth/register",
        json={
            "email": "someone@example.com",
            "password": "Testpassword" + "123!",
        },
    )

    assert response.status_code == 403


def test_multi_user_mode_still_requires_a_token(monkeypatch):
    monkeypatch.delenv("PLANQER_SINGLE_USER", raising=False)
    from planqer.api import app

    with TestClient(app) as client:
        assert client.get("/api/auth/me").status_code == 401


@pytest.mark.parametrize("address", ["127.0.0.1", "::1", "localhost", ""])
def test_bind_guard_allows_loopback_or_unknown(monkeypatch, address):
    monkeypatch.setenv("PLANQER_SINGLE_USER", "true")
    monkeypatch.setenv("PLANQER_BIND_ADDRESS", address)

    check_single_user_bind()


@pytest.mark.parametrize("address", ["0.0.0.0", "192.168.1.50"])
def test_bind_guard_refuses_open_address(monkeypatch, address):
    monkeypatch.setenv("PLANQER_SINGLE_USER", "true")
    monkeypatch.setenv("PLANQER_BIND_ADDRESS", address)
    monkeypatch.delenv("PLANQER_ALLOW_OPEN_LAN", raising=False)

    with pytest.raises(RuntimeError, match="PLANQER_ALLOW_OPEN_LAN"):
        check_single_user_bind()


def test_bind_guard_allows_open_address_when_acknowledged(monkeypatch):
    monkeypatch.setenv("PLANQER_SINGLE_USER", "true")
    monkeypatch.setenv("PLANQER_BIND_ADDRESS", "0.0.0.0")
    monkeypatch.setenv("PLANQER_ALLOW_OPEN_LAN", "true")

    check_single_user_bind()


def test_bind_guard_ignores_multi_user_mode(monkeypatch):
    monkeypatch.delenv("PLANQER_SINGLE_USER", raising=False)
    monkeypatch.setenv("PLANQER_BIND_ADDRESS", "0.0.0.0")

    check_single_user_bind()


ROOT = Path(__file__).resolve().parents[2]


def _compose(name):
    return yaml.safe_load((ROOT / name).read_text(encoding="utf-8"))


def test_simple_compose_is_single_user_and_loopback_only():
    services = _compose("docker-compose.simple.yml")["services"]
    environment = services["backend"]["environment"]

    assert "PLANQER_SINGLE_USER=true" in environment
    assert "PLANQER_BIND_ADDRESS=127.0.0.1" in environment
    for service in services.values():
        assert all(port.startswith("127.0.0.1:") for port in service["ports"])


def test_simple_compose_uses_the_release_images_and_data_volume():
    simple = _compose("docker-compose.simple.yml")
    release = _compose("docker-compose.release.yml")

    for name in ("backend", "frontend"):
        assert simple["services"][name]["image"] == release["services"][name]["image"]
    assert (
        simple["services"]["backend"]["volumes"]
        == (release["services"]["backend"]["volumes"])
    )
    assert "mcp-server" not in simple["services"]
