#!/usr/bin/env python3
"""Download the pinned Pyodide runtime so the app can serve it itself.

Reads frontend/src/runtime/manifest.json, the single place that pins the
Pyodide version, its packages and every checksum. Each file is verified against
its sha256 and written flat into one directory, which the worker uses as
Pyodide's `indexURL`. A file that is already there and matches is not fetched
again. Nothing is loaded from a CDN when the app runs.

    python3 scripts/fetch-pyodide-runtime.py            # build/pyodide/runtime
    python3 scripts/fetch-pyodide-runtime.py --out DIR
"""

import argparse
import hashlib
import json
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "frontend" / "src" / "runtime" / "manifest.json"
DEFAULT_OUT = ROOT / "build" / "pyodide" / "runtime"


def runtime_files(manifest: dict) -> dict[str, dict]:
    """Map each file name to its {"url", "sha256"} entry."""
    files = dict(manifest["pyodide"]["core"])
    for group in manifest["packages"].values():
        for package in group:
            files[package["file"]] = package
    return files


def sha256_of(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def fetch_runtime(manifest: dict, out_dir: Path) -> list[str]:
    """Fetch and verify every file; return the names that were downloaded."""
    out_dir.mkdir(parents=True, exist_ok=True)
    downloaded = []
    for name, entry in sorted(runtime_files(manifest).items()):
        target = out_dir / name
        if target.is_file() and sha256_of(target) == entry["sha256"]:
            continue
        with urllib.request.urlopen(entry["url"]) as response:
            data = response.read()
        actual = hashlib.sha256(data).hexdigest()
        if actual != entry["sha256"]:
            raise SystemExit(
                f"{name}: checksum mismatch (expected {entry['sha256']}, got {actual})"
            )
        target.write_bytes(data)
        downloaded.append(name)
    return downloaded


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--manifest", type=Path, default=MANIFEST)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = parser.parse_args()
    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    downloaded = fetch_runtime(manifest, args.out)
    print(
        f"{len(runtime_files(manifest))} files in {args.out}, {len(downloaded)} downloaded"
    )


if __name__ == "__main__":
    main()
