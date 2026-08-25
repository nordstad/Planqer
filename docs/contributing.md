# Contributing

Docker Compose is the only supported way to *run* Planqer, but contributing
means running the services from source.

## Backend (Python/FastAPI)

```bash
cd backend
uv sync
uv run pytest
uv run uvicorn planqer.api:app --reload --host 0.0.0.0 --port 8002
```

## Frontend (React/Vite)

```bash
cd frontend
npm install
npm run dev
npm run build
npm test
npm run test:e2e
```

`npm test` runs the Jest/React Testing Library component tests in
`src/**/*.test.jsx`. `npm run test:e2e` (Playwright) covers full user flows
against a running instance.

## MCP server

```bash
cd mcp-server
uv sync
npm install
npm run build
uv run planqer-mcp-server
```

## Docs (this site)

```bash
pip install -r docs/requirements.txt
mkdocs serve
```

## Conventions

- Use `uv` instead of `pip` for Python dependency management.
- Write backend tests as Pytest functions, not classes.
- Don't import `Dict`, `List`, `Tuple` from `typing` — use the built-in
  `dict`, `list`, `tuple` generics instead.
- Millimetres only; no imperial units.

## Workflow

1. Fork the repository.
2. Create a feature branch.
3. Add or update tests with your change.
4. Run the relevant test suite(s) above.
5. Open a pull request with a clear description.

## Security

If you discover a security issue, please open a private report if possible
before public disclosure.
