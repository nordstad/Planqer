# Planqer contributor guide

Planqer is a self-hosted cutting-optimisation application for boards, sheets,
tiles, wallpaper, and 3D-model cutlists. It has a FastAPI backend, React/Vite
frontend, and MCP server.

## Commands

Run commands from the relevant directory.

### Backend (`backend/`)

```bash
uv sync
pytest
uvicorn planqer.api:app --reload --host 0.0.0.0 --port 8002
```

### Frontend (`frontend/`)

```bash
npm install
npm run dev
npm test
npm run test:e2e
npm run build
```

### MCP server (`mcp-server/`)

```bash
uv sync
npm run build
uv run planqer-mcp-server
npx @modelcontextprotocol/inspector uv run planqer-mcp-server
```

## Docker development

`localhost:3001` (frontend) and `localhost:8002` (backend) may be long-lived
containers. Do not assume they match the checkout or start another local server
on those ports.

```bash
docker compose up -d --build
```

Before asking someone to test:

- Changes to `frontend/package.json`, lock/config files, or files outside
  `frontend/src/` and `frontend/public/`: run
  `docker compose up -d --build frontend`.
- Any backend code, configuration, migrations, or dependencies: run
  `docker compose up -d --build backend`.
- Changes only under `frontend/src/` or `frontend/public/`: Vite hot-reloads.

The frontend container serves the checked-out branch. Rebuilding preserves the
`backend_data` volume. Verify the relevant page and container health, then ask
the user to hard-refresh (`⌘⇧R`). A Vite `Failed to resolve import` error from
`/app/node_modules` usually means the frontend image is stale.

## Architecture at a glance

- Backend logic: `backend/planqer/`; HTTP API: `backend/planqer/api.py`.
- Cutting solver: `backend/planqer/cutting.py`; diagrams:
  `svg_visualization.py` and `sheet_visualization.py`.
- Frontend routes and components: `frontend/src/`; API client:
  `frontend/src/utils/api.js`.
- Frontend unit tests: `frontend/src/**/*.test.{js,jsx}`; E2E:
  `frontend/tests/e2e/`.
- MCP tools connect to `PLANQER_API_URL`, defaulting to
  `http://localhost:8002/api`.

## Conventions

- Use `uv`, not `pip`, for Python dependencies.
- Write backend tests as Pytest functions, not classes.
- Update every locale when adding or changing translation keys; do not rely on
  English fallbacks.
- Lint Markdown after changing it. Existing lint debt should not be extended.
- For every user-visible frontend change, review `frontend/DESIGN.md`. Update
  it in the same change when design-system, interaction, or intentional-
  exception rules change.
- Use built-in `dict`, `list`, and `tuple` generics, not `Dict`, `List`, or
  `Tuple` from `typing`.
- This repository is hosted on GitHub: use `gh` for pull requests, issues, and
  releases.

## Further reading

- API contract: [`docs/reference/api.md`](docs/reference/api.md)
- User and feature guides: [`docs/guide/`](docs/guide/)
- Configuration: [`docs/reference/configuration.md`](docs/reference/configuration.md)
- Frontend design system: [`frontend/DESIGN.md`](frontend/DESIGN.md)
- Release process: [`docs/releasing.md`](docs/releasing.md)

Read the linked document when the task concerns that area; do not duplicate its
reference material here.
