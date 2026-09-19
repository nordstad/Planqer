#!/bin/sh
set -eu
umask 022

escaped_api_url=$(printf '%s' "${VITE_API_URL:-}" | sed 's/[\\"]/[\\&]/g')
printf 'window.__PLANQER_API_URL__ = "%s";\n' "$escaped_api_url" > /usr/share/nginx/html/config.js
