"""
API tests for POST /api/tile-layout.
"""

import pytest
from fastapi.testclient import TestClient

from planqer.api import app

client = TestClient(app)


BASE_PAYLOAD = {
    "surface_width": 909,
    "surface_height": 1206,
    "tile": {"width": 300, "height": 600, "allow_rotation": False},
    "joint": {"joint_width": 3, "perimeter_gap": 0},
    "bond": {"pattern": "stack", "offset_fraction": 0.5},
    "candidate_count": 3,
    "project_name": "Test Wall",
}


# Solved once for the whole module and reused by the fill_color/offcut/
# distinct-cut-size tests below — they all inspect the same "busy" (many
# distinct cut sizes) response, so there's no reason to burn three of the
# endpoint's 10-requests-per-minute budget asking the exact same question.
@pytest.fixture(scope="module")
def busy_candidate():
    payload = dict(BASE_PAYLOAD)
    payload["surface_width"] = 8400
    payload["surface_height"] = 2400
    response = client.post("/api/tile-layout", json=payload)
    assert response.status_code == 200
    return response.json()["candidates"][0]


def test_tile_layout_success():
    response = client.post("/api/tile-layout", json=BASE_PAYLOAD)
    assert response.status_code == 200
    data = response.json()

    assert "candidates" in data
    assert len(data["candidates"]) <= 3
    assert "recommended_index" in data
    assert 0 <= data["recommended_index"] < len(data["candidates"])
    assert data["surface_area"] == pytest.approx(909 * 1206)

    candidate = data["candidates"][data["recommended_index"]]
    assert candidate["visualization"].startswith("data:image/svg+xml;base64,")
    assert "tiles" in candidate
    assert candidate["tiles_to_purchase"] >= 1
    assert "label" in candidate


def test_tile_layout_exact_division_has_zero_cut_candidate():
    response = client.post("/api/tile-layout", json=BASE_PAYLOAD)
    assert response.status_code == 200
    candidates = response.json()["candidates"]

    assert any(c["cut_tile_count"] == 0 for c in candidates)


def test_tile_layout_with_cutout():
    payload = dict(BASE_PAYLOAD)
    payload["cutouts"] = [{"x": 100, "y": 100, "width": 100, "height": 100, "label": "socket"}]
    response = client.post("/api/tile-layout", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["net_area"] < data["surface_area"]


def test_tile_layout_running_bond():
    payload = dict(BASE_PAYLOAD)
    payload["bond"] = {"pattern": "running", "offset_fraction": 0.5}
    response = client.post("/api/tile-layout", json=payload)
    assert response.status_code == 200


def test_tile_layout_min_edge_cut_reports_slivers():
    payload = dict(BASE_PAYLOAD)
    payload["surface_width"] = 1000
    payload["surface_height"] = 600
    payload["joint"] = {"joint_width": 0, "perimeter_gap": 0}
    payload["min_edge_cut"] = 250
    response = client.post("/api/tile-layout", json=payload)
    assert response.status_code == 200
    candidates = response.json()["candidates"]
    assert any(c["sliver_count"] > 0 for c in candidates)


def test_tile_layout_rejects_oversized_tile():
    payload = dict(BASE_PAYLOAD)
    payload["tile"] = {"width": 5000, "height": 600}  # over the 3000mm cap
    response = client.post("/api/tile-layout", json=payload)
    assert response.status_code == 422


def test_tile_layout_rejects_unknown_bond_pattern():
    payload = dict(BASE_PAYLOAD)
    payload["bond"] = {"pattern": "herringbone", "offset_fraction": 0.5}
    response = client.post("/api/tile-layout", json=payload)
    assert response.status_code == 422


def test_tile_layout_rejects_offset_fraction_out_of_range():
    payload = dict(BASE_PAYLOAD)
    payload["bond"] = {"pattern": "running", "offset_fraction": 1.5}
    response = client.post("/api/tile-layout", json=payload)
    assert response.status_code == 422


def test_tile_layout_rejects_too_many_cutouts():
    payload = dict(BASE_PAYLOAD)
    payload["cutouts"] = [
        {"x": i * 10, "y": 0, "width": 5, "height": 5} for i in range(25)
    ]
    response = client.post("/api/tile-layout", json=payload)
    assert response.status_code == 422


def test_tile_layout_returns_400_when_surface_entirely_consumed_by_cutout():
    payload = dict(BASE_PAYLOAD)
    payload["surface_width"] = 300
    payload["surface_height"] = 300
    payload["cutouts"] = [{"x": 0, "y": 0, "width": 300, "height": 300}]
    payload["tile"] = {"width": 100, "height": 100}
    response = client.post("/api/tile-layout", json=payload)
    assert response.status_code == 400


def test_tile_layout_candidate_count_is_respected():
    payload = dict(BASE_PAYLOAD)
    payload["candidate_count"] = 1
    response = client.post("/api/tile-layout", json=payload)
    assert response.status_code == 200
    assert len(response.json()["candidates"]) == 1


def test_tile_layout_allow_rotation():
    payload = dict(BASE_PAYLOAD)
    payload["surface_width"] = 590
    payload["surface_height"] = 1200
    payload["tile"] = {"width": 300, "height": 600, "allow_rotation": True}
    response = client.post("/api/tile-layout", json=payload)
    assert response.status_code == 200


def test_tile_layout_reports_distinct_cut_sizes_and_matches_candidate_tiles(busy_candidate):
    non_full_sizes = {
        (round(t["width"]), round(t["height"]))
        for t in busy_candidate["tiles"]
        if t["kind"] != "full"
    }
    assert busy_candidate["distinct_cut_sizes"] == len(non_full_sizes)
    assert busy_candidate["distinct_cut_sizes"] > 1  # this surface genuinely has several edge-cut widths


def test_tile_layout_fill_color_matches_size_not_kind(busy_candidate):
    """Same (width, height) always gets the same fill_color regardless of
    whether the piece is a straight CUT or a NOTCHED piece — color signals
    the measurement, not the classification (see .plans/tile-layout.md)."""
    color_by_size = {}
    for t in busy_candidate["tiles"]:
        if t["kind"] == "full":
            continue
        key = (round(t["width"]), round(t["height"]))
        color_by_size.setdefault(key, t["fill_color"])
        assert t["fill_color"] == color_by_size[key]

    # Full tiles all share one fixed color, distinct from every cut-size color.
    full_colors = {t["fill_color"] for t in busy_candidate["tiles"] if t["kind"] == "full"}
    assert len(full_colors) == 1
    assert full_colors.isdisjoint(color_by_size.values())


def test_tile_layout_is_reused_offcut_count_matches_reused_offcut_count(busy_candidate):
    flagged = sum(1 for t in busy_candidate["tiles"] if t["is_reused_offcut"])
    assert flagged == busy_candidate["reused_offcut_count"]

