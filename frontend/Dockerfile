# syntax=docker/dockerfile:1

FROM node:26-alpine AS development

RUN apk add --no-cache python3 make g++
RUN adduser -D -u 1001 -s /bin/sh appuser

WORKDIR /app
RUN chown appuser:appuser /app
COPY --chown=appuser:appuser package*.json ./
USER appuser
RUN --mount=type=cache,target=/home/appuser/.npm,uid=1001,gid=1001 npm ci
COPY --chown=appuser:appuser . .

EXPOSE 3001
CMD ["npm", "start"]

FROM node:26-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm npm ci
COPY . .
RUN npm run build

FROM nginx:alpine AS production

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY docker-entrypoint.d/40-planqer-config.sh /docker-entrypoint.d/40-planqer-config.sh
RUN chmod +x /docker-entrypoint.d/40-planqer-config.sh
COPY --from=builder /app/build /usr/share/nginx/html
RUN chmod -R a+rX /usr/share/nginx/html

EXPOSE 3001
