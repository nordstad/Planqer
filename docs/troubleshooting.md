# Troubleshooting

## "Blocked request. This host is not allowed"

The frontend dev server (Vite) rejects requests whose `Host` header it
doesn't recognize. This shows up when Planqer is served behind a reverse
proxy or a hostname other than `localhost`/`127.0.0.1`.

**Fix:** set `PLANQER_HOST` to the hostname you're serving on, then restart
the frontend container. See [Configuration](reference/configuration.md).

## Signed out after every restart

`SECRET_KEY` signs login sessions. If it isn't set, a random one is generated
per process, so every restart invalidates every existing session.

**Fix:** set `SECRET_KEY` to a fixed value in `.env` and keep it stable.

## I forgot my password

There is no self-service "forgot password" — Planqer doesn't send email. See
[Projects & accounts](guide/projects-and-accounts.md#there-is-no-self-service-forgot-password)
for the two supported recovery paths (another admin resets it, or
`create_admin.py set-password` from the host).

## "No board is long enough for the largest part"

Your longest required part is longer than every stock length you offered on
the [board cutting](guide/board-cutting.md) page. Add a longer stock length,
or split the part into two shorter ones with a joint.

## CORS errors calling the API from another origin

By default the API only allows the origins it ships with. Add yours via
`PLANQER_CORS_ORIGINS` (comma-separated) — see
[Configuration](reference/configuration.md).

## `429 Too Many Requests`

Optimization endpoints are rate limited per client IP (10/minute for
board/sheet optimization, lower for file uploads — see
[REST API](reference/api.md)). Wait a minute, or batch fewer requests.

## STL/STEP upload rejected or times out

- Files over 50 MB are rejected outright.
- STEP processing is intentionally rate-limited harder (3/minute) than STL,
  since it does more work per file.
- A model made of one fused solid won't split into separate parts — the
  optimizer needs distinct solids/bodies to tell parts apart.

## Docker container reports unhealthy

Check the backend logs and confirm `/health` responds directly:

```bash
docker exec planqer-web-backend curl -sf http://localhost:8002/health
```

If that succeeds but Docker still reports the container unhealthy, check
`docker inspect <container> --format '{{json .State.Health}}'` for the actual
failing check output.

## Port already in use

Planqer expects `3000` (frontend), `8002` (backend) free by default. If
something else is already listening, either stop it or change the port
mapping in `docker-compose.yml`.

## Still stuck

Open an issue with reproduction steps, the payload you sent (if relevant),
and your deployment shape (local, reverse-proxied, etc.).
