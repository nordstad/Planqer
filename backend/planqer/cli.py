"""Command line tools for operating a Planqer instance."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import NoReturn

from planqer.backup import BackupError, create_backup, restore_backup


def main(argv: list[str] | None = None) -> int:
    parser = _build_parser()
    args = parser.parse_args(argv)

    try:
        if args.command == "backup":
            result = create_backup(database_url=args.database_url, output_dir=args.output_dir)
            print(f"Created backup: {result.archive_path}")
            return 0
        if args.command == "restore":
            result = restore_backup(
                args.archive,
                database_url=args.database_url,
                force=args.force,
                offline_confirmed=args.offline_confirmed,
            )
            print(f"Restored database: {result.database_path}")
            if result.safety_copy_path is not None:
                print(f"Pre-restore safety copy: {result.safety_copy_path}")
            return 0
    except BackupError as error:
        print(f"Error: {error}", file=sys.stderr)
        return 1

    _unreachable(args.command)


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="planqer", description="Operate a Planqer instance.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    backup_parser = subparsers.add_parser("backup", help="Create a backup archive for the local SQLite database.")
    backup_parser.add_argument(
        "--database-url",
        help="SQLite database URL. Defaults to DATABASE_URL, then backend/config.yaml, then ./data/planqer.db.",
    )
    backup_parser.add_argument(
        "--output-dir",
        type=Path,
        help="Directory for the backup archive. Defaults to a backups directory next to the database.",
    )

    restore_parser = subparsers.add_parser("restore", help="Restore a backup archive over the local SQLite database.")
    restore_parser.add_argument("archive", type=Path, help="Backup archive created by planqer backup.")
    restore_parser.add_argument(
        "--database-url",
        help="SQLite database URL. Defaults to DATABASE_URL, then backend/config.yaml, then ./data/planqer.db.",
    )
    restore_parser.add_argument(
        "--force",
        action="store_true",
        help="Allow replacing an existing database. A pre-restore safety copy is created first.",
    )
    restore_parser.add_argument(
        "--offline-confirmed",
        action="store_true",
        help="Confirm the backend is stopped before replacing the SQLite database.",
    )

    return parser


def _unreachable(command: str | None) -> NoReturn:
    raise RuntimeError(f"Unhandled command: {command}")


if __name__ == "__main__":
    raise SystemExit(main())
