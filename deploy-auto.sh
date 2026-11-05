#!/bin/bash
# Auto-deploy script for OpenFront.io personal fork
# Run via cron to pull latest main and rebuild

set -e

REPO_DIR="/home/filippo/openfront"
LOG_FILE="/home/filippo/openfront/deploy.log"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

cd "$REPO_DIR"

log "Starting auto-deploy..."

# Check if there are updates
git fetch origin main
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)

if [ "$LOCAL" = "$REMOTE" ]; then
    log "Already up to date ($LOCAL)"
    exit 0
fi

log "Updates available: $LOCAL -> $REMOTE"

# Pull latest changes
git pull origin main

# Install dependencies
log "Installing dependencies..."
npm ci --ignore-scripts >> "$LOG_FILE" 2>&1

# Build production
log "Building production..."
npm run build-prod >> "$LOG_FILE" 2>&1

# Restart game server
log "Restarting game server..."
pkill -f "tsx src/server/Server.ts" || true
sleep 2

# Start server in background
GAME_ENV=dev \
TURNSTILE_SITE_KEY=1x00000000000000000000AA \
API_KEY=WARNING_DEV_API_KEY_DO_NOT_USE_IN_PRODUCTION \
ADMIN_BOT_API_KEY=WARNING_DEV_ADMIN_BOT_KEY_DO_NOT_USE_IN_PRODUCTION \
DOMAIN=filchine.dev \
GIT_COMMIT=$(git rev-parse --short HEAD) \
NUM_WORKERS=1 \
CDN_BASE='' \
nohup npx tsx src/server/Server.ts >> "$LOG_FILE" 2>&1 &

sleep 3

# Verify server is running
if curl -s http://localhost:3000/ > /dev/null; then
    log "Deploy successful! Server running on port 3000"
else
    log "ERROR: Server failed to start"
    exit 1
fi