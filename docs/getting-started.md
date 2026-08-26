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
git clone https://github.com/borkempire/planqer.git
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

!!! note "Release image version"
    The release compose file uses `PLANQER_VERSION=0.1.0` by default. Set
    `PLANQER_VERSION=latest` only if you intentionally want the newest
    published release image.

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

## Plan your first cut

1. Open <http://localhost:3001> and choose **Board cutting**, **Sheet
   cutting**, or **3D model**.
2. Sign in or create a local account when prompted — planning and saving a
   cutlist needs one, but you can browse the homepage and upload a model
   without one.
3. Enter your parts (or upload a model) and your available stock lengths or
   sheet size.
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
- [3D model / STEP cutlists](guide/model-cutlist.md) — start from a model
  instead of typing a part list.
- [MCP server](guide/mcp-server.md) — drive the optimizer from an AI assistant.
