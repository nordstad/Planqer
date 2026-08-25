import uuid

import pytest
from fastapi.testclient import TestClient


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
        "email": f"test-{uuid.uuid4()}@example.com",
        "password": "testpassword123"
    }


def test_register_user_success(client, unique_user):
    """Test successful user registration"""
    response = client.post("/api/auth/register", json=unique_user)

    assert response.status_code == 201
    data = response.json()
    assert data["email"] == unique_user["email"]
    assert data["is_active"] is True
    assert "id" in data


def test_register_user_duplicate_email(client, unique_user):
    """Test that registering with duplicate email fails"""
    client.post("/api/auth/register", json=unique_user)

    response = client.post("/api/auth/register", json=unique_user)

    assert response.status_code == 400
    assert "Email already registered" in response.json()["detail"]


def test_login_success(client, unique_user):
    """Test successful login"""
    client.post("/api/auth/register", json=unique_user)

    response = client.post("/api/auth/login", json={
        "email": unique_user["email"],
        "password": unique_user["password"]
    })

    assert response.status_code == 200
    data = response.json()
    assert data["token_type"] == "bearer"
    assert "access_token" in data


def test_login_invalid_credentials(client):
    """Test login with invalid credentials"""
    response = client.post("/api/auth/login", json={
        "email": "nonexistent@example.com",
        "password": "wrongpassword"
    })

    assert response.status_code == 401
    assert "Incorrect email or password" in response.json()["detail"]


def test_get_current_user(client, unique_user):
    """Test getting current user info with valid token"""
    client.post("/api/auth/register", json=unique_user)
    login_response = client.post("/api/auth/login", json={
        "email": unique_user["email"],
        "password": unique_user["password"]
    })

    token = login_response.json()["access_token"]

    response = client.get("/api/auth/me", headers={
        "Authorization": f"Bearer {token}"
    })

    assert response.status_code == 200
    data = response.json()
    assert data["email"] == unique_user["email"]
    assert "id" in data


def test_get_current_user_invalid_token(client):
    """Test getting current user with invalid token"""
    response = client.get("/api/auth/me", headers={
        "Authorization": "Bearer invalid_token"
    })

    assert response.status_code == 401
    assert "Could not validate credentials" in response.json()["detail"]
