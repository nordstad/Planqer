# backend/Dockerfile

FROM python:3.14-slim

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv

# Change the working directory to the backend folder
WORKDIR /app/backend

# Enable bytecode compilation
ENV UV_COMPILE_BYTECODE=1

# Copy from the cache instead of linking since it's a mounted volume
ENV UV_LINK_MODE=copy
ENV PATH="/app/backend/.venv/bin:${PATH}"

# Install system dependencies for 3D processing and health checks, create
# non-root user. The cairo/pango/gdk-pixbuf stack that used to sit here went
# with cairosvg: PNG export is rasterized in the browser, so the image needs no
# rendering libraries and the install is identical on every host OS.
RUN apt-get update && apt-get install -y \
    curl \
    libgl1-mesa-dev \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --shell /bin/bash appuser

# Copy dependency files
COPY backend/pyproject.toml backend/uv.lock ./
COPY README.md ../README.md
COPY LICENSE ../LICENSE

# Install dependencies into the system
RUN uv sync --frozen --no-install-project --no-dev

# Copy source code and config
COPY backend/planqer ./planqer
COPY backend/config.yaml ./
COPY backend/alembic ./alembic
COPY backend/alembic.ini ./
COPY backend/create_admin.py ./

# Install the project
RUN uv sync --frozen --no-dev

# SQLite data directory for local accounts, persisted via a volume
RUN mkdir -p /app/backend/data

# Change ownership of the working directory to appuser
RUN chown -R appuser:appuser /app

# Switch to non-root user
USER appuser

EXPOSE 8002

# Add health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8002/api/health || exit 1

# Run the FastAPI app using uvicorn on port 8002
CMD ["uv", "run", "uvicorn", "planqer.api:app", "--host", "0.0.0.0", "--port", "8002"]
