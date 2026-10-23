import json

from fastapi.testclient import TestClient

from planqer.api import app
from planqer.local_api import handle


PAYLOAD = {
    "wallpaper": {
        "name": "Willow",
        "manufacturer": "Example",
        "roll_width": 530,
        "roll_length": 10050,
        "repeat": 640,
        "match": "straight",
    },
    "room": {
        "walls": [{
            "name": "Hall",
            "width_top": 1060,
            "width_middle": 1060,
            "width_bottom": 1060,
            "height_left": 2400,
            "height_middle": 2400,
            "height_right": 2400,
        }],
    },
}


def test_local_wallpaper_plan_matches_the_http_endpoint():
    http = TestClient(app).post("/wallpaper-plans", json=PAYLOAD)
    reply = json.loads(handle("wallpaper_plan", json.dumps(PAYLOAD)))

    assert reply == {"status": http.status_code, "body": http.json()}
