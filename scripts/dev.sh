#!/usr/bin/env bash
#
# One-command local development for Universal POS.
#
#   ./scripts/dev.sh          start Postgres + MinIO, install deps, migrate,
#                             seed and run the dev servers
#   ./scripts/dev.sh down     stop Postgres + MinIO
#   ./scripts/dev.sh reset    stop services and delete their volumes (wipes data)
#   ./scripts/dev.sh app      build and run the whole stack in containers
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

COMPOSE=(docker compose -f infra/docker-compose.yml)

if command -v pnpm >/dev/null 2>&1; then
  PNPM=(pnpm)
else
  PNPM=(corepack pnpm)
fi

log() { printf '\033[1;34m==> %s\033[0m\n' "$*"; }
fail() { printf '\033[1;31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }

command -v docker >/dev/null 2>&1 || fail 'docker is required (https://docs.docker.com/get-docker/)'
command -v "${PNPM[0]}" >/dev/null 2>&1 || fail 'pnpm is required; run `corepack enable` first'

if ! docker info >/dev/null 2>&1; then
  fail 'Docker daemon is not running. Start Docker Desktop and retry.'
fi

action="${1:-up}"

case "$action" in
  down)
    log 'Stopping Postgres and MinIO'
    "${COMPOSE[@]}" down
    exit 0
    ;;
  reset)
    log 'Stopping services and deleting volumes'
    "${COMPOSE[@]}" down -v
    exit 0
    ;;
  app)
    log 'Building and starting the full containerized stack'
    "${COMPOSE[@]}" --profile app up --build
    exit 0
    ;;
  up) ;;
  *) fail "unknown command: $action (expected: up | down | reset | app)" ;;
esac

if [ ! -f .env ]; then
  log 'Creating .env from .env.example'
  cp .env.example .env
fi

# Export .env so drizzle-kit, tsx and the API server all see the same values.
set -a
# shellcheck disable=SC1091
. ./.env
set +a

log 'Starting Postgres and MinIO'
"${COMPOSE[@]}" up -d

log 'Waiting for Postgres to accept connections'
attempts=0
until "${COMPOSE[@]}" exec -T postgres pg_isready -U pos -d pos >/dev/null 2>&1; do
  attempts=$((attempts + 1))
  if [ "$attempts" -ge 60 ]; then
    fail 'Postgres did not become ready in time. Check: docker compose -f infra/docker-compose.yml logs postgres'
  fi
  sleep 1
done

log 'Installing workspace dependencies'
"${PNPM[@]}" install

log 'Applying database migrations'
"${PNPM[@]}" --filter @pos/db db:migrate

log 'Seeding permissions'
"${PNPM[@]}" --filter @pos/db db:seed

log 'Starting dev servers - press Ctrl-C to stop'
"${PNPM[@]}" dev
