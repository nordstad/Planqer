import time

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


def test_cutting_rejects_expanded_workload_before_solving():
    response = client.post(
        "/api/cutting-plans",
        json={
            "parts": {"100": 5001},
            "available_board_lengths": [200],
        },
    )

    assert response.status_code == 422
    assert "maximum is 5000" in response.text


def test_sheet_rejects_expanded_workload_before_solving():
    response = client.post(
        "/api/sheet-optimization",
        json={
            "parts": {
                **{
                    f"panel_{index}": {
                        "width": 100,
                        "height": 100,
                        "quantity": 10,
                    }
                    for index in range(99)
                },
                "panel_last": {
                    "width": 100,
                    "height": 100,
                    "quantity": 11,
                },
            },
            "sheet_width": 1000,
            "sheet_height": 1000,
        },
    )

    assert response.status_code == 422
    assert "maximum is 1000" in response.text


def test_cutting_timeout_returns_actionable_gateway_error(monkeypatch):
    def slow_optimization(*args, **kwargs):
        time.sleep(0.05)

    monkeypatch.setattr("planqer.routes.cutting.run_optimization", slow_optimization)
    monkeypatch.setattr("planqer.routes.cutting.OPTIMIZATION_TIMEOUT_SECONDS", 0.01)

    response = client.post(
        "/api/cutting-plans",
        json={"parts": {"100": 1}, "available_board_lengths": [200]},
    )

    assert response.status_code == 504
    assert "30 second time limit" in response.text


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
    progress = client.get(started["progress_url"])
    assert progress.status_code == 200
    assert progress.json()["status"] == "completed"
    task_manager._tasks.pop(started["task_id"], None)


def test_async_submission_forwards_cost_options(monkeypatch):
    captured = {}

    async def complete_task(task_id, *args):
        captured["args"] = args
        task_manager.update_task(
            task_id,
            status=TaskStatus.COMPLETED,
            progress_percent=100.0,
            current_step="Completed successfully",
            result={"cost": 2.0, "cost_analysis": {"currency": "USD"}},
        )

    monkeypatch.setattr(
        "planqer.routes.cutting.process_optimization_async", complete_task
    )
    response = client.post(
        "/api/cutting-plans/async",
        json={
            "parts": {"100": 1},
            "available_board_lengths": [200],
            "cost_analysis": {
                "enabled": True,
                "currency": "USD",
                "optimizeFor": "cost",
                "board_costs": {"200": {"price_per_board": 12.5}},
            },
        },
    )

    assert response.status_code == 200
    assert captured["args"][8] == "USD"
    assert captured["args"][9] is True
    assert captured["args"][10] == "cost"
    assert captured["args"][7][200.0]["price_per_board"] == 12.5
    progress = client.get(response.json()["progress_url"])
    assert progress.status_code == 200
    assert progress.json()["result"]["cost_analysis"]["currency"] == "USD"
    task_manager._tasks.pop(response.json()["task_id"], None)
    task_manager._tasks.pop(response.json()["task_id"], None)


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
