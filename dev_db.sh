#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="$SCRIPT_DIR/infra/docker-compose.yml"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required but not installed"
  exit 1
fi

if [ "$#" -ne 1 ]; then
  echo "Usage: ./dev.sh <up|down>"
  exit 1
fi

ACTION="$1"

case "$ACTION" in
  up)
    docker compose -f "$COMPOSE_FILE" up -d
    echo "MongoDB is up on localhost:27017"
    ;;
  down)
    docker compose -f "$COMPOSE_FILE" down
    echo "MongoDB is down"
    ;;
  *)
    echo "Usage: ./dev.sh <up|down>"
    exit 1
    ;;
esac
