# frontend/Dockerfile
FROM node:26-alpine

# Install build dependencies for native modules
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy package files
COPY package*.json ./

# Clean install with architecture-specific binaries
RUN npm ci --omit=dev || npm install --production=false

# Copy source code
COPY . .

# Remove any cached esbuild and ensure correct platform binary
RUN rm -rf node_modules/.cache && \
    rm -rf node_modules/esbuild && \
    npm install esbuild@latest --force

# Install curl for health checks and create non-root user
RUN apk add --no-cache curl && \
    adduser -D -s /bin/sh appuser

# Change ownership of the working directory to appuser
RUN chown -R appuser:appuser /app

# Switch to non-root user
USER appuser

EXPOSE 3001

# Add health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3001/ || exit 1

CMD ["npm", "start"]
