# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Planqer is a self-hosted cutting optimization application that minimizes material waste when cutting boards to specific lengths. The project consists of three main components:

1. **Backend** (`/backend`) - FastAPI service with optimization algorithms
2. **Frontend** (`/frontend`) - React application for user interface  
3. **MCP Server** (`/mcp-server`) - Model Context Protocol server for AI assistant integration

## Development Commands

### Backend (Python/FastAPI)

Located in `/backend` directory:

```bash
# Install dependencies
uv sync

# Run tests
pytest

# Start development server
uvicorn planqer.api:app --reload --host 0.0.0.0 --port 8002
```

### Frontend (React/Vite)

Located in `/frontend` directory:

```bash
# Install dependencies
npm install

# Start development server
npm run dev     # or npm start

# Run unit tests
npm test

# Run E2E tests
npm run test:e2e

# Build for production
npm run build
```

### MCP Server (TypeScript/Python hybrid)

Located in `/mcp-server` directory:

```bash
# Install dependencies
uv sync

# Build TypeScript
npm run build

# Run server
uv run planqer-mcp-server

# Test with MCP Inspector
npx @modelcontextprotocol/inspector uv run planqer-mcp-server
```

### Docker Development

Run the full stack:

```bash
docker compose up -d --build
```

## Architecture

### Backend Architecture

- **Core Logic**: `/backend/planqer/` contains the optimization algorithms
- **API Layer**: `/backend/planqer/api.py` - FastAPI endpoints with rate limiting
- **Services**: `/backend/planqer/services.py` - Business logic orchestration
- **Cutting Logic**: `/backend/planqer/cutting.py` - Core optimization algorithms
- **Visualization**: `/backend/planqer/svg_visualization.py`, `sheet_visualization.py` - Generate cutting diagrams
- **Configuration**: `/backend/config.yaml` - Application settings

### Frontend Architecture

- **Router**: React Router with two main routes (`/` homepage, `/cutting` optimizer)
- **Components**:
  - `CuttingOptimizer.jsx` - Main optimization interface
  - `HomePage.jsx` - Landing page
  - `ResultDisplay.jsx` - Show optimization results and visualizations
  - `PartInputRow.jsx` / `BoardLengthRow.jsx` - Input components
- **API Integration**: `/frontend/src/utils/api.js` - Backend communication
- **Testing**: Component tests using React Testing Library + Jest
- **E2E Testing**: Playwright tests in `/frontend/tests/e2e/`

### MCP Server Architecture

- **Tools**: Four main tools for AI assistants:
  - `optimize_cutting` - Custom cutting optimization
  - `optimize_demo` - Pre-configured demos
  - `get_demo_payloads` - Sample data
  - `get_cutting_example` - API format examples
- **API Integration**: Connects to the backend at `PLANQER_API_URL`, defaulting
  to `http://localhost:8002/api` (both `src/index.ts` and
  `src/planqer_mcp_server/server.py`)
- **Response Formatting**: Formats optimization results for AI consumption

## API Endpoints

### Main Optimization Endpoint

- **POST** `/api/cutting-plans` - Generate optimal cutting plans
- **Rate Limited**: 10 requests per minute
- **Request Format**:

  ```json
  {
    "parts": {"270": 4, "179": 8, "90": 16, "81": 4},
    "available_board_lengths": [300, 360, 500],
    "saw_blade_width": 3,
    "project_name": "My Project"
  }
  ```

## Testing Strategy

### Backend Tests

- **Unit and API tests**: `pytest` runs the full suite — pure functions in `cutting.py`/`helpers.py`/`svg_visualization.py` alongside FastAPI endpoint tests using `TestClient`.
- **Location**: `/backend/tests/`
- **Run**: `pytest`

### Frontend Tests

- **Component Tests**: React Testing Library tests for all components
- **E2E Tests**: Playwright tests covering user workflows
- **Location**: `/frontend/src/components/*.test.jsx`, `/frontend/tests/e2e/`
- **Run**: `npm test` (unit), `npm run test:e2e` (E2E)

## Configuration Files

- **Backend**: `pyproject.toml` (Python deps), `config.yaml` (app settings)
- **Frontend**: `package.json` (Node deps), `vite.config.mjs` (build config)
- **MCP Server**: `package.json` (Node deps), `pyproject.toml` (Python deps), `tsconfig.json` (TypeScript)
- **Docker**: `docker-compose.yml`, individual `Dockerfile`s in each service

## Development Workflow

1. **Backend Changes**: Modify code in `/backend/planqer/`, run tests with `pytest`
2. **Frontend Changes**: Modify components in `/frontend/src/`, test with `npm test`
3. **Full Stack Testing**: Use `docker compose up -d --build` to test integration
4. **MCP Server Testing**: Use MCP Inspector for debugging AI tool interactions

## Key Algorithms

The core optimization logic is in `/backend/planqer/cutting.py` with the main function `min_boards_required_with_cut_list()`. This implements a cutting stock problem solver that:

- Minimizes the number of boards needed
- Accounts for saw blade kerf (material loss)
- Generates visual cutting diagrams
- Provides detailed waste calculations

## Conventions

- Use `uv` instead of `pip` for Python dependency management.
- Use Pytest for unit tests, written as functions, not classes.
- Always lint markdown to remove lint warnings.
- Don't import `Dict`, `List`, `Tuple` from `typing` — use the built-in
  `dict`, `list`, `tuple` generics instead.
