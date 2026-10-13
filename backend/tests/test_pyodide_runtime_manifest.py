"""The pinned browser runtime: one manifest, verified downloads, no CDN at run time."""

import hashlib
import importlib.util
import json
import re
import tomllib
from pathlib import Path

import pytest

BACKEND_DIR = Path(__file__).resolve().parents[1]
ROOT = BACKEND_DIR.parent
SCRIPT = ROOT / "scripts" / "fetch-pyodide-runtime.py"
MANIFEST = ROOT / "frontend" / "src" / "runtime" / "manifest.json"


@pytest.fixture(scope="module")
def fetcher():
    spec = importlib.util.spec_from_file_location("fetch_pyodide_runtime", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture(scope="module")
def manifest():
    return json.loads(MANIFEST.read_text(encoding="utf-8"))


def local_manifest(tmp_path, contents: dict[str, bytes], sha_overrides=None):
    """A manifest whose URLs are files on disk, so no network is needed."""
    sources = tmp_path / "sources"
    sources.mkdir(exist_ok=True)
    entries = {}
    for name, data in contents.items():
        (sources / name).write_bytes(data)
        sha = (sha_overrides or {}).get(name, hashlib.sha256(data).hexdigest())
        entries[name] = {"url": (sources / name).as_uri(), "sha256": sha}
    names = list(entries)
    return {
        "pyodide": {"core": {names[0]: entries[names[0]]}},
        "packages": {
            "base": [{"file": n, **entries[n]} for n in names[1:]],
        },
    }


def test_every_pinned_file_has_a_url_and_a_checksum(fetcher, manifest):
    files = fetcher.runtime_files(manifest)

    assert files
    for name, entry in files.items():
        assert entry["url"].startswith("https://"), name
        assert re.fullmatch(r"[0-9a-f]{64}", entry["sha256"]), name


def test_the_runtime_has_the_core_files_and_the_packages_the_code_needs(
    fetcher, manifest
):
    files = fetcher.runtime_files(manifest)

    for core in ("pyodide.mjs", "pyodide.asm.wasm", "python_stdlib.zip"):
        assert core in files
    wanted = {"pydantic", "pyyaml", "numpy", "scipy", "networkx", "trimesh"}
    pinned = {p["name"] for group in manifest["packages"].values() for p in group}
    assert wanted <= pinned


def test_the_pure_python_wheels_match_the_versions_the_server_runs(manifest):
    lock = tomllib.loads((BACKEND_DIR / "uv.lock").read_text(encoding="utf-8"))
    server = {p["name"]: p["version"] for p in lock["package"]}

    for package in manifest["packages"]["model_pure"]:
        assert package["version"] == server[package["name"]], package["name"]


def test_fetching_writes_verified_files_and_skips_ones_it_already_has(
    fetcher, tmp_path
):
    manifest = local_manifest(tmp_path, {"core.bin": b"core", "pkg.whl": b"wheel"})
    out = tmp_path / "runtime"

    first = fetcher.fetch_runtime(manifest, out)
    second = fetcher.fetch_runtime(manifest, out)

    assert sorted(first) == ["core.bin", "pkg.whl"]
    assert (out / "pkg.whl").read_bytes() == b"wheel"
    assert second == []


def test_fetching_refuses_a_file_with_the_wrong_checksum(fetcher, tmp_path):
    manifest = local_manifest(
        tmp_path,
        {"core.bin": b"core", "pkg.whl": b"tampered"},
        sha_overrides={"pkg.whl": "0" * 64},
    )
    out = tmp_path / "runtime"

    with pytest.raises(SystemExit, match="checksum mismatch"):
        fetcher.fetch_runtime(manifest, out)

    assert not (out / "pkg.whl").exists()
