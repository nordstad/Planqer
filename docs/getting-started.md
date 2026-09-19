# Getting started

Planqer is officially supported via Docker Compose. The recommended install
uses published release images from GitHub Container Registry, so Docker does
not need to build the frontend, backend, or MCP server locally. Running from
source is a contributor path — see [Contributing](contributing.md) if that's
what you want.

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/)
- [Docker Compose](https://docs.docker.com/compose/install/) (bundled with
  Docker Desktop)

## Run it

```bash
git clone https://github.com/nordstad/Planqer.git
cd planqer
docker compose -f docker-compose.release.yml up -d
```

Open:

- Frontend: <http://localhost:3001>
- Backend API docs (Swagger UI): <http://localhost:8002/docs>
- Health check: <http://localhost:8002/health>

!!! note "First account is the admin"
    The first account you register on a fresh instance becomes its admin.
    Every account is **local to that instance** — there is no cloud tier, and
    accounts never leave your own server.

!!! note "Backups"
    Saved projects and local accounts live in the backend data volume. Create
    a live-safe backup with
    `docker compose -f docker-compose.release.yml exec backend planqer backup`;
    see [Backup and restore](guide/backup-and-restore.md) before restoring one.

!!! note "Release image version"
    The release compose file uses `latest` by default. Set
    `PLANQER_VERSION` in `.env` to pin a specific release image.

## Upgrade

Run these commands from the directory containing `docker-compose.release.yml`
and `.env`:

```bash
docker compose -f docker-compose.release.yml pull
docker compose -f docker-compose.release.yml up -d
```

To pin a release, set the version in `.env` before running the commands:

```dotenv
PLANQER_VERSION=0.4.1
```

Verify that the running containers use the requested images:

```bash
docker compose -f docker-compose.release.yml ps
docker inspect planqer-web-backend --format '{{.Config.Image}}'
```

The output should include `ghcr.io/nordstad/planqer-backend:0.4.1` (and the
corresponding frontend tag). The named `backend_data` volume is preserved by
this procedure, so local accounts and saved projects remain available.

## Private package access

GitHub Container Registry packages can be private. If `docker compose` cannot
pull the images anonymously, either make the Planqer packages public in GitHub
Packages or log in before starting the stack:

```bash
echo <github-token> | docker login ghcr.io -u <github-username> --password-stdin
```

## Build from source

Use the source-build compose file when contributing or testing local code
changes:

```bash
docker compose up -d --build
```

The MCP server is optional and is not built or started by default. Enable it
when you need a containerized MCP client:

```bash
docker compose --profile mcp up -d --build
```

For the published images, use the same profile with the release Compose file:

```bash
docker compose -f docker-compose.release.yml --profile mcp up -d
```

## Plan your first cut

1. Open <http://localhost:3001> and choose **Board cutting**, **Sheet cutting**,
   **Tile layout**, or **3D model**.
2. Sign in or create a local account when prompted. The optimizer pages,
   model uploads, and saving a plan require a local account.
3. Enter your parts, surface and tile dimensions, or upload a model. Add stock
   lengths, sheet size, openings, or tile layout options as appropriate.
4. Run the plan and read the boards/sheets-required figure.
5. Download the diagram, or name and save the plan to your dashboard.

![Board cutting result](assets/screenshots/board-cutting-result.png)

## Configuration for a real deployment

Running on `localhost` needs no configuration. If you're putting Planqer
behind a reverse proxy or a real hostname, see
[Configuration](reference/configuration.md) — in particular `PLANQER_HOST`,
which the frontend's dev server requires or it will refuse requests with a
"Blocked request" error.

## Next steps

- [Board cutting](guide/board-cutting.md) — 1D parts from boards, lumber, pipe.
- [Sheet cutting](guide/sheet-cutting.md) — 2D parts nested on sheet stock.
- [Tile layout](guide/tile-layout.md) — rectangular tile patterns on a surface.
- [3D model / STEP cutlists](guide/model-cutlist.md) — start from a model
  instead of typing a part list.
- [Backup and restore](guide/backup-and-restore.md) — protect saved projects
  and local accounts.
- [MCP server](guide/mcp-server.md) — drive the optimizer from an AI assistant.
