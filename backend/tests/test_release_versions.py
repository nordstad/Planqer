"""Every hard-coded version agrees (see docs/releasing.md)."""

import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts" / "check-versions.py"

pytestmark = pytest.mark.skipif(
    not SCRIPT.exists(), reason="run from a full checkout, not just backend/"
)


def run(*args):
    return subprocess.run(
        [sys.executable, str(SCRIPT), *args],
        capture_output=True,
        text=True,
        check=False,
    )


def test_all_hard_coded_versions_agree():
    result = run()
    assert result.returncode == 0, result.stderr


def test_a_tag_that_does_not_match_is_refused():
    result = run("--tag", "v999.0.0")
    assert result.returncode == 1
    assert "does not match" in result.stderr
