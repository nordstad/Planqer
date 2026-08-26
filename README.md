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
