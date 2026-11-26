"""The browser import validator checks shared contracts, never solves a plan."""

import copy
import json
from pathlib import Path

import pytest

from partsible.catalogue.loader import get_catalogue
from partsible.local_api import handle

FIXTURE = Path(__file__).resolve().parents[2] / "frontend/tests/contract/backup.json"


def call(stores):
    return json.loads(handle("backup_records", json.dumps({"stores": stores})))


@pytest.fixture
def stores():
    return json.loads(FIXTURE.read_text())["stores"]


def test_all_seven_stores_validate_without_changing_original_metadata(stores):
    before = copy.deepcopy(stores)
    assert call(stores) == {"status": 200, "body": {}}
    assert stores == before


BAD_FIELDS = [
    ("groups", "name", {}),
    ("groups", "updated_at", 123),
    ("groups", "spare_margin_percent", 101),
    ("projects", "parts_data", [{"length": 600, "quantity": 1.5}]),
    ("projects", "parts_data", {"NaN": 2}),
    ("projects", "board_lengths", ["2400"]),
    ("projects", "product", {"type": "board", "name": {}}),
    ("projects", "optimization_result", {"cut_list": ["bad"]}),
    ("projects", "optimization_result", {"board_lengths_used": "bad"}),
    ("projects", "board_costs", {"board_costs": "bad"}),
    ("projects", "cutlist_image", {}),
    ("sheet_projects", "optimization_result", {"sheets": "bad"}),
    ("sheet_projects", "optimization_result", {"sheets": [None]}),
    ("sheet_projects", "optimization_result", {"sheet_visualizations": [{}]}),
    ("sheet_projects", "parts_data", [None]),
    ("sheet_projects", "pricing", {"price_per_unit": 3, "currency": {}}),
    (
        "tile_projects",
        "surface_data",
        {"width": 1000, "height": 500, "cutouts": "bad"},
    ),
    ("tile_projects", "tile_data", {"width": [], "height": 300}),
    ("tile_projects", "layout_result", {"tiles": ["bad"]}),
    ("tile_projects", "layout_result", {"warnings": [{}]}),
    ("wallpaper_projects", "room_data", {"walls": "bad"}),
    ("wallpaper_projects", "room_data", {"walls": []}),
    ("wallpaper_projects", "wallpaper_data", {"name": {}}),
    ("wallpaper_projects", "plan_result", {"pieces": "bad"}),
    ("settings", "id", "ignored-settings"),
    ("settings", "default_board_lengths", "bad"),
    ("settings", "default_board_lengths", None),
    ("settings", "catalogue_country", "FR"),
    ("catalogue_entries", "hidden", "false"),
    ("catalogue_entries", "product_id", "different-key"),
    ("catalogue_entries", "data", "{"),
]


@pytest.mark.parametrize("store,field,value", BAD_FIELDS)
def test_malformed_stored_fields_are_rejected(stores, store, field, value):
    stores[store][0][field] = value
    assert call(stores)["status"] == 422


def test_legacy_board_map_and_empty_results_are_supported(stores):
    stores["projects"][0]["parts_data"] = {"600": 2}
    stores["projects"][0]["optimization_result"] = {}
    assert call(stores)["status"] == 200


@pytest.fixture
def wallpaper(stores):
    record = stores["wallpaper_projects"][0]
    request = {
        "wallpaper": {
            k: v
            for k, v in record["wallpaper_data"].items()
            if k not in ("currency", "vat_rate", "prices_include_vat")
        },
        "room": record["room_data"],
    }
    reply = json.loads(handle("wallpaper_plan", json.dumps(request)))
    assert reply["status"] == 200
    record["plan_result"] = reply["body"]
    return record


def test_real_wallpaper_result_validates_with_all_plan_metadata(stores, wallpaper):
    assert wallpaper["plan_result"]["pieces"]
    assert call(stores)["status"] == 200


@pytest.mark.parametrize(
    "change",
    [
        "missing-strip",
        "missing-wall",
        "duplicate-piece",
        "missing-piece",
        "bad-notches",
        "bad-starts",
        "bad-corner-quality",
    ],
)
def test_wallpaper_plan_shapes_and_internal_relationships(stores, wallpaper, change):
    plan = wallpaper["plan_result"]
    if change == "missing-strip":
        plan["pieces"][0]["strip_number"] = 99999
    elif change == "missing-wall":
        plan["strips"][0]["segments"][0]["wall_index"] = 999
    elif change == "duplicate-piece":
        plan["pieces"].append(copy.deepcopy(plan["pieces"][0]))
    elif change == "missing-piece":
        plan["rolls"][0]["cuts"][0]["piece_id"] = "missing"
    elif change == "bad-notches":
        plan["pieces"][0]["notches"] = "bad"
    elif change == "bad-starts":
        plan["start_candidates"] = "bad"
    elif change == "bad-corner-quality":
        plan["corner_quality"] = {"smallest": 10, "short_corners": "bad"}
    assert call(stores)["status"] == 422


def test_legacy_wallpaper_strips_without_segments_remain_supported(stores, wallpaper):
    for strip in wallpaper["plan_result"]["strips"]:
        strip.pop("segments")
    for piece in wallpaper["plan_result"]["pieces"]:
        piece.pop("segments")
    assert call(stores)["status"] == 200


def test_catalogue_override_json_uses_the_product_contract_and_matching_ids(stores):
    product = get_catalogue("SE").products[0]
    stores["catalogue_entries"] = [
        {
            "id": product.id,
            "product_id": product.id,
            "hidden": False,
            "data": product.model_dump_json(),
        }
    ]
    assert call(stores)["status"] == 200
    stores["catalogue_entries"][0]["data"] = product.model_copy(
        update={"id": "wrong"}
    ).model_dump_json()
    assert call(stores)["status"] == 422
