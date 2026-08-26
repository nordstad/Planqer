# Backup and restore

Planqer stores local accounts and saved projects in the backend SQLite
database. In Docker Compose installs, that file lives in the persistent
`backend_data` volume at `/app/backend/data/planqer.db`.

## Create a backup

Run the backup command while the stack is running. For the recommended release
compose file:

```bash
docker compose -f docker-compose.release.yml exec backend planqer backup
```

For a source-build checkout using `docker-compose.yml`:

```bash
docker compose exec backend planqer backup
```

The command writes a timestamped archive next to the database:

```text
/app/backend/data/backups/planqer-backup-2026-08-26T211530Z.tar.gz
```

Backups are created with SQLite's online backup API, so the database is copied
consistently even when Planqer is running.

## Copy a backup off the server

Keep at least one copy outside the Docker volume:

```bash
BACKUP=planqer-backup-2026-08-26T211530Z.tar.gz
docker cp planqer-web-backend:/app/backend/data/backups/$BACKUP .
```

## Restore a backup

Restoring replaces the current local accounts and saved projects. Stop the
backend first so the running API does not hold open connections to the file:

```bash
docker compose -f docker-compose.release.yml stop backend
docker compose -f docker-compose.release.yml run --rm backend \
  planqer restore \
  /app/backend/data/backups/planqer-backup-2026-08-26T211530Z.tar.gz \
  --force \
  --offline-confirmed
docker compose -f docker-compose.release.yml up -d backend
```

`--force` is required when a database already exists. `--offline-confirmed`
confirms you stopped the backend before replacing the SQLite file. Before
replacing it, Planqer creates a pre-restore safety copy under:

```text
/app/backend/data/backups/pre-restore/
```

## Archive format

Each backup archive contains:

- `manifest.json`: backup metadata, including the Planqer version, backup
  format version, SQLite checksum, and Alembic revision.
- `planqer.db`: the backed-up SQLite database.

The restore command validates the archive format, checksum, and SQLite
integrity before replacing the database.

## Non-default database paths

If you override `DATABASE_URL`, pass the same URL to the command:

```bash
docker compose -f docker-compose.release.yml exec backend \
  planqer backup \
  --database-url sqlite+aiosqlite:////app/backend/data/planqer.db
```

Only SQLite databases are supported by the built-in backup command.
