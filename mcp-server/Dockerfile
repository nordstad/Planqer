# syntax=docker/dockerfile:1

FROM python:3.12-slim AS builder

COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv

WORKDIR /app
ENV UV_LINK_MODE=copy
ENV PATH="/app/.venv/bin:${PATH}"

COPY pyproject.toml uv.lock README.md ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-install-project --no-dev

COPY src/ ./src/
COPY schemas/ ./schemas/
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev --no-editable

FROM python:3.12-slim

WORKDIR /app
ENV PATH="/app/.venv/bin:${PATH}"
ENV PLANQER_API_URL=http://backend:8002/api
ENV PYTHONPATH=/app/src

RUN useradd --create-home --shell /bin/bash mcpuser \
    && install -d -o mcpuser -g mcpuser /app

COPY --from=builder --chown=mcpuser:mcpuser /app/.venv ./.venv
COPY --from=builder --chown=mcpuser:mcpuser /app/src ./src
COPY --from=builder --chown=mcpuser:mcpuser /app/schemas ./schemas

USER mcpuser

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD python -c "import planqer_mcp_server; print('healthy')"

CMD ["planqer-mcp-server"]
