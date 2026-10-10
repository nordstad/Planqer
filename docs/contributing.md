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

## Contributing catalogue data

The built-in product catalogue (`backend/planqer/catalogue/data/<country>.yaml`)
grows through suggestions. If your instance is missing a product:

1. Add it for your own instance first: **Admin → Catalogue → Add product**.
2. Choose **Suggest to Planqer** on that row, enter a source URL and the
   two-letter country code, and press **Prepare issue**. This builds a
   pre-filled issue from the *Catalogue product* template with the country, the
   product, the source and a YAML snippet.
3. Review the snippet, then open the issue on GitHub and submit it.

No catalogue data is sent to the Planqer project automatically; the issue only
exists if you open and submit it. The snippet is one product group, in exactly
the shape of the data files (`ProductGroup` in
`backend/planqer/catalogue/schema.py`), so a maintainer can paste it into the
country file.

Entries must cite a manufacturer, standards or industry source (for example
TräGuiden, Svenskt Trä or a manufacturer data sheet), never a retailer page, and
carry no prices. Detail keys must exist in `details.yaml` and every label needs
English, Swedish and Norwegian text. Species, treatment and profile options may
list `aliases` (other names as they appear in CAD material fields); an alias must
not name two different options, and the tests check that.

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
