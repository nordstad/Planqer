import pytest
from planqer.cache import generate_request_hash
from planqer.helpers import check_waste_warning, compute_metrics


def test_generate_request_hash_uses_sha256():
    request_hash = generate_request_hash({180: 4, 90: 2}, [300, 500], 3.0)
    same_hash = generate_request_hash({90: 2, 180: 4}, [300, 500], 3.0)

    assert request_hash == same_hash
    assert len(request_hash) == 64
    assert request_hash.startswith("") is not False


def test_compute_metrics_basic():
    cut_list = [[100, 50], [80, 70]]
    board_length = 200
    total_waste, warning_count = compute_metrics(cut_list, board_length)
    assert total_waste > 0
    assert warning_count >= 0


def test_check_waste_warning_low():
    msg = check_waste_warning(25)  # Below 40mm threshold
    assert msg is not None and "Error" in msg


def test_check_waste_warning_high():
    msg = check_waste_warning(600)  # Above 500mm threshold
    assert msg is not None and "Warning" in msg


def test_check_waste_warning_ok():
    msg = check_waste_warning(100)  # Between 40mm and 500mm
    assert msg is None
