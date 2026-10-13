#!/usr/bin/env python3
"""Record how the real API answers the browser contract scenarios.

frontend/tests/contract/scenarios.json is a list of scripted request
sequences (save, list, rename, delete...). This runs each one against the
FastAPI app and writes what came back, normalised, to
frontend/tests/contract/transcripts.json. The browser's local store must give
the same transcripts (frontend/tests/parity/contract.parity.test.js), and
backend/tests/test_contract_transcripts.py fails when this file goes stale.

Normalising makes the two sides comparable: ids become <id:N> in order of
appearance, timestamps become <time>, a stored diagram becomes <image>, and a
validation error keeps only its type, location and message.

    backend/.venv/bin/python scripts/contract-transcripts.py          # rewrite
    backend/.venv/bin/python scripts/contract-transcripts.py --check  # compare
"""

import argparse
import json
import os
import re
import sys
import tempfile
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONTRACT = ROOT / "frontend" / "tests" / "contract"
SCENARIOS = CONTRACT / "scenarios.json"
TRANSCRIPTS = CONTRACT / "transcripts.json"

UUID = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.IGNORECASE
)
PLACEHOLDER = re.compile(r"\{\{(\w+)\.(\w+)\}\}")


def substitute(value, saved: dict):
    if isinstance(value, str):
        whole = PLACEHOLDER.fullmatch(value)
        if whole:
            return saved[whole[1]][whole[2]]
        return PLACEHOLDER.sub(lambda m: str(saved[m[1]][m[2]]), value)
    if isinstance(value, list):
        return [substitute(item, saved) for item in value]
    if isinstance(value, dict):
        return {key: substitute(item, saved) for key, item in value.items()}
    return value


def normalise(value, ids: dict[str, str], key: str | None = None):
    if isinstance(value, dict):
        return {k: normalise(value[k], ids, k) for k in sorted(value)}
    if isinstance(value, list):
        return [normalise(item, ids, key) for item in value]
    if key in ("created_at", "updated_at") and isinstance(value, str):
        return "<time>"
    if key == "cutlist_image" and isinstance(value, str):
        return "<image>"
    if isinstance(value, str) and UUID.match(value):
        return ids.setdefault(value.lower(), f"<id:{len(ids) + 1}>")
    return value


def reduce_validation(body):
    if isinstance(body, dict) and isinstance(body.get("detail"), list):
        detail = [
            {"type": e["type"], "loc": e["loc"], "msg": e["msg"]}
            for e in body["detail"]
        ]
        return {**body, "detail": detail}
    return body


def run_scenarios(client, headers_for_new_user) -> list[dict]:
    transcripts = []
    for scenario in json.loads(SCENARIOS.read_text(encoding="utf-8")):
        headers = headers_for_new_user()
        saved: dict = {}
        ids: dict[str, str] = {}
        steps = []
        for step in scenario["steps"]:
            path = substitute(step["path"], saved)
            body = substitute(step.get("body"), saved)
            response = client.request(
                step["method"], f"/api{path}", json=body, headers=headers
            )
            if response.headers.get("content-type", "").startswith("application/json"):
                answer = response.json()
            else:
                text = response.text
                assert text.lstrip().startswith(("<?xml", "<svg")), text[:80]
                answer = "<svg image>"
            if "as" in step:
                saved[step["as"]] = answer
            steps.append(
                {
                    "request": f"{step['method']} {step['path']}",
                    "status": response.status_code,
                    "body": normalise(reduce_validation(answer), ids),
                }
            )
        transcripts.append({"name": scenario["name"], "steps": steps})
    return transcripts


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()

    database = Path(tempfile.mkdtemp()) / "contract.db"
    os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{database}"
    os.environ["PLANQER_SETUP_SECRET"] = "test-setup-secret"
    sys.path.insert(0, str(ROOT / "backend"))

    from fastapi.testclient import TestClient

    from planqer.api import app

    with TestClient(app) as client:
        client.headers["X-Planqer-Setup-Secret"] = "test-setup-secret"

        def new_user():
            user = {
                "email": f"contract-{uuid.uuid4()}@example.com",
                "password": "Testpassword" + "123!",
            }
            client.post("/api/auth/register", json=user)
            token = client.post("/api/auth/login", json=user).json()["access_token"]
            return {"Authorization": f"Bearer {token}"}

        transcripts = run_scenarios(client, new_user)

    text = json.dumps(transcripts, indent=1) + "\n"
    if args.check:
        sys.exit(0 if TRANSCRIPTS.read_text(encoding="utf-8") == text else 1)
    TRANSCRIPTS.write_text(text, encoding="utf-8")
    print(f"{len(transcripts)} scenarios -> {TRANSCRIPTS}")


if __name__ == "__main__":
    main()
