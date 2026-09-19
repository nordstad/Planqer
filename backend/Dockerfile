# syntax=docker/dockerfile:1

FROM python:3.12-slim AS builder

COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv

WORKDIR /app/backend
ENV UV_LINK_MODE=copy
ENV PATH="/app/backend/.venv/bin:${PATH}"

COPY backend/pyproject.toml backend/uv.lock ./
COPY README.md ../README.md
COPY LICENSE ../LICENSE

RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-install-project --no-dev

COPY backend/planqer ./planqer
COPY backend/config.yaml ./
COPY backend/alembic ./alembic
COPY backend/alembic.ini ./
COPY backend/create_admin.py ./

RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev --no-editable

FROM python:3.12-slim

WORKDIR /app/backend
ENV PATH="/app/backend/.venv/bin:${PATH}"

RUN useradd --create-home --shell /bin/bash appuser \
    && install -d -o appuser -g appuser /app/backend/data

COPY --from=builder --chown=appuser:appuser /app/backend/.venv ./.venv
COPY --from=builder --chown=appuser:appuser /app/backend/planqer ./planqer
COPY --from=builder --chown=appuser:appuser /app/backend/config.yaml ./
COPY --from=builder --chown=appuser:appuser /app/backend/alembic ./alembic
COPY --from=builder --chown=appuser:appuser /app/backend/alembic.ini ./
COPY --from=builder --chown=appuser:appuser /app/backend/create_admin.py ./

USER appuser

EXPOSE 8002

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8002/api/health')"

CMD ["uvicorn", "planqer.api:app", "--host", "0.0.0.0", "--port", "8002"]
