from fastapi.testclient import TestClient

from planqer.api import app

client = TestClient(app)


def test_api_prefixed_and_root_paths_are_served():
    for path in ("/health", "/metrics", "/openapi.json", "/docs"):
        assert client.get(f"/api{path}").status_code == 200
        assert client.get(path).status_code == 200


def test_docs_point_at_the_matching_openapi_url():
    assert "/api/openapi.json" in client.get("/api/docs").text
    assert "/api/openapi.json" not in client.get("/docs").text


def test_lifespan_runs_once_per_startup(monkeypatch):
    calls = []
    monkeypatch.setattr("planqer.api.check_single_user_bind", lambda: None)
    monkeypatch.setattr("planqer.api._run_migrations", lambda: calls.append("m"))
    monkeypatch.setattr("planqer.api.start_periodic_cleanup", lambda: calls.append("c"))
    with TestClient(app) as c:
        c.get("/api/health")
    assert calls == ["m", "c"]
