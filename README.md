# Planqer

Planqer is a self-hosted cutting optimization platform for woodworking and fabrication projects.
It turns part lists or CAD files (STL/STEP) into practical, kerf-aware cutting plans with visual diagrams and local project storage.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Docker Compose](https://img.shields.io/badge/Docker%20Compose-supported-2496ED.svg)](docker-compose.yml)
[![Python](https://img.shields.io/badge/Python-3.12-blue.svg)](backend/pyproject.toml)
[![React](https://img.shields.io/badge/React-19-61DAFB.svg)](frontend/package.json)

---

## Features

- **1D Board & 2D Sheet Cutting**: Kerf compensation, part rotation, and waste efficiency calculations.
- **CAD File Support**: Upload STL or STEP files to automatically generate cutlists.
- **Self-Hosted & Private**: Local accounts and data stay entirely on your server.
- **AI Assistant Integration**: Includes an MCP (Model Context Protocol) server for Claude Desktop and compatible clients.

---

## Quick Start

The easiest way to run Planqer is with Docker Compose:

```bash
git clone https://github.com/nordstad/Planqer.git
cd planqer
docker compose up -d --build
```

Once started, open:

- **Frontend**: <http://localhost:3001>
- **Backend API Docs**: <http://localhost:8002/docs>
- **Health Check**: <http://localhost:8002/health>

*Note: The first account created on a fresh instance becomes the administrator.*

---

## Documentation

Detailed guides, configuration options, API references, and MCP server setup instructions are available in the documentation site.

📖 **[Read the Documentation](https://nordstad.github.io/Planqer/)**

> **Note**: The GitHub Pages documentation link above will be live once the repository is made public. To preview the docs locally:
>
> ```bash
> pip install -r docs/requirements.txt
> mkdocs serve
> ```

---

## License

[MIT](LICENSE)
docker compose up -d --build

```
<<<<<<< HEAD

Open:

- Frontend: <http://localhost:3001>
- Backend API docs: <http://localhost:8002/docs>
- Health endpoint: <http://localhost:8002/health>

Notes:

- The first account created becomes admin for that instance.
- Data is persisted in the Docker volume `backend_data`.
=======
>>>>>>> 9d2f3da (docs: simplify README and disable docs workflow until repo is public)

Once started, open:

- **Frontend**: <http://localhost:3001>
- **Backend API Docs**: <http://localhost:8002/docs>
- **Health Check**: <http://localhost:8002/health>

*Note: The first account created on a fresh instance becomes the administrator.*

---

## Documentation

Detailed guides, configuration options, API references, and MCP server setup instructions are available in the documentation site.

📖 **[Read the Documentation](https://nordstad.github.io/Planqer/)**

> **Note**: The GitHub Pages documentation link above will be live once the repository is made public. To preview the docs locally:
>
> ```bash
> pip install -r docs/requirements.txt
> mkdocs serve
> ```

---

## License

<<<<<<< HEAD
### 1D board cutting

`POST /api/cutting-plans`

```json
{
  "parts": {"270": 4, "179": 8, "90": 16, "81": 4},
  "available_board_lengths": [300, 360, 500],
  "saw_blade_width": 3,
  "project_name": "Kitchen Shelves"
}
```

### 2D sheet optimization

`POST /api/sheet-optimization`

```json
{
  "parts": [
    {"width": 800, "height": 400, "quantity": 2, "name": "Top"},
    {"width": 300, "height": 400, "quantity": 4, "name": "Leg"}
  ],
  "sheet_width": 1220,
  "sheet_height": 2440,
  "kerf_width": 3,
  "allow_rotation": true,
  "project_name": "Dining Table"
}
```

### CAD cutlists

- `POST /api/3d-cutlist` for STL uploads.
- `POST /api/step-cutlist` for STEP/STP uploads.

## MCP Server (AI Integration)

Planqer includes an MCP server in `mcp-server/` with tools such as:

- `optimize_cutting`
- `optimize_demo`
- `get_demo_payloads`
- `get_cutting_example`

### Claude Desktop example

```json
{
  "mcpServers": {
    "planqer-cutting-optimizer": {
      "command": "uv",
      "args": [
        "--directory",
        "/path/to/planqer/mcp-server",
        "run",
        "planqer-mcp-server"
      ]
    }
  }
}
```

## Development Setup

Use this only if you want to contribute or run services directly from source.

### Backend (development)

```bash
cd backend
uv sync
uv run pytest
uv run uvicorn planqer.api:app --reload --host 0.0.0.0 --port 8002
```

### Frontend (development)

```bash
cd frontend
npm install
npm run dev
npm run build
npm test
npm run test:e2e
```

### MCP server

```bash
cd mcp-server
uv sync
npm install
npm run build
uv run planqer-mcp-server
```

### Documentation site

```bash
pip install -r docs/requirements.txt
mkdocs serve
```

Deployed automatically to GitHub Pages on push to `main` (see
`.github/workflows/docs.yml`).

## Testing

### Backend tests

```bash
cd backend
uv run pytest
uv run pytest --cov=planqer
```

### Frontend tests

```bash
cd frontend
npm run test:e2e
```

### API health

```bash
curl <http://localhost:8002/health>
```

## Project Structure

```text
planqer/
  backend/        FastAPI app, optimization logic, tests
  frontend/       React app, UI components, e2e tests
=======
[MIT](LICENSE)
>>>>>>> 9d2f3da (docs: simplify README and disable docs workflow until repo is public)
  mcp-server/     MCP integration for AI assistants
  docs/           MkDocs Material documentation site (mkdocs.yml at the repo root)
  docker-compose.yml

```

## Contributing

Contributions are welcome.

### Typical workflow

1. Fork the repository.
2. Create a feature branch.
3. Add or update tests with your change.
4. Run relevant test suites.
5. Open a pull request with a clear description.

### Contribution expectations

- Keep changes scoped and focused.
- Follow existing project style and patterns.
- Update documentation when behavior changes.
- Prefer factual claims backed by tests or reproducible runs.

## Security

If you discover a security issue, please open a private report if possible
before public disclosure.

## License

MIT License. See [LICENSE](LICENSE).

## Support

- Open an issue for bugs or feature requests.
- Include reproduction steps, payload samples, and environment details when relevant.
