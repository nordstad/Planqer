#!/usr/bin/env python3
"""Fail if a build of the self-hosted app contains any part of the browser demo.

The demo is the same code built with VITE_PLANQER_MODE=static. A normal build
must contain none of it: no Pyodide runtime, no worker, no demo screens, no
analytics. Run it on the output of `npm run build` (what the Docker image
serves).

    python3 scripts/check-no-demo-code.py frontend/build
"""

import sys
from pathlib import Path

# (text, ignore case). Each is something only demo code, or the code that loads
# analytics, contains. Identifiers are matched exactly: translations say
# "Planqer-demon" and a privacy sentence may name Umami, and locale files ship
# in every build, so those words alone must not trip the check. Umami is caught
# by what loads it: its host, its tracking call, its tag attribute, our setting.
MARKERS = (
    ("pyodide", True),
    ("solverWorker", False),
    ("loading-runtime", False),
    ("planqer-demo", False),
    ("planqer.demo.", False),
    ("catalogue_admin", False),
    ("catalogue_entries", False),
    ("cloud.umami.is", True),
    ("umami.track", True),
    ("data-website-id", True),
    ("VITE_PLANQER_UMAMI", True),
    ("googletagmanager", True),
    ("325f5fce-eb47-46fb-bad7-da1137224c33", True),
)


def find_markers(root: Path) -> list[str]:
    """Every "<file>: <marker>" in the tree. Empty means clean."""
    found = []
    for path in sorted(p for p in root.rglob("*") if p.is_file()):
        content = path.read_bytes()
        lowered = content.lower()
        for marker, ignore_case in MARKERS:
            haystack = lowered if ignore_case else content
            needle = marker.lower() if ignore_case else marker
            if needle.encode() in haystack:
                found.append(f"{path.relative_to(root)}: {marker}")
    return found


def main() -> None:
    roots = [Path(arg) for arg in sys.argv[1:]]
    if not roots:
        raise SystemExit(__doc__)
    problems = []
    for root in roots:
        if not root.is_dir():
            raise SystemExit(f"{root} is not a directory; build the app first")
        problems += [f"{root}/{p}" for p in find_markers(root)]
    if problems:
        print("The self-hosted build contains demo code:", file=sys.stderr)
        print("\n".join(f"  {p}" for p in problems), file=sys.stderr)
        raise SystemExit(1)
    print(f"clean: {', '.join(str(r) for r in roots)}")


if __name__ == "__main__":
    main()
