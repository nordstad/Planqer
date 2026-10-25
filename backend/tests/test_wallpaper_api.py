from fastapi.testclient import TestClient

from planqer.api import app


def test_wallpaper_plan_endpoint_returns_a_plan():
    response = TestClient(app).post(
        "/wallpaper-plans",
        json={
            "wallpaper": {
                "name": "Willow", "manufacturer": "Example", "roll_width": 530, "roll_length": 10050
            },
            "room": {
                "walls": [{
                    "name": "Hall", "width_top": 530, "width_middle": 530, "width_bottom": 530,
                    "height_left": 2400, "height_middle": 2400, "height_right": 2400,
                }]
            },
        },
    )

    assert response.status_code == 200
    assert response.json()["rolls_to_buy"] == 2


def test_wallpaper_plan_pieces_carry_the_opening_details():
    response = TestClient(app).post(
        "/wallpaper-plans",
        json={
            "wallpaper": {
                "name": "Willow", "manufacturer": "Example", "roll_width": 530, "roll_length": 10050
            },
            "room": {
                "walls": [{
                    "name": "Hall", "width_top": 1060, "width_middle": 1060, "width_bottom": 1060,
                    "height_left": 2400, "height_middle": 2400, "height_right": 2400,
                    "cutouts": [{
                        "kind": "window", "label": "Kitchen", "x": 100, "y": 800,
                        "width": 200, "height": 900,
                    }],
                }]
            },
        },
    )

    notch = response.json()["pieces"][0]["notches"][0]
    assert (notch["kind"], notch["label"]) == ("window", "Kitchen")
    assert notch["core"] == [100, 800, 300, 1700]


def test_wallpaper_plan_strips_carry_their_top_and_bottom_allowance():
    response = TestClient(app).post(
        "/wallpaper-plans",
        json={
            "wallpaper": {
                "name": "Willow", "manufacturer": "Example", "roll_width": 530, "roll_length": 10050
            },
            "room": {
                "walls": [{
                    "name": "Hall", "width_top": 530, "width_middle": 530, "width_bottom": 530,
                    "height_left": 2400, "height_middle": 2400, "height_right": 2400,
                }]
            },
            "allowances": {"top": 40, "bottom": 20},
        },
    )

    strip = response.json()["strips"][0]
    assert (strip["allowance_top"], strip["allowance_bottom"]) == (40, 20)
