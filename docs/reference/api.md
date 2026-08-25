# REST API

The backend is a FastAPI service with interactive, always-current docs at
`/docs` (Swagger UI) and `/redoc` on your own instance — for example
`http://localhost:8002/docs`. This page is a map of what's there, not a full
copy of it.

Base path when accessed through the app or a reverse proxy: `/api`.

## Optimization

| Endpoint | Purpose |
| --- | --- |
| `POST /api/cutting-plans` | 1D board cutting. Rate limited: 10/minute. |
| `POST /api/sheet-optimization` | 2D sheet packing. Rate limited: 10/minute. |
| `POST /api/3d-cutlist` | Upload an STL file, get a cutlist. Rate limited: 5/minute. |
| `POST /api/step-cutlist` | Upload a STEP/STP file, get a cutlist with names/materials. Rate limited: 3/minute. |
| `GET /algorithms` | List available 1D optimization algorithms. |
| `GET /sheet-algorithms` | List available 2D packing strategies. |

### Example: board cutting

```json
POST /api/cutting-plans
{
  "parts": {"270": 4, "179": 8, "90": 16, "81": 4},
  "available_board_lengths": [300, 360, 500],
  "saw_blade_width": 3,
  "project_name": "Kitchen Shelves"
}
```

### Example: sheet optimization

```json
POST /api/sheet-optimization
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

## Accounts and projects

Registration, login, saved projects, project groups, and the admin
endpoints are all namespaced under their own routers (`/auth`, `/settings`,
`/projects`, `/sheet-projects`, `/project-groups`, `/admin`) — see `/docs`
for the full request/response schemas, since these are session-authenticated
and change more often than the optimization endpoints.

## Operational endpoints

| Endpoint | Purpose |
| --- | --- |
| `GET /health` | Health check, used by the Docker healthcheck. |
| `GET /metrics` | Prometheus metrics. |
| `GET /cache/info` | Optimization cache statistics. |
| `POST /cache/clear` | Clear the optimization cache. |

## Limits

- Part/board length: up to 6000 mm (see `backend/config.yaml`).
- Up to 1000 parts per request, 1000 quantity per part.
- Rate limits are per-endpoint (noted above) and apply per client IP.
