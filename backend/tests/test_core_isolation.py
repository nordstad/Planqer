"""The calculation core must stay importable without the server stack.

The same modules run in the browser (Pyodide), where FastAPI, SQLAlchemy and
friends do not exist. Each module is imported in a fresh interpreter with those
packages blocked, so a stray import fails here instead of in a user's browser.
"""

import subprocess
import sys
import textwrap
from pathlib import Path

import pytest

BACKEND_DIR = Path(__file__).resolve().parents[1]

SERVER_ONLY_PACKAGES = (
    "fastapi",
    "starlette",
    "uvicorn",
    "slowapi",
    "sqlmodel",
    "sqlalchemy",
    "alembic",
    "aiosqlite",
    "greenlet",
    "prometheus_client",
    "structlog",
    "jwt",
    "bcrypt",
    "email_validator",
    "multipart",
)

CORE_MODULES = [
    "planqer.services",
    "planqer.threed_cutlist",
    "planqer.step_cutlist",
    "planqer.local_api",
]


def run_without_the_server_stack(code: str) -> subprocess.CompletedProcess:
    script = textwrap.dedent(
        f"""
        import importlib.abc
        import sys

        BLOCKED = {SERVER_ONLY_PACKAGES!r}

        class BlockServerStack(importlib.abc.MetaPathFinder):
            def find_spec(self, name, path, target=None):
                if name.split(".")[0] in BLOCKED:
                    raise ImportError("server-only module imported: " + name)

        sys.meta_path.insert(0, BlockServerStack())
        """
    ) + textwrap.dedent(code)

    return subprocess.run(
        [sys.executable, "-c", script],
        cwd=BACKEND_DIR,
        capture_output=True,
        text=True,
        check=False,
    )


@pytest.mark.parametrize("module", CORE_MODULES)
def test_core_module_imports_without_the_server_stack(module):
    result = run_without_the_server_stack(
        f"import importlib; importlib.import_module({module!r})"
    )

    assert result.returncode == 0, result.stderr.strip().splitlines()[-1]


def test_a_cutting_plan_runs_without_the_server_stack():
    result = run_without_the_server_stack(
        """
        import json
        from planqer.local_api import handle

        request = {
            "parts": {"100": 2, "50": 2},
            "available_board_lengths": [200],
            "algorithm": "first_fit_decreasing",
        }
        reply = json.loads(handle("cutting_plan", json.dumps(request)))
        assert reply["status"] == 200, reply
        assert reply["body"]["optimal_board_length"] == 200
        """
    )

    assert result.returncode == 0, result.stderr.strip().splitlines()[-1]


def test_a_sheet_plan_runs_without_the_server_stack():
    result = run_without_the_server_stack(
        """
        import json
        from planqer.local_api import handle

        request = {
            "parts": {"side": {"width": 600, "height": 400, "quantity": 2}},
            "sheet_width": 2440,
            "sheet_height": 1220,
            "algorithm": "guillotine_cut",
        }
        reply = json.loads(handle("sheet_optimization", json.dumps(request)))
        assert reply["status"] == 200, reply
        assert reply["body"]["total_sheets"] == 1
        """
    )

    assert result.returncode == 0, result.stderr.strip().splitlines()[-1]


def test_a_tile_layout_runs_without_the_server_stack():
    result = run_without_the_server_stack(
        """
        import json
        from planqer.local_api import handle

        request = {
            "surface_width": 1500,
            "surface_height": 1200,
            "tile": {"width": 600, "height": 300},
            "candidate_count": 2,
        }
        reply = json.loads(handle("tile_layout", json.dumps(request)))
        assert reply["status"] == 200, reply
        assert reply["body"]["candidates"]
        """
    )

    assert result.returncode == 0, result.stderr.strip().splitlines()[-1]
