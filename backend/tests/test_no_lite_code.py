"""The self-hosted product must contain none of Lite."""

import importlib.util
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts" / "check-no-lite-code.py"


@pytest.fixture(scope="module")
def guard():
    spec = importlib.util.spec_from_file_location("check_no_lite_code", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_a_clean_build_passes(guard, tmp_path):
    (tmp_path / "assets").mkdir()
    (tmp_path / "assets" / "app.js").write_text(
        "const app = 'partsible';", encoding="utf-8"
    )

    assert guard.find_markers(tmp_path) == []


@pytest.mark.parametrize(
    "marker",
    [
        "pyodide",
        "solverWorker",
        "loading-runtime",
        "partsible-lite",
        "partsible.lite.",
        "catalogue_admin",
        ".createObjectStore(",
        "cloud.umami.is",
        "umami.track",
        "data-website-id",
        "VITE_PARTSIBLE_UMAMI",
        "googletagmanager",
        "325f5fce-eb47-46fb-bad7-da1137224c33",
    ],
)
def test_each_lite_marker_is_caught(guard, tmp_path, marker):
    (tmp_path / "index-abc.js").write_text(f"x = '{marker}'", encoding="utf-8")

    assert guard.find_markers(tmp_path) == [f"index-abc.js: {marker}"]


def test_some_markers_are_found_whatever_the_case(guard, tmp_path):
    (tmp_path / "a.js").write_text(
        "Pyodide.load(); window.UMAMI.TRACK()", encoding="utf-8"
    )

    assert guard.find_markers(tmp_path) == ["a.js: pyodide", "a.js: umami.track"]


def test_translated_text_about_lite_is_not_lite_code(guard, tmp_path):
    # Locale files ship in every build. "Partsible-demon" is Swedish for Lite
    # and a privacy sentence may name Umami; neither is Lite's code.
    (tmp_path / "locale.js").write_text(
        'sv:"Du använder Partsible-demon", note:"Statistik hos Umami Cloud",'
        'stores:{catalogue_entries:"Catalogue entries"}',
        encoding="utf-8",
    )

    assert guard.find_markers(tmp_path) == []


def test_markers_are_found_in_binary_files_too(guard, tmp_path):
    (tmp_path / "chunk.wasm").write_bytes(b"\x00\x01pyodide\x02")

    assert guard.find_markers(tmp_path) == ["chunk.wasm: pyodide"]


def test_the_command_fails_on_a_leak_and_succeeds_when_clean(tmp_path):
    clean, leaky = tmp_path / "clean", tmp_path / "leaky"
    clean.mkdir()
    leaky.mkdir()
    (clean / "a.js").write_text("ok", encoding="utf-8")
    (leaky / "a.js").write_text("umami.track()", encoding="utf-8")

    def run(folder):
        return subprocess.run(
            [sys.executable, str(SCRIPT), str(folder)],
            capture_output=True,
            text=True,
            check=False,
        )

    assert run(clean).returncode == 0
    failed = run(leaky)
    assert failed.returncode == 1
    assert "umami.track" in failed.stderr


@pytest.mark.parametrize(
    "path",
    [
        "frontend/Dockerfile",
        "docker-compose.yml",
        "docker-compose.simple.yml",
        "frontend/nginx.conf",
    ],
)
def test_the_docker_files_never_switch_lite_on(path):
    text = (ROOT / path).read_text(encoding="utf-8").lower()

    assert "partsible_mode" not in text
    assert "umami" not in text
