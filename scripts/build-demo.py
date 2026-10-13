#!/usr/bin/env python3
"""Build the browser demo, laid out exactly as it is served.

The output folder is what GitHub Pages serves at /Planqer/app/: the static
build of the app, the pinned Pyodide runtime (self-hosted, no CDN) and the zip
of Planqer Python that runs in it.

    python3 scripts/build-demo.py                    # build/demo
    python3 scripts/build-demo.py --out DIR
    python3 scripts/build-demo.py --skip-frontend    # reuse frontend/build-static
    python3 scripts/build-demo.py --check-budget     # also fail if it grew too much

Needs Node (the app build) and network access the first time (the runtime
download, which is then checksum-verified and cached under build/pyodide).
"""

import argparse
import importlib.util
import json
import re
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FRONTEND = ROOT / "frontend"
MANIFEST = FRONTEND / "src" / "runtime" / "manifest.json"
DEFAULT_OUT = ROOT / "build" / "demo"
BASE = "/Planqer/app/"

# Largest sizes in KB (raw, not compressed) we accept before someone has to
# look. About 20% above what the build measured when they were set, so ordinary
# work does not trip them but a surprise (a heavy dependency, a runtime
# upgrade) does. Raise one on purpose, in the PR that causes the growth.
BUDGET_KB = {
    "app": 2500,  # everything except pyodide/ (measured 2035)
    "runtime_core": 18000,  # the interpreter every visitor downloads (15126)
    "runtime_model": 23500,  # numpy, scipy, networkx, trimesh, on first STL (19417)
    "bundle": 200,  # the Planqer Python zip (112)
}


def _load(script: str):
    path = ROOT / "scripts" / script
    spec = importlib.util.spec_from_file_location(script.removesuffix(".py").replace("-", "_"), path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _manifest() -> dict:
    return json.loads(MANIFEST.read_text(encoding="utf-8"))


def core_files(manifest: dict) -> set[str]:
    """What every visitor downloads: the interpreter and its base packages."""
    return set(manifest["pyodide"]["core"]) | {p["file"] for p in manifest["packages"]["base"]}


def model_files(manifest: dict) -> set[str]:
    """What is fetched on the first 3D model import."""
    groups = ("model_pyodide", "model_pure")
    return {p["file"] for group in groups for p in manifest["packages"][group]}


def bundle_version(bundle: Path) -> str | None:
    with zipfile.ZipFile(bundle) as archive:
        source = archive.read("planqer/__init__.py").decode("utf-8")
    match = re.search(r'^__version__ = "([^"]+)"', source, re.MULTILINE)
    return match.group(1) if match else None


def frontend_version() -> str:
    return json.loads((FRONTEND / "package.json").read_text(encoding="utf-8"))["version"]


def verify(out: Path, manifest: dict, expected_version: str) -> list[str]:
    """Everything that must be true for the demo to start. Empty means fine."""
    problems = []
    index = out / "index.html"
    if not index.is_file():
        problems.append("index.html is missing")
    elif f'"{BASE}' not in index.read_text(encoding="utf-8"):
        problems.append(f"index.html does not reference assets under {BASE}")

    runtime = out / "pyodide" / "runtime"
    for name in sorted(core_files(manifest) | model_files(manifest)):
        if not (runtime / name).is_file():
            problems.append(f"runtime file missing: pyodide/runtime/{name}")

    bundle = out / "pyodide" / "bundle.zip"
    if not bundle.is_file():
        problems.append("pyodide/bundle.zip is missing")
    else:
        stamped = bundle_version(bundle)
        if stamped != expected_version:
            problems.append(f"bundle is stamped {stamped}, the app is {expected_version}")
    return problems


def measure(out: Path, manifest: dict) -> dict[str, int]:
    """Bytes in each part of the demo."""
    runtime = out / "pyodide" / "runtime"

    def size(names):
        return sum((runtime / n).stat().st_size for n in names if (runtime / n).is_file())

    pyodide = out / "pyodide"
    everything = sum(p.stat().st_size for p in out.rglob("*") if p.is_file())
    under_pyodide = sum(p.stat().st_size for p in pyodide.rglob("*") if p.is_file())
    bundle = out / "pyodide" / "bundle.zip"
    return {
        "app": everything - under_pyodide,
        "runtime_core": size(core_files(manifest)),
        "runtime_model": size(model_files(manifest)),
        "bundle": bundle.stat().st_size if bundle.is_file() else 0,
    }


def over_budget(sizes: dict[str, int], budget_kb: dict[str, int] = BUDGET_KB) -> list[str]:
    return [
        f"{part} is {sizes[part] / 1024:.0f} KB, the budget is {limit} KB"
        for part, limit in budget_kb.items()
        if sizes.get(part, 0) / 1024 > limit
    ]


def build(out: Path, skip_frontend: bool) -> None:
    manifest = _manifest()
    if not skip_frontend:
        npm = shutil.which("npm")
        if npm is None:
            raise SystemExit("npm was not found; install Node to build the app")
        subprocess.run([npm, "run", "build:static"], cwd=FRONTEND, check=True)
    built = FRONTEND / "build-static"
    if not (built / "index.html").is_file():
        raise SystemExit(f"{built} has no build; run without --skip-frontend")

    if out.exists():
        shutil.rmtree(out)
    shutil.copytree(built, out)

    _load("fetch-pyodide-runtime.py").fetch_runtime(manifest, out / "pyodide" / "runtime")
    bundle = _load("build-pyodide-bundle.py").build_bundle(ROOT / "build" / "pyodide")
    shutil.copy2(bundle, out / "pyodide" / "bundle.zip")

    problems = verify(out, manifest, frontend_version())
    if problems:
        raise SystemExit("The demo is not complete:\n  " + "\n  ".join(problems))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--skip-frontend", action="store_true")
    parser.add_argument("--check-budget", action="store_true")
    args = parser.parse_args()

    build(args.out, args.skip_frontend)
    sizes = measure(args.out, _manifest())
    for part, limit in BUDGET_KB.items():
        print(f"{part:14} {sizes[part] / 1024:8.0f} KB  (budget {limit} KB)")
    print(f"built {args.out}")

    if args.check_budget:
        problems = over_budget(sizes)
        if problems:
            print("\n".join(f"over budget: {p}" for p in problems), file=sys.stderr)
            raise SystemExit(1)


if __name__ == "__main__":
    main()
