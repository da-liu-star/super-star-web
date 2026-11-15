#!/usr/bin/env bash

set -euo pipefail

APP_ROOT="${APP_ROOT:-/opt/super-star}"
FRONTEND_DIR="$APP_ROOT/frontend"
BACKEND_DIR="$APP_ROOT/backend"
FRONTEND_REPO="https://github.com/da-liu-star/super-star-web.git"
BACKEND_REPO="https://github.com/da-liu-star/super-star.git"

mkdir -p "$APP_ROOT"

exec 9>/tmp/super-star-deploy.lock
flock 9

update_repo() {
  local directory="$1"
  local repository="$2"

  if [ ! -d "$directory/.git" ]; then
    git clone --branch main "$repository" "$directory"
    return
  fi

  git -C "$directory" fetch origin main --prune
  git -C "$directory" checkout main
  git -C "$directory" pull --ff-only origin main
}

update_repo "$FRONTEND_DIR" "$FRONTEND_REPO"
update_repo "$BACKEND_DIR" "$BACKEND_REPO"

if [ ! -f "$APP_ROOT/.env" ]; then
  echo "Missing $APP_ROOT/.env"
  exit 1
fi

if docker info >/dev/null 2>&1; then
  DOCKER=(docker)
else
  DOCKER=(sudo -n docker)
fi

cd "$FRONTEND_DIR/deploy"
"${DOCKER[@]}" compose --env-file "$APP_ROOT/.env" config >/dev/null
"${DOCKER[@]}" compose --env-file "$APP_ROOT/.env" up -d --build --remove-orphans
"${DOCKER[@]}" compose --env-file "$APP_ROOT/.env" ps
