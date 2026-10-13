"""The browser bundle ships exactly the allow-listed files, and enough of them.

`scripts/build-pyodide-bundle.py` lists every module and data file the browser
needs. These tests fail when the code starts importing something that is not
on the list, so the gap shows up here and not in a user's browser.
"""

import importlib.util
import json
import subprocess
import sys
import textwrap
import zipfile
from pathlib import Path

import pytest

BACKEND_DIR = Path(__file__).resolve().parents[1]
SCRIPT = BACKEND_DIR.parent / "scripts" / "build-pyodide-bundle.py"


@pytest.fixture(scope="module")
def builder():
    spec = importlib.util.spec_from_file_location("build_pyodide_bundle", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_the_bundle_is_stamped_with_the_package_version(builder, tmp_path):
    import planqer

    target = builder.build_bundle(tmp_path)

    assert target.name == f"planqer-{planqer.__version__}.zip"


def test_the_bundle_contains_exactly_the_allow_list(builder, tmp_path):
    target = builder.build_bundle(tmp_path)

    with zipfile.ZipFile(target) as bundle:
        assert sorted(bundle.namelist()) == sorted(builder.ALLOW_LIST)


def test_the_bundle_is_reproducible(builder, tmp_path):
    first = builder.build_bundle(tmp_path / "a").read_bytes()
    second = builder.build_bundle(tmp_path / "b").read_bytes()

    assert first == second


def test_every_allow_listed_file_exists(builder):
    missing = [
        name for name in builder.ALLOW_LIST if not (BACKEND_DIR / name).is_file()
    ]

    assert missing == []


def test_the_code_only_imports_allow_listed_modules(builder):
    script = textwrap.dedent(
        """
        import json
        import sys
        import trimesh
        from planqer.local_api import handle

        stl = trimesh.creation.box(extents=[1800, 95, 45]).export(file_type="stl")
        handle("cutlist_3d", json.dumps({"filename": "shelf.stl"}), stl)
        handle("catalogue", json.dumps({"country": "SE"}))
        print(json.dumps(sorted(m for m in sys.modules if m.startswith("planqer"))))
        """
    )
    result = subprocess.run(
        [sys.executable, "-c", script],
        cwd=BACKEND_DIR,
        capture_output=True,
        text=True,
        check=True,
    )

    allowed = set()
    for name in builder.MODULES:
        parts = name.removesuffix(".py").split("/")
        if parts[-1] == "__init__":
            parts = parts[:-1]
        allowed.add(".".join(parts))

    imported = set(json.loads(result.stdout))
    assert imported - allowed == set()
    assert allowed - imported == set()
