# Configuration

Localhost works with no configuration at all. Everything here is only needed
for a hosted, proxied, or otherwise non-default deployment.

Set variables in a `.env` file next to the compose files, or export them before
running Docker Compose. Copy [`.env.example`](https://github.com/nordstad/Planqer/blob/main/.env.example)
to `.env` as a starting point.

Changed `.env` after containers already exist? A plain restart won't pick it
up - env vars are only applied when a container is created. For a release
installation, pull the selected images and recreate them:

```bash
docker compose -f docker-compose.release.yml pull
docker compose -f docker-compose.release.yml up -d --force-recreate
```

Use `docker-compose.release.yml` for normal installs from published GHCR
images. Use `docker-compose.yml` when you want Docker to build local source
code.

The backend data volume is Compose-project scoped. Keep the same project
directory and project name across upgrades, or set an explicit project name
with `docker compose -p <name> ...`; otherwise Compose can select a new
`<project>_backend_data` volume and the instance will appear to have lost its
accounts and saved projects.

## Compose files

- `docker-compose.simple.yml`: simple install for one person on one computer.
  Single-user mode, no accounts, reachable only from that computer, nothing to
  configure. Uses the same release images and data volume as the advanced
  install.
- `docker-compose.release.yml`: advanced self-hosted install, with accounts,
  LAN and reverse-proxy support. Pulls pinned release images from GitHub
  Container Registry.
- `docker-compose.yml`: development/source install. Builds local Dockerfiles
  and bind-mounts frontend source.

## Backend

- `PLANQER_VERSION`: defaults to `latest` in
  `docker-compose.release.yml`. Selects the release image tag to pull from
  GitHub Container Registry. Pin it (e.g. `0.10.0`) for reproducible installs.
- `SECRET_KEY`: optional explicit signing key for login sessions. When omitted,
  Planqer generates a cryptographically random key and persists it at
  `data/.secret_key` inside the persistent backend data volume. The generated
  key survives container recreation as long as that volume is retained. Set
  `SECRET_KEY` explicitly for multiple backend replicas, externally managed
  secrets, or deployments where replicas do not share a data volume. Explicit
  values are never written to the generated key file. The application backup
  archive contains the database only, not `data/.secret_key`; retain the data
  volume or configure an explicit key when restoring elsewhere.
- `PLANQER_BIND_ADDRESS`: defaults to `127.0.0.1`, so a new instance is only
  reachable from its own host. Set `0.0.0.0` only for LAN or reverse-proxy
  deployments.
- `PLANQER_SINGLE_USER`: defaults to off. Set to `true` to remove accounts and
  sign-in: everyone who can reach the app is its owner, shown as **My
  projects**. Registration is disabled and the admin page shows only the
  catalogue. `docker-compose.simple.yml` sets it. Accounts already in the data
  volume are kept and used again if you turn it off.
- `PLANQER_ALLOW_OPEN_LAN`: only for `PLANQER_SINGLE_USER=true`. Planqer
  refuses to start when `PLANQER_BIND_ADDRESS` is not a loopback address,
  because anyone on the network could then read and change your projects. Set
  to `true` to accept that, for example on a network you fully trust.
- `PLANQER_TRUSTED_BOOTSTRAP`: defaults to `true` with the default loopback
  binding, allowing the first browser account to become administrator. Set it
  to `false` before exposing the instance.
- `PLANQER_SETUP_SECRET`: required to claim the first administrator after
  `PLANQER_TRUSTED_BOOTSTRAP=false`. Enter it in the first-run form's Setup
  code field. The secret is accepted only for the first account and should be
  removed after setup.
- `PLANQER_CORS_ORIGINS`: no default. Comma-separated list of extra origins
  allowed to call the API, added to the built-in defaults.
- `DATABASE_URL`: defaults to a local SQLite file. Overrides the database
  location/engine.

- `PLANQER_CATALOGUE_COUNTRY`: optional, no default. `SE` (Sweden) or `NO`
  (Norway). The catalogue used by anyone who hasn't chosen one and whose
  language and browser don't point to a country; leave it empty for the generic
  catalogue (product types and details, no sized entries). It is only a
  default: every user picks their own catalogue in the product picker or under
  **Defaults → Product catalogue**, and *Automatic* follows their language
  (Svenska: Sweden, Norsk bokmål: Norway) or an `en-SE`-style browser locale.
  New accounts also start with this country's currency and VAT (SEK or NOK,
  25 %); existing accounts keep their own. See
  [Product catalogue](#product-catalogue).

Other backend limits (rate limits, token expiry) live in `backend/config.yaml`,
not environment variables. Board and part lengths are limited to 15 000 mm and
sheet sides to 10 000 mm in code.

## Product catalogue

The catalogue suggests products, sizes and standard stock lengths in the product
picker. It holds no prices; those stay on your instance, per plan.

`SE` (Sweden) and `NO` (Norway) ship today, each with boards and building
sheets. Every entry cites its source: for Sweden TräGuiden, Svenskt Trä's
*Lathunden* and manufacturer data sheets; for Norway Skogmo Bruk, Moelven and
Norgips product data. Norwegian timber is dimensioned 48 × 98 mm and so on, so a
model measured at 45 × 95 mm is not matched to a Norwegian entry. Hardboard,
round dowels and stair stringers have no verified Norwegian entries. Standard
lengths are suggestions: In Sweden Svenskt Trä states that
structural timber over 5 400 mm is usually finger-jointed and glulam is normally
stocked to 12 m, but publishes no length list, so the 1 800, 2 100 and
2 400–5 400 mm (300 mm steps) set is a working assumption. Norwegian lengths come
from Moelven's stated fixed lengths. Data files live in
`backend/planqer/catalogue/data/`.

### Changing the catalogue for your instance

Admins can adjust the catalogue without touching those files: **Admin →
Catalogue** lists every product the picker offers for the catalogue country
chosen at the top of the page (the same choice as in the picker), built-in and
local, with a search and filters. From there an admin can

- **add** a product that is missing (type, size, stock lengths, details and an
  optional source);
- **edit** the lengths, sheet formats, details and sources of any entry. Editing
  a built-in stores an override; **Revert** returns it to the shipped data;
- **hide** an entry that doesn't apply to you and **restore** it later.

A product someone typed in their own words in the product picker can be kept
with **Save to local catalogue** (admins only): pick the type and size and the
words become the entry's note.

These changes live in your instance's database, so they are included in
[backups](../guide/backup-and-restore.md) and survive upgrades. Saved plans keep
their own copy of the product, so changing or hiding an entry never alters an
old plan. Local entries are checked by the same rules as the built-in data
(known types and details, https sources, 15 000 mm board length limit, 10 000 mm
sheet limit).

To share a product with every Planqer user, see
[Contributing catalogue data](../contributing.md#contributing-catalogue-data).

## Frontend

- `PLANQER_HOST`: no default. The hostname you serve Planqer on. Vite's dev
  server refuses requests whose `Host` header it doesn't recognize. Behind a
  reverse proxy on any hostname other than `localhost`/`127.0.0.1`, set this or
  requests get "Blocked request".
- `VITE_API_URL`: inferred by default. Only needed when the API is not
  reachable at the same origin as the app, or at port 8002 on the same host.
  Use an origin, no path. If you publish the frontend on a different host port
  than 3001, set this explicitly to the backend origin, such as
  `http://192.168.1.50:8002`.

## MCP server

The MCP service is optional in `docker-compose.yml` and
`docker-compose.release.yml`; the simple install does not include it. Enable it with the `mcp`
profile when using a containerized MCP client:

```bash
docker compose --profile mcp up -d
```

- `PLANQER_API_URL`: defaults to `http://localhost:8002/api`. Where the MCP
  server sends optimization requests. The Docker Compose files point this at
  the `backend` service on the compose network.

## Example `.env`

```bash
# Backend
PLANQER_VERSION=0.10.0
# Optional when using a single backend with the persistent data volume.
SECRET_KEY=<random-32-byte-hex>
PLANQER_SETUP_SECRET=<random-32-byte-hex>
PLANQER_BIND_ADDRESS=0.0.0.0
PLANQER_TRUSTED_BOOTSTRAP=false
PLANQER_CORS_ORIGINS=https://planqer.example.com,https://cuts.example.com
PLANQER_CATALOGUE_COUNTRY=SE

# Frontend
PLANQER_HOST=planqer.example.com
VITE_API_URL=https://planqer.example.com
```

If you need an explicit `SECRET_KEY`, generate it with:

```bash
openssl rand -hex 32
```
