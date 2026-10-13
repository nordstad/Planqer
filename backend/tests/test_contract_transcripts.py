"""The recorded contract for the browser's local store must match the server.

frontend/tests/contract/transcripts.json is what the real API answered to the
scripted scenarios. The browser store is tested against that file, so it must
not drift from the server. If this fails, the API changed: run
`backend/.venv/bin/python scripts/contract-transcripts.py`, review the diff,
and make the browser store follow.
"""

import importlib.util
import json
import uuid
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

pytestmark = pytest.mark.api

SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "contract-transcripts.py"


@pytest.fixture(scope="module")
def recorder():
    spec = importlib.util.spec_from_file_location("contract_transcripts", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture(scope="module")
def client():
    from planqer.api import app

    with TestClient(app) as test_client:
        test_client.headers["X-Planqer-Setup-Secret"] = "test-setup-secret"
        yield test_client


def test_the_recorded_transcripts_match_what_the_server_answers(recorder, client):
    def new_user():
        user = {
            "email": f"contract-{uuid.uuid4()}@example.com",
            "password": "Testpassword" + "123!",
        }
        client.post("/api/auth/register", json=user)
        token = client.post("/api/auth/login", json=user).json()["access_token"]
        return {"Authorization": f"Bearer {token}"}

    live = recorder.run_scenarios(client, new_user)

    recorded = json.loads(recorder.TRANSCRIPTS.read_text(encoding="utf-8"))
    assert live == recorded
