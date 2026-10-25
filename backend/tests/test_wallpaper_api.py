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
