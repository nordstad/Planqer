#!/usr/bin/env python3
"""Build the zip of Planqer Python code that runs in the browser (Pyodide).

The bundle holds exactly the modules and data files listed below, nothing
else. The list is explicit on purpose: a new module must be added here to ship,
and backend/tests/test_pyodide_bundle.py fails when the code imports a module
that is not listed.

    python3 scripts/build-pyodide-bundle.py            # build/pyodide/planqer-<version>.zip
    python3 scripts/build-pyodide-bundle.py --out DIR
"""

import argparse
import re
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PACKAGE_DIR = ROOT / "backend" / "planqer"
DEFAULT_OUT = ROOT / "build" / "pyodide"

# Fixed so the same sources always give the same bytes.
ZIP_TIMESTAMP = (2020, 1, 1, 0, 0, 0)

# Paths relative to backend/. `threed_cutlist` is only imported on the first
# STL import; the rest load with `planqer.local_api`.
MODULES = (
    "planqer/__init__.py",
    "planqer/algorithms.py",
    "planqer/cache.py",
    "planqer/cad_policy.py",
    "planqer/catalogue/__init__.py",
    "planqer/catalogue/loader.py",
    "planqer/catalogue/local.py",
    "planqer/catalogue/schema.py",
    "planqer/catalogue/search.py",
    "planqer/cost_calculator.py",
    "planqer/cutlist_services.py",
    "planqer/errors.py",
    "planqer/local_api.py",
    "planqer/saved_diagrams.py",
    "planqer/schemas/__init__.py",
    "planqer/schemas/cutlists.py",
    "planqer/schemas/cutting.py",
    "planqer/schemas/product.py",
    "planqer/schemas/saved.py",
    "planqer/schemas/sheet.py",
    "planqer/schemas/tile.py",
    "planqer/services.py",
    "planqer/sheet_optimization.py",
    "planqer/sheet_services.py",
    "planqer/sheet_visualization.py",
    "planqer/step_cutlist.py",
    "planqer/step_policy.py",
    "planqer/step_reader.py",
    "planqer/svg_visualization.py",
    "planqer/threed_cutlist.py",
    "planqer/tile_layout/__init__.py",
    "planqer/tile_layout/bonds.py",
    "planqer/tile_layout/geometry.py",
    "planqer/tile_layout/offcuts.py",
    "planqer/tile_layout/scoring.py",
    "planqer/tile_layout/solver.py",
    "planqer/tile_services.py",
    "planqer/tile_visualization.py",
    "planqer/uploads.py",
    "planqer/validation.py",
    "planqer/visualization_constants.py",
)

DATA_FILES = (
    "planqer/catalogue/data/details.yaml",
    "planqer/catalogue/data/no.yaml",
    "planqer/catalogue/data/se.yaml",
    "planqer/catalogue/data/types.yaml",
)

ALLOW_LIST = MODULES + DATA_FILES


def read_version() -> str:
    source = (PACKAGE_DIR / "__init__.py").read_text(encoding="utf-8")
    match = re.search(r'^__version__ = "([^"]+)"', source, re.MULTILINE)
    if not match:
        raise SystemExit("could not find __version__ in backend/planqer/__init__.py")
    return match.group(1)


def build_bundle(out_dir: Path = DEFAULT_OUT) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    target = out_dir / f"planqer-{read_version()}.zip"
    backend = PACKAGE_DIR.parent
    with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as bundle:
        for name in sorted(ALLOW_LIST):
            info = zipfile.ZipInfo(name, date_time=ZIP_TIMESTAMP)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            bundle.writestr(info, (backend / name).read_bytes())
    return target


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = parser.parse_args()
    target = build_bundle(args.out)
    print(f"{target} ({target.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
