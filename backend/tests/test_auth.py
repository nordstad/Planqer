import uuid

import pytest
from fastapi.testclient import TestClient

from planqer.auth.password_policy import validate_password
from planqer.auth.security import get_password_hash, verify_password


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
        "password": "Testpassword" + "123!",
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

    response = client.post(
        "/api/auth/login",
        json={"email": unique_user["email"], "password": unique_user["password"]},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["token_type"] == "bearer"
    assert "access_token" in data


def test_login_invalid_credentials(client):
    """Test login with invalid credentials"""
    response = client.post(
        "/api/auth/login",
        json={"email": "nonexistent@example.com", "password": "wrongpassword"},
    )

    assert response.status_code == 401
    assert "Incorrect email or password" in response.json()["detail"]


def test_password_hash_rejects_bcrypt_overlong_passwords():
    """bcrypt 5 raises for passwords over 72 bytes instead of truncating."""
    with pytest.raises(ValueError, match="at most 72 bytes"):
        get_password_hash("a" * 73)


def test_password_verify_treats_overlong_passwords_as_invalid():
    """Overlong login attempts should not raise through auth handlers."""
    hashed_password = get_password_hash("Testpassword" + "123!")

    assert verify_password("a" * 73, hashed_password) is False


@pytest.mark.parametrize(
    ("password", "message"),
    [
        ("Aa1!", "at least 8 characters"),
        ("a" * 70 + "A1!", "at most 72 bytes"),
        ("lowercase1!", "uppercase"),
        ("UPPERCASE1!", "lowercase"),
        ("Lowercase!", "digit"),
        ("Lowercase1", "special"),
    ],
)
def test_password_policy_rejects_invalid_passwords(password, message):
    with pytest.raises(ValueError, match=message):
        validate_password(password)


def test_password_policy_accepts_utf8_within_byte_limit():
    password = "Aäbcdef1!" + "x" * 60

    assert validate_password(password) == password


def test_registration_rejects_password_policy_violation(client):
    response = client.post(
        "/api/auth/register",
        json={"email": f"invalid-{uuid.uuid4()}@example.com", "password": "weak"},
    )

    assert response.status_code == 422
    assert "at least 8 characters" in response.text


def test_login_rate_limit_is_per_route(client):
    invalid_password = "wr" + "ong"
    responses = [
        client.post(
            "/api/auth/login",
            json={"email": "missing@example.com", "password": invalid_password},
        )
        for _ in range(11)
    ]

    assert [response.status_code for response in responses[:-1]] == [401] * 10
    assert responses[-1].status_code == 429


def test_registration_rate_limit_is_separate_from_login(client):
    valid_password = "Testpassword" + "123!"
    responses = [
        client.post(
            "/api/auth/register",
            json={
                "email": f"rate-{uuid.uuid4()}@example.com",
                "password": valid_password,
            },
        )
        for _ in range(11)
    ]

    assert [response.status_code for response in responses[:10]] == [201] * 10
    assert responses[-1].status_code == 429


def test_get_current_user(client, unique_user):
    """Test getting current user info with valid token"""
    client.post("/api/auth/register", json=unique_user)
    login_response = client.post(
        "/api/auth/login",
        json={"email": unique_user["email"], "password": unique_user["password"]},
    )

    token = login_response.json()["access_token"]

    response = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 200
    data = response.json()
    assert data["email"] == unique_user["email"]
    assert "id" in data


def test_get_current_user_invalid_token(client):
    """Test getting current user with invalid token"""
    response = client.get(
        "/api/auth/me", headers={"Authorization": "Bearer invalid_token"}
    )

    assert response.status_code == 401
    assert "Could not validate credentials" in response.json()["detail"]
