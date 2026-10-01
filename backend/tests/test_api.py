from fastapi.testclient import TestClient

from planqer.api import app
from planqer.async_processing import TaskStatus, task_manager

client = TestClient(app)


def test_root():
    response = client.get("/api/")
    assert response.status_code == 404 or response.status_code == 200


def test_planqer_success():
    payload = {
        "parts": {"100": 2, "50": 2},
        "available_board_lengths": [200],
        "saw_blade_width": 3.0,
    }
    response = client.post("/api/cutting-plans", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "optimal_board_length" in data
    assert "cut_list" in data
    assert "visualization" in data


def test_planqer_invalid_board():
    payload = {
        "parts": {"300": 1},
        "available_board_lengths": [200],
        "saw_blade_width": 3.0,
    }
    response = client.post("/api/cutting-plans", json=payload)
    assert response.status_code == 400


def test_async_submission_and_http_polling(monkeypatch):
    async def complete_task(task_id, *_args):
        task_manager.update_task(
            task_id,
            status=TaskStatus.COMPLETED,
            progress_percent=100.0,
            current_step="Completed successfully",
            result={"cost": 1.0},
        )

    monkeypatch.setattr(
        "planqer.routes.cutting.process_optimization_async", complete_task
    )
    payload = {
        "parts": {"100": 1},
        "available_board_lengths": [200],
        "saw_blade_width": 3.0,
    }

    response = client.post("/api/cutting-plans/async", json=payload)

    assert response.status_code == 200
    started = response.json()
    assert started["progress_url"] == f"/api/tasks/{started['task_id']}"
    # The app's configured root path is applied by the ASGI server, while the
    # route currently includes /api in its declared path.
    progress = client.get(f"/api{started['progress_url']}")
    assert progress.status_code == 200
    assert progress.json()["status"] == "completed"
    task_manager._tasks.pop(started["task_id"], None)


def test_async_task_progress_is_sent_over_websocket():
    task_id = "http-websocket-test"
    task_manager.create_task(task_id)
    task_manager.update_task(
        task_id,
        status=TaskStatus.COMPLETED,
        progress_percent=100.0,
        current_step="Completed successfully",
        result={"cost": 1.0},
    )

    with client.websocket_connect(f"/ws/{task_id}") as websocket:
        progress = websocket.receive_json()

    assert progress["task_id"] == task_id
    assert progress["status"] == "completed"
    task_manager._tasks.pop(task_id, None)
