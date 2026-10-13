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
]


@pytest.mark.parametrize("module", CORE_MODULES)
def test_core_module_imports_without_the_server_stack(module):
    script = textwrap.dedent(
        f"""
        import importlib
        import importlib.abc
        import sys

        BLOCKED = {SERVER_ONLY_PACKAGES!r}

        class BlockServerStack(importlib.abc.MetaPathFinder):
            def find_spec(self, name, path, target=None):
                if name.split(".")[0] in BLOCKED:
                    raise ImportError("server-only module imported: " + name)

        sys.meta_path.insert(0, BlockServerStack())
        importlib.import_module({module!r})
        """
    )

    result = subprocess.run(
        [sys.executable, "-c", script],
        cwd=BACKEND_DIR,
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0, result.stderr.strip().splitlines()[-1]
