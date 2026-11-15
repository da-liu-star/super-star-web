#!/usr/bin/env bash

set -euo pipefail

APP_ROOT="${APP_ROOT:-/opt/super-star}"
FRONTEND_SOURCE="${1:?Frontend source directory is required}"
BACKEND_SOURCE="${2:?Backend source directory is required}"

mkdir -p "$APP_ROOT"

if [ ! -f "$FRONTEND_SOURCE/deploy/docker-compose.yml" ]; then
  echo "Frontend source is incomplete: $FRONTEND_SOURCE"
  exit 1
fi

if [ ! -f "$BACKEND_SOURCE/Dockerfile" ]; then
  echo "Backend source is incomplete: $BACKEND_SOURCE"
  exit 1
fi

if [ ! -f "$APP_ROOT/.env" ]; then
  echo "Missing $APP_ROOT/.env"
  exit 1
fi

if docker info >/dev/null 2>&1; then
  DOCKER=(docker)
else
  DOCKER=(sudo -n docker)
fi

export BACKEND_ROOT="$BACKEND_SOURCE"

cd "$FRONTEND_SOURCE/deploy"
echo "[deploy] Validating Docker Compose configuration"
"${DOCKER[@]}" compose --env-file "$APP_ROOT/.env" config >/dev/null

echo "[deploy] Building application images"
"${DOCKER[@]}" compose --env-file "$APP_ROOT/.env" build --progress=plain

echo "[deploy] Starting application containers"
"${DOCKER[@]}" compose --env-file "$APP_ROOT/.env" up -d --no-build --remove-orphans

echo "[deploy] Deployment complete"
"${DOCKER[@]}" compose --env-file "$APP_ROOT/.env" ps
