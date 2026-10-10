#!/usr/bin/env python3
"""Check that every hard-coded Planqer version agrees.

The source of truth is `__version__` in backend/planqer/__init__.py. Run this
after bumping a release (docs/releasing.md); the publish workflow runs it with
the pushed tag, so a tag that doesn't match the files never publishes images.

    python3 scripts/check-versions.py            # files agree with each other
    python3 scripts/check-versions.py --tag v0.8.0   # ...and with this tag
"""

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = "backend/planqer/__init__.py"

# (file, pattern, what it is). Every match must carry the release version, and
# there must be at least one.
TEXT_CHECKS = [
    ("backend/pyproject.toml", r'^version = "([^"]+)"', "backend package version"),
    ("mcp-server/pyproject.toml", r'^version = "([^"]+)"', "MCP Python package version"),
    ("mcp-server/src/index.ts", r"MCP_SERVER_VERSION = '([^']+)'", "TypeScript MCP server version"),
    ("mcp-server/src/planqer_mcp_server/server.py", r'MCP_SERVER_VERSION = "([^"]+)"', "Python MCP server version"),
    ("mcp-server/src/planqer_mcp_server/server.py", r'^\s+version="([^"]+)",', "Python MCP server protocol version"),
    ("backend/uv.lock", r'^name = "planqer"\nversion = "([^"]+)"', "backend lock file"),
    ("mcp-server/uv.lock", r'^name = "planqer-mcp-server"\nversion = "([^"]+)"', "MCP lock file"),
    ("docs/getting-started.md", r"PLANQER_VERSION=(\d[^\s`]*)", "pinned version in Getting started"),
    ("docs/getting-started.md", r"planqer-(?:backend|frontend|mcp-server):(\d[^\s`)]*)", "image tag in Getting started"),
    ("docs/reference/configuration.md", r"PLANQER_VERSION=(\d[^\s`]*)", "example .env in Configuration"),
    ("docs/guide/mcp-server.md", r"share the same tool schema and version \(`([^`]+)`\)", "MCP version in the MCP guide"),
    ("README.md", r"PLANQER_VERSION=(\d[^\s`]*)", "pinned version in the README"),
    (".env.example", r"\(e\.g\. (\d[^)\s]*)\)", "example version in .env.example"),
]
JSON_CHECKS = [
    ("frontend/package.json", ("version",), "frontend package version"),
    ("frontend/package-lock.json", ("version",), "frontend lock file"),
    ("frontend/package-lock.json", ("packages", "", "version"), "frontend lock file root package"),
    ("mcp-server/package.json", ("version",), "MCP package version"),
    ("mcp-server/package-lock.json", ("version",), "MCP lock file"),
    ("mcp-server/package-lock.json", ("packages", "", "version"), "MCP lock file root package"),
]


def release_version() -> str:
    text = (ROOT / SOURCE).read_text(encoding="utf-8")
    match = re.search(r'^__version__ = "([^"]+)"', text, re.MULTILINE)
    if not match:
        sys.exit(f"{SOURCE}: no __version__ found")
    return match.group(1)


def line_of(text: str, offset: int) -> int:
    return text.count("\n", 0, offset) + 1


def problems(version: str) -> list[str]:
    found: list[str] = []
    for name, pattern, what in TEXT_CHECKS:
        text = (ROOT / name).read_text(encoding="utf-8")
        matches = list(re.finditer(pattern, text, re.MULTILINE))
        if not matches:
            found.append(f"{name}: {what} not found (did its wording change? update scripts/check-versions.py)")
        for match in matches:
            if match.group(1) != version:
                found.append(f"{name}:{line_of(text, match.start(1))}: {what} is {match.group(1)}, expected {version}")
    for name, keys, what in JSON_CHECKS:
        value = json.loads((ROOT / name).read_text(encoding="utf-8"))
        for key in keys:
            value = value.get(key) if isinstance(value, dict) else None
        if value != version:
            found.append(f"{name}: {what} is {value}, expected {version}")
    return found


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--tag", help="a release tag such as v0.8.0 that must match too")
    args = parser.parse_args()

    version = release_version()
    found = problems(version)
    if args.tag and args.tag != f"v{version}":
        found.insert(0, f"tag {args.tag} does not match {SOURCE} (v{version})")
    if found:
        print(f"Version mismatch (release version {version}):", file=sys.stderr)
        for item in found:
            print(f"  - {item}", file=sys.stderr)
        return 1
    print(f"All hard-coded versions are {version}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
