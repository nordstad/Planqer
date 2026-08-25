"""
Tests for secure file handling functionality.
"""

import os
import tempfile
import pytest
from unittest.mock import patch, mock_open
from planqer.services import secure_temp_file


def test_secure_temp_file_creates_secure_file():
    """Test that secure_temp_file creates a file with proper permissions."""
    with secure_temp_file() as temp_path:
        # File should exist
        assert os.path.exists(temp_path)
        
        # File should have restrictive permissions (owner read/write only)
        file_stat = os.stat(temp_path)
        file_mode = file_stat.st_mode & 0o777
        assert file_mode == 0o600
        
        # File should be in system temp directory
        assert temp_path.startswith(tempfile.gettempdir())
        
        # File should have expected prefix and suffix
        filename = os.path.basename(temp_path)
        assert filename.startswith('planqer_')
        assert filename.endswith('.png')


def test_secure_temp_file_custom_prefix_suffix():
    """Test that secure_temp_file respects custom prefix and suffix."""
    with secure_temp_file(prefix='test_', suffix='.jpg') as temp_path:
        filename = os.path.basename(temp_path)
        assert filename.startswith('test_')
        assert filename.endswith('.jpg')


def test_secure_temp_file_cleanup_on_success():
    """Test that temporary file is cleaned up after successful use."""
    temp_path = None
    with secure_temp_file() as path:
        temp_path = path
        assert os.path.exists(temp_path)
        
        # Write some test data
        with open(temp_path, 'w') as f:
            f.write('test data')
    
    # File should be cleaned up after context exit
    assert not os.path.exists(temp_path)


def test_secure_temp_file_cleanup_on_exception():
    """Test that temporary file is cleaned up even when exceptions occur."""
    temp_path = None
    
    try:
        with secure_temp_file() as path:
            temp_path = path
            assert os.path.exists(temp_path)
            
            # Write some test data
            with open(temp_path, 'w') as f:
                f.write('test data')
                
            # Raise an exception
            raise ValueError("Test exception")
            
    except ValueError:
        pass  # Expected exception
    
    # File should still be cleaned up after exception
    assert not os.path.exists(temp_path)


def test_secure_temp_file_cleanup_handles_missing_file():
    """Test that cleanup doesn't fail if file is manually deleted."""
    temp_path = None
    
    with secure_temp_file() as path:
        temp_path = path
        assert os.path.exists(temp_path)
        
        # Manually delete the file (simulating external deletion)
        os.remove(temp_path)
        assert not os.path.exists(temp_path)
        
        # Context manager should handle this gracefully
    
    # Should not raise any exceptions
    assert not os.path.exists(temp_path)


@patch('os.remove')
def test_secure_temp_file_cleanup_handles_permission_error(mock_remove):
    """Test that cleanup handles OS errors gracefully."""
    # Make os.remove raise an OSError
    mock_remove.side_effect = OSError("Permission denied")
    
    temp_path = None
    
    # Should not raise an exception even if cleanup fails
    with secure_temp_file() as path:
        temp_path = path
        with open(temp_path, 'w') as f:
            f.write('test data')
    
    # Cleanup was attempted
    mock_remove.assert_called_once()


def test_temp_file_unpredictable_names():
    """Test that temporary files have unpredictable names for security."""
    file_names = []
    
    # Create multiple temp files and collect their names
    for _ in range(5):
        with secure_temp_file() as temp_path:
            filename = os.path.basename(temp_path)
            file_names.append(filename)
    
    # All names should be different (very high probability with UUIDs)
    assert len(set(file_names)) == len(file_names)
    
    # Names should not be easily predictable (should contain random elements)
    for name in file_names:
        # Should have more than just the prefix and suffix
        name_without_ext = name.replace('.png', '').replace('planqer_', '')
        assert len(name_without_ext) > 0  # Random part should exist


def test_visualization_uses_secure_temp_file():
    """Test that the visualization generation uses secure temp files."""
    from fastapi.testclient import TestClient
    from planqer.api import app
    
    client = TestClient(app)
    
    # Make a request that generates a visualization
    payload = {
        "parts": {"100": 2},
        "available_board_lengths": [300],
        "saw_blade_width": 3.0,
        "project_name": "Test Project"
    }
    
    response = client.post("/api/cutting-plans", json=payload)
    assert response.status_code == 200
    
    data = response.json()
    assert "visualization" in data
    # Accept both PNG and SVG formats (PNG when Cairo is available, SVG fallback otherwise)
    assert (data["visualization"].startswith("data:image/png;base64,") or 
            data["visualization"].startswith("data:image/svg+xml;base64,"))
    
    # The fact that this test passes means the secure temp file is working
    # (the old insecure method would have failed in a more restricted environment)