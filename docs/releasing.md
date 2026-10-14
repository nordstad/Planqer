# Releasing

Planqer releases are published by pushing a semantic-version tag in the form
`vX.Y.Z`. The `Publish images` GitHub Actions workflow builds and publishes the
backend, frontend, and MCP server images to GHCR. The same tag also updates the
GitHub Pages site: the docs, and the browser demo built from that tag (see
[The Pages site](#the-pages-site)).

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

### Browser demo

```bash
python3 scripts/build-demo.py --check-budget
cd frontend
npx playwright install chromium firefox webkit   # once
npm run test:demo
npm run test:parity
npm run test:runtime-browser
npm run test:analytics
```

The first command builds the demo as GitHub Pages serves it and fails if a
runtime file is missing, the bundled Python is a different version from the
app, or the demo has grown past its size budget. `test:demo` runs it in three
browser engines. The `Static demo CI` workflow runs the same checks on every
pull request that touches the app, the Python it runs, or the scripts.

If the size budget fails because of a change you meant to make, raise the
limit in `BUDGET_KB` in `scripts/build-demo.py` in the same pull request.

`test:analytics` builds the app with the Umami website id and checks, in
Chromium with the tracker stood in for, that only allow-listed events are sent
and nothing is sent after an opt-out or with Do Not Track. Run
`npm run test:runtime-browser` on a Mac before a release: Playwright's Linux
WebKit cannot load scipy, so CI leaves out the STL import there.

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

The demo shows the version from `frontend/package.json` in its footer, and the
Python it runs is stamped with `backend/planqer/__init__.py`.
`scripts/build-demo.py` fails if the two differ, so the demo cannot ship a
mismatched pair.

The same version is also written in the documentation's examples, which users
copy to pin a release. Update these too:

- `docs/getting-started.md` (`PLANQER_VERSION` and the image tag)
- `docs/reference/configuration.md` (the example `.env`)
- `docs/guide/mcp-server.md` (the MCP runtimes' version)
- `README.md` (`PLANQER_VERSION` in the upgrade instructions)
- `.env.example` (the example version in the comment)

Then check that nothing was missed. The script reads the version from
`backend/planqer/__init__.py` and reports every place that disagrees, with its
line:

```bash
python3 scripts/check-versions.py --tag vX.Y.Z
```

It also runs in the backend tests, and the `Publish images` workflow runs it
against the pushed tag first, so a tag that doesn't match the files publishes
nothing. If you add a new place that states the version, add it to
`scripts/check-versions.py` and to the list above.

Then commit and push the tag:

```bash
git add backend frontend mcp-server
git commit -m "release: vX.Y.Z"
git tag vX.Y.Z
git push
git push origin vX.Y.Z
```

Pushing the tag triggers `.github/workflows/publish-images.yml` and
`.github/workflows/pages.yml`.

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

## The Pages site

`https://nordstad.github.io/Planqer/` is one site with one publisher
(`.github/workflows/pages.yml`):

- the docs are at the root;
- the browser demo is at `/app/`.

Every deploy replaces the whole site, so both are always built and published
together. The workflow has three jobs: `docs` (MkDocs, as before), `app` (the
demo) and `deploy`.

When it runs:

- Push of a `vX.Y.Z` tag: docs and demo are rebuilt and published. This is the
  update on release, with no extra step.
- Merge to `main` touching `docs/**`, `mkdocs.yml` or the workflow: the docs are
  rebuilt. The demo is reused from the latest release tag, so unreleased app
  code is never published.
- Manual run (`workflow_dispatch`): rebuilds both. Also the way to roll back.
- Pull request: nothing is deployed.

If the demo build fails, the run fails and nothing is deployed, so the live
site is never replaced by a half-built one. A release tag that predates the
demo has no `scripts/build-demo.py`; the workflow then publishes the docs alone.

### Analytics on the demo

Only this workflow builds the demo with `VITE_PLANQER_UMAMI_ID` (the public
Umami website id), so only the published demo counts visits. CI builds and the
Docker images have no id and contain no analytics, which
`scripts/check-no-demo-code.py` enforces. The demo is cached per commit, so
when the id or another build-time setting changes, bump the `-vN` suffix of the
cache key (`demo-<sha>-vN`) in `pages.yml`, or the old build is reused.

### One-time setting: let tags deploy

The `github-pages` environment normally only accepts deployments from `main`,
and a deploy started by a `v*` tag is rejected ("Tag ... is not allowed to
deploy to github-pages") even though the workflow is correct. Allow release
tags once:

1. In the repository, open Settings, Environments, `github-pages`.
2. Under "Deployment branches and tags", keep the `main` rule and add a rule of
   type Tag with the pattern `v*.*.*`.
3. Check that Settings, Pages, Source is "GitHub Actions".

This is a repository setting, so it cannot be changed in a pull request. Do it
before the first release that includes the demo. A manual run from `main` works
without it, which makes it the way to try the demo before a release.

### Try it before a release

Run the workflow by hand from `main` and build the demo from `main`:

```bash
gh workflow run pages.yml --ref main -f app_ref=main
gh run watch
```

Then open `https://nordstad.github.io/Planqer/app/`. Run it again with no
`app_ref` to go back to the latest release.

### Roll back

Run the workflow by hand and give the previous release tag. The docs are
rebuilt from the branch you run it on; the demo from the tag:

```bash
gh workflow run pages.yml --ref main -f app_ref=vX.Y.Z
```

### Check it after a release

```bash
gh run list --workflow=pages.yml --limit=1
```

- The docs are at the root and the demo at `/app/`.
- Open a deep link under `/app/`, such as `/app/#/tile-layout`, and reload it.
- The footer's version matches the tag.
- The footer shows "Analytics: on", and a visit shows up in Umami. With
  Do Not Track set, the browser loads no request to `cloud.umami.is`.
