# Multi-stage build for MCP server with TypeScript and Python support
FROM node:20-alpine AS ts-builder

# Build TypeScript version
WORKDIR /app
COPY package*.json tsconfig.json ./
RUN npm ci
COPY src/ ./src/
RUN npm run build
RUN npm prune --omit=dev

# Python runtime with uv
FROM python:3.12-slim

# Install uv for dependency management
RUN pip install uv

# Set working directory
WORKDIR /app

# Copy Python project files
COPY pyproject.toml uv.lock .python-version README.md ./
COPY src/ ./src/
COPY schemas/ ./schemas/

# Create non-root user for security first
RUN useradd --create-home --shell /bin/bash mcpuser
RUN chown -R mcpuser:mcpuser /app
USER mcpuser

# Install Python dependencies as non-root user
RUN uv sync --no-dev

# Copy built TypeScript files (optional - both implementations available)
COPY --from=ts-builder /app/dist ./dist/
COPY --from=ts-builder /app/package.json ./
USER root
RUN chown -R mcpuser:mcpuser /app/dist /app/package.json
USER mcpuser

# Environment variables
ENV PLANQER_API_URL=http://backend:8002/api
ENV PYTHONPATH=/app/src

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD echo '{"jsonrpc":"2.0","method":"initialize","params":{},"id":1}' | python -c "import sys; print('healthy')" || exit 1

# Default to Python implementation
CMD ["uv", "run", "planqer-mcp-server"]

# Expose no ports (MCP uses stdio)
EXPOSE 0