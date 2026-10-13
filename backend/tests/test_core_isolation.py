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

MODEL_PACKAGES = ("numpy", "scipy", "networkx", "trimesh")

CORE_MODULES = [
    "planqer.services",
    "planqer.threed_cutlist",
    "planqer.step_cutlist",
    "planqer.local_api",
    "planqer.saved_diagrams",
    "planqer.schemas.saved",
    "planqer.catalogue",
    "planqer.catalogue.local",
    "planqer.catalogue.search",
]


def run_without_the_server_stack(
    code: str, extra_blocked: tuple[str, ...] = ()
) -> subprocess.CompletedProcess:
    script = textwrap.dedent(
        f"""
        import importlib.abc
        import sys

        BLOCKED = {SERVER_ONLY_PACKAGES + extra_blocked!r}

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


def test_a_model_cutlist_runs_without_the_server_stack():
    result = run_without_the_server_stack(
        """
        import json
        import trimesh
        from planqer.local_api import handle

        stl = trimesh.creation.box(extents=[1800, 95, 45]).export(file_type="stl")
        options = {"filename": "shelf.stl"}
        reply = json.loads(handle("cutlist_3d", json.dumps(options), stl))
        assert reply["status"] == 200, reply
        assert reply["body"]["board_count"] == 1

        reply = json.loads(handle("cutlist_step", json.dumps(options), b"nope"))
        assert reply["status"] == 400, reply
        """
    )

    assert result.returncode == 0, result.stderr.strip().splitlines()[-1]


def test_the_catalogue_runs_without_the_server_stack():
    result = run_without_the_server_stack(
        """
        import json
        from planqer.local_api import handle

        reply = json.loads(handle("catalogue", json.dumps({"country": "SE"})))
        assert reply["status"] == 200 and reply["body"]["products"], reply

        query = {"q": "regel", "country": "SE", "limit": 3}
        reply = json.loads(handle("catalogue_search", json.dumps(query)))
        assert reply["status"] == 200 and reply["body"], reply
        """
    )

    assert result.returncode == 0, result.stderr.strip().splitlines()[-1]


def test_the_solvers_run_without_the_model_import_packages():
    result = run_without_the_server_stack(
        """
        import json
        from planqer.local_api import handle

        def call(op, request, data=None):
            return json.loads(handle(op, json.dumps(request), data))

        reply = call(
            "cutting_plan",
            {
                "parts": {"100": 2, "50": 2},
                "available_board_lengths": [200],
                "algorithm": "first_fit_decreasing",
            },
        )
        assert reply["status"] == 200, reply

        reply = call(
            "sheet_optimization",
            {
                "parts": {"side": {"width": 600, "height": 400, "quantity": 2}},
                "sheet_width": 2440,
                "sheet_height": 1220,
                "algorithm": "guillotine_cut",
            },
        )
        assert reply["status"] == 200, reply

        reply = call(
            "tile_layout",
            {
                "surface_width": 1500,
                "surface_height": 1200,
                "tile": {"width": 600, "height": 300},
                "candidate_count": 2,
            },
        )
        assert reply["status"] == 200, reply

        reply = call("catalogue", {"country": "SE"})
        assert reply["status"] == 200, reply

        reply = call("cutlist_step", {"filename": "shelf.step"}, b"nope")
        assert reply["status"] == 400, reply

        loaded = [m for m in MODEL_PACKAGES if m in sys.modules]
        assert not loaded, loaded
        """.replace("MODEL_PACKAGES", repr(MODEL_PACKAGES)),
        extra_blocked=MODEL_PACKAGES,
    )

    assert result.returncode == 0, result.stderr.strip().splitlines()[-1]


def test_saved_diagrams_are_drawn_without_the_server_stack():
    result = run_without_the_server_stack(
        """
        import json
        from planqer.local_api import handle

        def call(op, request):
            return json.loads(handle(op, json.dumps(request)))

        plan = call(
            "cutting_plan",
            {"parts": {"100": 2}, "available_board_lengths": [200]},
        )["body"]
        reply = call(
            "saved_diagram",
            {
                "kind": "board",
                "name": "Shelf",
                "saw_blade_width": 3,
                "optimization_result": plan,
            },
        )
        assert reply["status"] == 200 and reply["body"]["image"], reply

        layout = call(
            "sheet_optimization",
            {
                "parts": {"side": {"width": 600, "height": 400, "quantity": 1}},
                "sheet_width": 2440,
                "sheet_height": 1220,
            },
        )["body"]
        reply = call(
            "saved_diagram",
            {"kind": "sheet", "name": "Cabinet", "optimization_result": layout},
        )
        assert reply["status"] == 200 and reply["body"]["image"], reply

        tiles = call(
            "tile_layout",
            {
                "surface_width": 900,
                "surface_height": 600,
                "tile": {"width": 300, "height": 300},
                "candidate_count": 1,
            },
        )["body"]
        reply = call(
            "saved_diagram",
            {
                "kind": "tile",
                "name": "Wall",
                "surface_data": {"width": 900, "height": 600, "cutouts": []},
                "layout_result": tiles["candidates"][0],
            },
        )
        assert reply["status"] == 200 and reply["body"]["image"], reply
        """
    )

    assert result.returncode == 0, result.stderr.strip().splitlines()[-1]


def test_a_save_is_validated_without_the_server_stack():
    result = run_without_the_server_stack(
        """
        import json
        from planqer.local_api import handle

        request = {
            "kind": "sheet",
            "mode": "create",
            "body": {
                "name": "Cabinet",
                "parts_data": [],
                "sheet_width": 2440,
                "sheet_height": 1220,
                "kerf_width": 3,
            },
        }
        reply = json.loads(handle("saved_request", json.dumps(request)))
        assert reply["status"] == 200, reply
        assert reply["body"]["values"]["material_type"] == "plywood", reply

        request["body"]["name"] = ""
        reply = json.loads(handle("saved_request", json.dumps(request)))
        assert reply["status"] == 422, reply
        """
    )

    assert result.returncode == 0, result.stderr.strip().splitlines()[-1]
