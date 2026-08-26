# Configuration

Localhost works with no configuration at all. Everything here is only needed
for a hosted, proxied, or otherwise non-default deployment.

Set variables in a `.env` file next to the compose files, or export them before
running Docker Compose.

Use `docker-compose.release.yml` for normal installs from published GHCR
images. Use `docker-compose.yml` when you want Docker to build local source
code.

## Compose files

- `docker-compose.release.yml`: recommended self-hosted install. Pulls pinned
  release images from GitHub Container Registry.
- `docker-compose.yml`: development/source install. Builds local Dockerfiles
  and bind-mounts frontend source.

## Backend

- `PLANQER_VERSION`: defaults to `0.2.0` in
  `docker-compose.release.yml`. Selects the release image tag to pull from
  GitHub Container Registry. Use a pinned release for reproducible installs.
- `SECRET_KEY`: defaults to a random value per process. Signs login sessions.
  Set it explicitly and keep it stable across restarts, or every restart
  invalidates existing sessions.
- `PLANQER_CORS_ORIGINS`: no default. Comma-separated list of extra origins
  allowed to call the API, added to the built-in defaults.
- `DATABASE_URL`: defaults to a local SQLite file. Overrides the database
  location/engine.

Other backend limits (max part/board length, rate limits, token expiry) live
in `backend/config.yaml`, not environment variables.

## Frontend

- `PLANQER_HOST`: no default. The hostname you serve Planqer on. Vite's dev
  server refuses requests whose `Host` header it doesn't recognize. Behind a
  reverse proxy on any hostname other than `localhost`/`127.0.0.1`, set this or
  requests get "Blocked request".
- `VITE_API_URL`: inferred by default. Only needed when the API is not
  reachable at the same origin as the app, or at port 8002 on the same host.
  Use an origin, no path.

## MCP server

- `PLANQER_API_URL`: defaults to `http://localhost:8002/api`. Where the MCP
  server sends optimization requests. The Docker Compose files point this at
  the `backend` service on the compose network.

## Example `.env`

```bash
# Backend
PLANQER_VERSION=0.2.0
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
