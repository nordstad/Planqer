import uuid

import pytest
from fastapi.testclient import TestClient
from planqer.database import UserSettings
from planqer.routes.settings import settings_to_response


@pytest.fixture
def app():
    """Get the FastAPI app for testing"""
    from planqer.api import app

    return app


@pytest.fixture
def client(app):
    """Create a test client, entering the app's lifespan so migrations run"""
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def unique_user():
    """Generate a unique user for each test"""
    return {
        "email": f"settings-test-{uuid.uuid4()}@example.com",
        "password": "testpassword123",
    }


@pytest.fixture
def authenticated_user_token(client, unique_user):
    """Create user and return auth token"""
    client.post("/api/auth/register", json=unique_user)

    login_response = client.post(
        "/api/auth/login",
        json={"email": unique_user["email"], "password": unique_user["password"]},
    )

    return login_response.json()["access_token"]


def test_get_user_settings(client, authenticated_user_token):
    """Test getting user settings"""
    response = client.get(
        "/api/settings/",
        headers={"Authorization": f"Bearer {authenticated_user_token}"},
    )

    assert response.status_code == 200
    data = response.json()
    assert "user_id" in data
    assert data["default_board_lengths"] == [3000, 3600, 5000]
    assert data["default_saw_blade_width"] == 3.0
    assert data["default_currency"] == "SEK"
    assert data["preferred_algorithm"] == "auto"
    assert data["preferred_units"] == "mm"


def test_update_user_settings(client, authenticated_user_token):
    """Test updating user settings"""
    updates = {
        "default_board_lengths": [400, 500, 600],
        "default_saw_blade_width": 2.5,
        "default_currency": "EUR",
        "preferred_algorithm": "first_fit_decreasing",
        "preferred_units": "cm",
    }

    response = client.put(
        "/api/settings/",
        headers={"Authorization": f"Bearer {authenticated_user_token}"},
        json=updates,
    )

    assert response.status_code == 200
    data = response.json()
    assert data["default_board_lengths"] == [400, 500, 600]
    assert data["default_saw_blade_width"] == 2.5
    assert data["default_currency"] == "EUR"
    assert data["preferred_algorithm"] == "first_fit_decreasing"
    assert data["preferred_units"] == "cm"


def test_partial_update_user_settings(client, authenticated_user_token):
    """Test partial update of user settings"""
    updates = {"default_saw_blade_width": 4.0}

    response = client.put(
        "/api/settings/",
        headers={"Authorization": f"Bearer {authenticated_user_token}"},
        json=updates,
    )

    assert response.status_code == 200
    data = response.json()
    assert data["default_board_lengths"] == [3000, 3600, 5000]  # Unchanged
    assert data["default_saw_blade_width"] == 4.0  # Updated
    assert data["default_currency"] == "SEK"  # Unchanged
    assert data["preferred_algorithm"] == "auto"  # Unchanged


def test_get_user_settings_normalizes_legacy_board_lengths():
    """Legacy rows using the old default sizes should be normalized to real-world lengths."""
    settings = UserSettings(
        user_id=uuid.uuid4(),
        default_board_lengths="[300, 360, 500]",
        default_saw_blade_width=3.0,
        default_currency="SEK",
        preferred_algorithm="auto",
        preferred_units="mm",
    )

    response = settings_to_response(settings)

    assert response.default_board_lengths == [3000, 3600, 5000]
    assert settings.default_board_lengths == "[3000, 3600, 5000]"


def test_settings_unauthorized(client):
    """Test settings endpoint without authentication"""
    response = client.get("/api/settings/")

    assert response.status_code == 401


def test_settings_invalid_token(client):
    """Test settings endpoint with invalid token"""
    response = client.get(
        "/api/settings/", headers={"Authorization": "Bearer invalid_token"}
    )

    assert response.status_code == 401
