#!/usr/bin/env bash

# Sync this repo to a remote Linux VM and run the CLI there.
#
# Usage: scripts/remote.sh <tfe-env args...>   (host: $TFE_DEV_HOST, default "tfe-dev")

set -euo pipefail

REMOTE_USER=$TFE_ENV_DEV_USER
HOST=$TFE_ENV_DEV_HOST
DIR=${TFE_ENV_DEV_DIR:-tfe-env}
ROOT=$(cd "$(dirname "$0")/.." && pwd)

rsync -az --delete \
  --exclude node_modules --exclude dist --exclude .DS_Store --exclude .lock.installed \
  "$ROOT/" "$REMOTE_USER@$HOST:$DIR/"

# Reinstall dependencies only when the lockfile changed.
ssh "$REMOTE_USER@$HOST" "cd $DIR && { cmp -s package-lock.json .lock.installed || { npm ci && cp package-lock.json .lock.installed; }; }"

args=$(printf '%q ' "$@")
ssh -t "$REMOTE_USER@$HOST" "cd $DIR && npm run dev -- $args"
