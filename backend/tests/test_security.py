"""
Security tests for input sanitization and validation.
"""

import pytest
from fastapi.testclient import TestClient
from planqer.api import app, sanitize_project_name, validate_numeric_input, sanitize_parts_dict, sanitize_board_lengths

client = TestClient(app)


def test_sanitize_project_name_basic():
    """Test basic project name sanitization."""
    assert sanitize_project_name("My Project") == "My Project"
    assert sanitize_project_name("Project-123_test") == "Project-123_test"
    assert sanitize_project_name(None) is None


def test_sanitize_project_name_dangerous_chars():
    """Test removal of dangerous characters."""
    # XSS attempt - dangerous chars should be removed
    result = sanitize_project_name("<script>alert('xss')</script>")
    assert "<" not in result and ">" not in result
    assert "script" in result  # Safe parts remain
    
    # SQL injection attempt
    result = sanitize_project_name("'; DROP TABLE users; --")
    assert "DROP TABLE users" in result
    assert "'" not in result and ";" not in result
    
    # Path traversal attempt
    result = sanitize_project_name("../../../etc/passwd")
    assert ".." not in result and "/" not in result
    assert "etcpasswd" in result  # Safe parts remain
    assert result == ".etcpasswd"  # Multiple dots converted to single dot
    
    # Null byte injection
    result = sanitize_project_name("test\x00malicious")
    assert "\x00" not in result
    assert result == "testmalicious"


def test_sanitize_project_name_length_limit():
    """Test length limiting."""
    long_name = "a" * 200
    result = sanitize_project_name(long_name)
    assert len(result) <= 100


def test_sanitize_project_name_empty_after_cleaning():
    """Test that empty strings after cleaning return None."""
    assert sanitize_project_name("!@#$%^&*") is None
    assert sanitize_project_name("") is None
    assert sanitize_project_name("   ") is None


def test_validate_numeric_input_valid():
    """Test valid numeric inputs."""
    assert validate_numeric_input(10.5) == 10.5
    assert validate_numeric_input(1) == 1.0
    assert validate_numeric_input(100, 1, 200) == 100.0


def test_validate_numeric_input_invalid():
    """Test invalid numeric inputs."""
    with pytest.raises(ValueError, match="Invalid numeric value"):
        validate_numeric_input(float('nan'))
        
    with pytest.raises(ValueError, match="Invalid numeric value"):
        validate_numeric_input(float('inf'))
        
    with pytest.raises(ValueError, match="Invalid numeric value"):
        validate_numeric_input(float('-inf'))
        
    with pytest.raises(ValueError, match="must be between"):
        validate_numeric_input(1000, 1, 100)
        
    with pytest.raises(ValueError, match="must be between"):
        validate_numeric_input(-5, 1, 100)


def test_api_malicious_project_name():
    """Test that malicious project names are sanitized."""
    payload = {
        "parts": {"100": 1},
        "available_board_lengths": [200],
        "saw_blade_width": 3.0,
        "project_name": "<script>alert('xss')</script>"
    }
    response = client.post("/api/cutting-plans", json=payload)
    assert response.status_code == 200


def test_api_extremely_large_numbers():
    """Test protection against extremely large numbers."""
    payload = {
        "parts": {"999999999": 1},
        "available_board_lengths": [200],
        "saw_blade_width": 3.0,
    }
    response = client.post("/api/cutting-plans", json=payload)
    assert response.status_code == 422  # Should be rejected by validation


def test_api_too_many_parts():
    """Test protection against DoS via too many parts."""
    # Create a dictionary with > 1000 parts
    large_parts = {str(i): 1 for i in range(1001)}
    payload = {
        "parts": large_parts,
        "available_board_lengths": [200],
        "saw_blade_width": 3.0,
    }
    response = client.post("/api/cutting-plans", json=payload)
    assert response.status_code == 422  # Should be rejected by validation


def test_api_too_many_board_lengths():
    """Test protection against DoS via too many board lengths."""
    large_boards = list(range(1, 102))  # 101 boards
    payload = {
        "parts": {"100": 1},
        "available_board_lengths": large_boards,
        "saw_blade_width": 3.0,
    }
    response = client.post("/api/cutting-plans", json=payload)
    assert response.status_code == 422  # Should be rejected by validation


def test_api_invalid_kerf_values():
    """Test validation of saw blade width (kerf)."""
    # Negative kerf
    payload = {
        "parts": {"100": 1},
        "available_board_lengths": [200],
        "saw_blade_width": -1.0,
    }
    response = client.post("/api/cutting-plans", json=payload)
    assert response.status_code == 422
    
    # Extremely large kerf
    payload = {
        "parts": {"100": 1},
        "available_board_lengths": [200],
        "saw_blade_width": 150.0,  # 15cm kerf is unrealistic
    }
    response = client.post("/api/cutting-plans", json=payload)
    assert response.status_code == 422


def test_api_nan_infinity_values():
    """Test that NaN and infinity values are rejected."""
    # Test extremely large numbers (simulating infinity)
    payload = {
        "parts": {"100": 1},
        "available_board_lengths": [1e308],  # Very large number near float limit
        "saw_blade_width": 3.0,
    }
    response = client.post("/api/cutting-plans", json=payload)
    assert response.status_code == 422


def test_api_invalid_quantities():
    """Test validation of part quantities."""
    # Zero quantity
    payload = {
        "parts": {"100": 0},
        "available_board_lengths": [200],
        "saw_blade_width": 3.0,
    }
    response = client.post("/api/cutting-plans", json=payload)
    assert response.status_code == 422
    
    # Negative quantity
    payload = {
        "parts": {"100": -5},
        "available_board_lengths": [200],
        "saw_blade_width": 3.0,
    }
    response = client.post("/api/cutting-plans", json=payload)
    assert response.status_code == 422
    
    # Extremely large quantity (DoS protection)
    payload = {
        "parts": {"100": 50000},
        "available_board_lengths": [200],
        "saw_blade_width": 3.0,
    }
    response = client.post("/api/cutting-plans", json=payload)
    assert response.status_code == 422


def test_api_valid_sanitized_request():
    """Test that valid requests still work after sanitization."""
    payload = {
        "parts": {"100.5": 5, "200": 3},
        "available_board_lengths": [300, 400],
        "saw_blade_width": 3.2,
        "project_name": "My Test Project (v1.0)"
    }
    response = client.post("/api/cutting-plans", json=payload)
    assert response.status_code == 200
    
    data = response.json()
    assert "optimal_board_length" in data
    assert "cost" in data
    assert "total_waste" in data
    assert "cut_list" in data
    assert "visualization" in data



def test_sanitize_parts_dict_valid():
    """Test parts dictionary sanitization with valid input."""
    parts = {"100.5": 5, "200": 3}
    result = sanitize_parts_dict(parts)
    assert result == {100.5: 5, 200.0: 3}


def test_sanitize_parts_dict_invalid_type():
    """Test parts dictionary with invalid input type."""
    with pytest.raises(ValueError, match="Parts must be a dictionary"):
        sanitize_parts_dict("not a dict")


def test_sanitize_parts_dict_too_many():
    """Test parts dictionary with too many parts."""
    large_parts = {str(i): 1 for i in range(1001)}
    with pytest.raises(ValueError, match="Maximum 1000 different part lengths"):
        sanitize_parts_dict(large_parts)


def test_sanitize_board_lengths_valid():
    """Test board lengths list sanitization with valid input."""
    boards = [100, 200.5, 300]
    result = sanitize_board_lengths(boards)
    assert result == [100.0, 200.5, 300.0]


def test_sanitize_board_lengths_invalid_type():
    """Test board lengths with invalid input type."""
    with pytest.raises(ValueError, match="Board lengths must be a list"):
        sanitize_board_lengths("not a list")


def test_sanitize_board_lengths_empty():
    """Test board lengths with empty list."""
    with pytest.raises(ValueError, match="At least one board length must be provided"):
        sanitize_board_lengths([])


def test_sanitize_board_lengths_too_many():
    """Test board lengths with too many boards."""
    large_boards = list(range(101))
    with pytest.raises(ValueError, match="Maximum 100 different board lengths"):
        sanitize_board_lengths(large_boards)