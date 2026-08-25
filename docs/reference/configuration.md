# Configuration

Localhost works with no configuration at all. Everything here is only needed
for a hosted, proxied, or otherwise non-default deployment.

Set variables in a `.env` file next to `docker-compose.yml`, or export them
before running `docker-compose up`.

## Backend

| Variable | Default | What it does |
| --- | --- | --- |
| `SECRET_KEY` | random per process | Signs login sessions. Set it explicitly and keep it stable across restarts, or every restart invalidates existing sessions. |
| `PLANQER_CORS_ORIGINS` | *(none)* | Comma-separated list of extra origins allowed to call the API, added to the built-in defaults. |
| `DATABASE_URL` | local SQLite file | Overrides the database location/engine. |

Other backend limits (max part/board length, rate limits, token expiry) live
in `backend/config.yaml`, not environment variables.

## Frontend

| Variable | Default | What it does |
| --- | --- | --- |
| `PLANQER_HOST` | *(none)* | The hostname you serve Planqer on. Vite's dev server refuses requests whose `Host` header it doesn't recognize; behind a reverse proxy on any hostname other than `localhost`/`127.0.0.1`, set this or requests get "Blocked request". |
| `VITE_API_URL` | inferred | Only needed when the API isn't reachable at the same origin as the app (proxied) or at port 8002 on the same host (direct). An origin, no path. |

## MCP server

| Variable | Default | What it does |
|---|---|---|
| `PLANQER_API_URL` | `http://localhost:8002/api` | Where the MCP server sends optimization requests. The Docker Compose file points this at the `backend` service on the compose network. |

## Example `.env`

```bash
# Backend
SECRET_KEY=<random-32-byte-hex>
PLANQER_CORS_ORIGINS=https://planqer.example.com,https://cuts.example.com

# Frontend
PLANQER_HOST=planqer.example.com
VITE_API_URL=https://planqer.example.com
```

Generate a `SECRET_KEY` with:

```bash
openssl rand -hex 32
```
