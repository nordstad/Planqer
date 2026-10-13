#!/usr/bin/env python3
"""Run the browser parity fixtures with native Python and print the replies.

frontend/tests/parity/ runs the same fixtures through Pyodide and compares.
`random` is seeded before every fixture because the genetic solvers use it.

    backend/.venv/bin/python scripts/parity-native.py
"""

import json
import random
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PARITY = ROOT / "frontend" / "tests" / "parity"

sys.path.insert(0, str(ROOT / "backend"))

from planqer.local_api import handle


def main() -> None:
    replies = {}
    for fixture in json.loads((PARITY / "fixtures.json").read_text()):
        data = None
        if "file" in fixture:
            data = (PARITY / "files" / fixture["file"]).read_bytes()
        random.seed(fixture["seed"])
        reply = handle(fixture["op"], json.dumps(fixture["payload"]), data)
        replies[fixture["name"]] = json.loads(reply)
    json.dump(replies, sys.stdout)


if __name__ == "__main__":
    main()
