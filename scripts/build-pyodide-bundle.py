#!/usr/bin/env python3
"""Build the zip of Partsible Python code that runs in the browser (Pyodide).

The bundle holds exactly the modules and data files listed below, nothing
else. The list is explicit on purpose: a new module must be added here to ship,
and backend/tests/test_pyodide_bundle.py fails when the code imports a module
that is not listed.

    python3 scripts/build-pyodide-bundle.py            # build/pyodide/partsible-<version>.zip
    python3 scripts/build-pyodide-bundle.py --out DIR
"""

import argparse
import re
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PACKAGE_DIR = ROOT / "backend" / "partsible"
DEFAULT_OUT = ROOT / "build" / "pyodide"

# Fixed so the same sources always give the same bytes.
ZIP_TIMESTAMP = (2020, 1, 1, 0, 0, 0)

# Paths relative to backend/. `threed_cutlist` is only imported on the first
# STL import; the rest load with `partsible.local_api`.
MODULES = (
    "partsible/__init__.py",
    "partsible/algorithms.py",
    "partsible/cache.py",
    "partsible/cad_policy.py",
    "partsible/catalogue/__init__.py",
    "partsible/catalogue/loader.py",
    "partsible/catalogue/local.py",
    "partsible/catalogue/schema.py",
    "partsible/catalogue/search.py",
    "partsible/cost_calculator.py",
    "partsible/cutlist_services.py",
    "partsible/errors.py",
    "partsible/local_api.py",
    "partsible/saved_diagrams.py",
    "partsible/schemas/__init__.py",
    "partsible/schemas/cutlists.py",
    "partsible/schemas/cutting.py",
    "partsible/schemas/product.py",
    "partsible/schemas/saved.py",
    "partsible/schemas/sheet.py",
    "partsible/schemas/tile.py",
    "partsible/schemas/wallpaper.py",
    "partsible/services.py",
    "partsible/sheet_optimization.py",
    "partsible/sheet_services.py",
    "partsible/sheet_visualization.py",
    "partsible/step_cutlist.py",
    "partsible/step_policy.py",
    "partsible/step_reader.py",
    "partsible/svg_visualization.py",
    "partsible/threed_cutlist.py",
    "partsible/tile_layout/__init__.py",
    "partsible/tile_layout/bonds.py",
    "partsible/tile_layout/geometry.py",
    "partsible/tile_layout/offcuts.py",
    "partsible/tile_layout/scoring.py",
    "partsible/tile_layout/solver.py",
    "partsible/tile_services.py",
    "partsible/tile_visualization.py",
    "partsible/uploads.py",
    "partsible/validation.py",
    "partsible/visualization_constants.py",
    "partsible/wallpaper/__init__.py",
    "partsible/wallpaper/closure.py",
    "partsible/wallpaper/geometry.py",
    "partsible/wallpaper/pattern.py",
    "partsible/wallpaper/pieces.py",
    "partsible/wallpaper/plan.py",
    "partsible/wallpaper/rolls.py",
    "partsible/wallpaper/strips.py",
    "partsible/wallpaper/validation.py",
    "partsible/wallpaper/visualization.py",
)

DATA_FILES = (
    "partsible/catalogue/data/details.yaml",
    "partsible/catalogue/data/no.yaml",
    "partsible/catalogue/data/se.yaml",
    "partsible/catalogue/data/types.yaml",
)

ALLOW_LIST = MODULES + DATA_FILES


def read_version() -> str:
    source = (PACKAGE_DIR / "__init__.py").read_text(encoding="utf-8")
    match = re.search(r'^__version__ = "([^"]+)"', source, re.MULTILINE)
    if not match:
        raise SystemExit("could not find __version__ in backend/partsible/__init__.py")
    return match.group(1)


def build_bundle(out_dir: Path = DEFAULT_OUT) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    target = out_dir / f"partsible-{read_version()}.zip"
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
