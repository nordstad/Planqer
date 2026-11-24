"""`scripts/build-lite.py` lays Lite out as Pages serves it and refuses to
call an incomplete one finished."""

import importlib.util
import zipfile
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "build-lite.py"


@pytest.fixture(scope="module")
def lite():
    spec = importlib.util.spec_from_file_location("build_lite", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _bundle(path: Path, version: str, source: str = "") -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(path, "w") as archive:
        archive.writestr("partsible/__init__.py", f'__version__ = "{version}"\n')
        archive.writestr("partsible/solver.py", source)


def _complete_lite(lite, out: Path, version: str = "1.2.3") -> dict:
    manifest = lite._manifest()
    out.mkdir(parents=True)
    (out / "index.html").write_text(
        '<script src="/assets/index.js"></script>', encoding="utf-8"
    )
    runtime = out / "pyodide" / "runtime"
    runtime.mkdir(parents=True)
    for name in lite.core_files(manifest) | lite.model_files(manifest):
        (runtime / name).write_bytes(b"x" * 1024)
    bundle = out / "pyodide" / "bundle.zip"
    _bundle(bundle, version)
    name = lite.bundle_filename(bundle)
    bundle.rename(out / "pyodide" / name)
    (out / "assets").mkdir()
    (out / "assets" / "solver.js").write_text(
        f'const bundle = "{name}";', encoding="utf-8"
    )
    return manifest


def test_a_complete_lite_has_no_problems(lite, tmp_path):
    manifest = _complete_lite(lite, tmp_path / "lite")
    assert lite.verify(tmp_path / "lite", manifest, "1.2.3") == []


def test_lite_cache_headers_are_not_in_self_hosted_public_files(lite, tmp_path):
    headers = lite.FRONTEND / "public" / "_headers"
    assert "/pyodide/bundle.zip" not in headers.read_text()
    output_headers = tmp_path / "_headers"
    output_headers.write_text(headers.read_text())

    lite.add_lite_headers(tmp_path)

    assert "/pyodide/bundle.zip\n  Cache-Control: no-cache" in output_headers.read_text()


def test_a_missing_runtime_file_is_named(lite, tmp_path):
    manifest = _complete_lite(lite, tmp_path / "lite")
    (tmp_path / "lite" / "pyodide" / "runtime" / "pyodide.asm.wasm").unlink()

    (problem,) = lite.verify(tmp_path / "lite", manifest, "1.2.3")

    assert "pyodide.asm.wasm" in problem


def test_a_missing_bundle_is_reported(lite, tmp_path):
    manifest = _complete_lite(lite, tmp_path / "lite")
    name = next(iter(lite.frontend_bundle_names(tmp_path / "lite")))
    (tmp_path / "lite" / "pyodide" / name).unlink()

    assert lite.verify(tmp_path / "lite", manifest, "1.2.3") == [
        f"pyodide/{name} is missing"
    ]


def test_a_changed_bundle_gets_a_new_name_and_the_old_frontend_is_rejected(
    lite, tmp_path
):
    out = tmp_path / "lite"
    manifest = _complete_lite(lite, out)
    old_name = next(iter(lite.frontend_bundle_names(out)))
    old_bundle = out / "pyodide" / old_name
    _bundle(old_bundle, "1.2.3", "changed solver")
    new_name = lite.bundle_filename(old_bundle)
    assert new_name != old_name
    assert any(
        "does not match its content hash" in problem
        for problem in lite.verify(out, manifest, "1.2.3")
    )


def test_rejects_frontend_built_for_a_different_bundle(lite, tmp_path):
    out = tmp_path / "lite"
    manifest = _complete_lite(lite, out)
    (out / "assets" / "solver.js").write_text(
        f'const bundle = "partsible-{"a" * 64}.zip";'
    )
    assert any(
        "is missing" in problem for problem in lite.verify(out, manifest, "1.2.3")
    )


def test_a_bundle_from_another_version_is_reported(lite, tmp_path):
    manifest = _complete_lite(lite, tmp_path / "lite", version="0.8.2")

    (problem,) = lite.verify(tmp_path / "lite", manifest, "1.2.3")

    assert "0.8.2" in problem and "1.2.3" in problem


def test_an_app_built_for_the_wrong_base_is_reported(lite, tmp_path):
    manifest = _complete_lite(lite, tmp_path / "lite")
    (tmp_path / "lite" / "index.html").write_text(
        '<script src="/old-base/assets/x.js">', encoding="utf-8"
    )

    (problem,) = lite.verify(tmp_path / "lite", manifest, "1.2.3")

    assert "/assets/" in problem


def test_missing_index_is_reported(lite, tmp_path):
    manifest = _complete_lite(lite, tmp_path / "lite")
    (tmp_path / "lite" / "index.html").unlink()

    assert "index.html is missing" in lite.verify(tmp_path / "lite", manifest, "1.2.3")


def test_sizes_are_counted_per_part(lite, tmp_path):
    manifest = _complete_lite(lite, tmp_path / "lite")
    (tmp_path / "lite" / "assets" / "app.js").write_bytes(b"x" * 5000)

    sizes = lite.measure(tmp_path / "lite", manifest)

    assert sizes["runtime_core"] == 1024 * len(lite.core_files(manifest))
    assert sizes["runtime_model"] == 1024 * len(lite.model_files(manifest))
    assert sizes["app"] >= 5000
    assert sizes["app"] < 5000 + 200  # index.html only; the runtime is not "the app"
    assert sizes["bundle"] > 0


def test_growth_past_the_budget_names_the_part(lite):
    sizes = {
        "app": 100 * 1024,
        "runtime_core": 999999 * 1024,
        "runtime_model": 0,
        "bundle": 0,
    }

    (problem,) = lite.over_budget(sizes)

    assert problem.startswith("runtime_core is ")


def test_staying_within_budget_is_fine(lite):
    sizes = {part: limit * 1024 for part, limit in lite.BUDGET_KB.items()}
    assert lite.over_budget(sizes) == []


def test_every_measured_part_has_a_budget(lite, tmp_path):
    manifest = _complete_lite(lite, tmp_path / "lite")

    assert set(lite.measure(tmp_path / "lite", manifest)) == set(lite.BUDGET_KB)
