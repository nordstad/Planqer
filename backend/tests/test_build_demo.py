"""`scripts/build-demo.py` lays the demo out as Pages serves it and refuses to
call an incomplete one finished."""

import importlib.util
import zipfile
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "build-demo.py"


@pytest.fixture(scope="module")
def demo():
    spec = importlib.util.spec_from_file_location("build_demo", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _bundle(path: Path, version: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(path, "w") as archive:
        archive.writestr("planqer/__init__.py", f'__version__ = "{version}"\n')


def _complete_demo(demo, out: Path, version: str = "1.2.3") -> dict:
    manifest = demo._manifest()
    out.mkdir(parents=True)
    (out / "index.html").write_text(
        '<script src="/Planqer/app/assets/index.js"></script>', encoding="utf-8"
    )
    runtime = out / "pyodide" / "runtime"
    runtime.mkdir(parents=True)
    for name in demo.core_files(manifest) | demo.model_files(manifest):
        (runtime / name).write_bytes(b"x" * 1024)
    _bundle(out / "pyodide" / "bundle.zip", version)
    return manifest


def test_a_complete_demo_has_no_problems(demo, tmp_path):
    manifest = _complete_demo(demo, tmp_path / "demo")
    assert demo.verify(tmp_path / "demo", manifest, "1.2.3") == []


def test_a_missing_runtime_file_is_named(demo, tmp_path):
    manifest = _complete_demo(demo, tmp_path / "demo")
    (tmp_path / "demo" / "pyodide" / "runtime" / "pyodide.asm.wasm").unlink()

    (problem,) = demo.verify(tmp_path / "demo", manifest, "1.2.3")

    assert "pyodide.asm.wasm" in problem


def test_a_missing_bundle_is_reported(demo, tmp_path):
    manifest = _complete_demo(demo, tmp_path / "demo")
    (tmp_path / "demo" / "pyodide" / "bundle.zip").unlink()

    assert demo.verify(tmp_path / "demo", manifest, "1.2.3") == [
        "pyodide/bundle.zip is missing"
    ]


def test_a_bundle_from_another_version_is_reported(demo, tmp_path):
    manifest = _complete_demo(demo, tmp_path / "demo", version="0.8.2")

    (problem,) = demo.verify(tmp_path / "demo", manifest, "1.2.3")

    assert "0.8.2" in problem and "1.2.3" in problem


def test_an_app_built_for_the_wrong_base_is_reported(demo, tmp_path):
    manifest = _complete_demo(demo, tmp_path / "demo")
    (tmp_path / "demo" / "index.html").write_text(
        '<script src="/assets/x.js">', encoding="utf-8"
    )

    (problem,) = demo.verify(tmp_path / "demo", manifest, "1.2.3")

    assert "/Planqer/app/" in problem


def test_missing_index_is_reported(demo, tmp_path):
    manifest = _complete_demo(demo, tmp_path / "demo")
    (tmp_path / "demo" / "index.html").unlink()

    assert "index.html is missing" in demo.verify(tmp_path / "demo", manifest, "1.2.3")


def test_sizes_are_counted_per_part(demo, tmp_path):
    manifest = _complete_demo(demo, tmp_path / "demo")
    (tmp_path / "demo" / "assets").mkdir()
    (tmp_path / "demo" / "assets" / "app.js").write_bytes(b"x" * 5000)

    sizes = demo.measure(tmp_path / "demo", manifest)

    assert sizes["runtime_core"] == 1024 * len(demo.core_files(manifest))
    assert sizes["runtime_model"] == 1024 * len(demo.model_files(manifest))
    assert sizes["app"] >= 5000
    assert sizes["app"] < 5000 + 200  # index.html only; the runtime is not "the app"
    assert sizes["bundle"] > 0


def test_growth_past_the_budget_names_the_part(demo):
    sizes = {
        "app": 100 * 1024,
        "runtime_core": 999999 * 1024,
        "runtime_model": 0,
        "bundle": 0,
    }

    (problem,) = demo.over_budget(sizes)

    assert problem.startswith("runtime_core is ")


def test_staying_within_budget_is_fine(demo):
    sizes = {part: limit * 1024 for part, limit in demo.BUDGET_KB.items()}
    assert demo.over_budget(sizes) == []


def test_every_measured_part_has_a_budget(demo, tmp_path):
    manifest = _complete_demo(demo, tmp_path / "demo")

    assert set(demo.measure(tmp_path / "demo", manifest)) == set(demo.BUDGET_KB)
