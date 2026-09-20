# Releasing

Planqer releases are published by pushing a semantic-version tag in the form
`vX.Y.Z`. The `Publish images` GitHub Actions workflow builds and publishes the
backend, frontend, and MCP server images to GHCR.

## Pre-release checks

Run all checks from a clean working tree before changing any version numbers.

### Backend

```bash
cd backend
uv sync --frozen
uv run ruff check .
uv run ruff format --check .
uv run pytest
```

The Ruff checks enforce linting and formatting. `pytest` is the backend unit
and API test suite.

### Frontend

```bash
cd frontend
npm ci
npm test
npm run build
```

### MCP server

```bash
cd mcp-server
npm ci
uv sync --frozen --group dev
npm run test:all
```

Do not continue with the release if any check fails.

## Version and tag

Update the release version consistently in:

- `backend/planqer/__init__.py`
- `backend/pyproject.toml`
- `backend/uv.lock`
- `frontend/package.json`
- `frontend/package-lock.json`
- `mcp-server/package.json`
- `mcp-server/package-lock.json`
- `mcp-server/pyproject.toml`
- `mcp-server/src/index.ts`
- `mcp-server/src/planqer_mcp_server/server.py`
- `mcp-server/uv.lock`

Then commit and push the tag:

```bash
git add backend frontend mcp-server
git commit -m "release: vX.Y.Z"
git tag vX.Y.Z
git push
git push origin vX.Y.Z
```

Pushing the tag triggers `.github/workflows/publish-images.yml`.

## GitHub Release

The tag and the GitHub Release are separate objects. Create the GitHub Release
after pushing the tag so it appears in the repository's Releases list:

```bash
gh release create vX.Y.Z --title "vX.Y.Z" --generate-notes
```

Verify the release and published image workflow before announcing the release:

```bash
gh release view vX.Y.Z
gh run list --workflow=publish-images.yml --limit=1
```
