#!/bin/sh
# OpenFront Production Run Script
# Run on your server (alpine) as root or with sudo
# Usage: sudo ./run.sh

set -eu

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo "${GREEN}[run]${NC} $*"; }
warn() { echo "${YELLOW}[run]${NC} $*"; }
error() { echo "${RED}[run]${NC} $*"; exit 1; }

# Check root (POSIX compatible)
if [ "$(id -u)" -ne 0 ]; then
    error "Run as root: sudo ./run.sh"
fi

REPO_DIR="/home/filippo/openfront"
USER="filippo"

log "Starting OpenFront game server..."

# 1. Verify .env.prod exists and has keys
if [ ! -f "$REPO_DIR/.env.prod" ]; then
    error ".env.prod not found! Run ./install.sh first"
fi

# 2. Update GIT_COMMIT in .env.prod
cd "$REPO_DIR"
GIT_COMMIT=$(sudo -u "$USER" git rev-parse HEAD)
log "Setting GIT_COMMIT=$GIT_COMMIT"
sed -i "s/^GIT_COMMIT=.*/GIT_COMMIT=$GIT_COMMIT/" "$REPO_DIR/.env.prod"

# 3. Check for placeholder keys
if grep -q "PUT_YOUR_TURNSTILE" "$REPO_DIR/.env.prod"; then
    warn "Turnstile keys not set! Edit .env.prod first:"
    warn "  nano $REPO_DIR/.env.prod"
    error "Aborting - please add your Turnstile keys"
fi

# 4. Verify LOBBY_COORDINATOR=off is set
if ! grep -q "^LOBBY_COORDINATOR=off" "$REPO_DIR/.env.prod"; then
    log "Adding LOBBY_COORDINATOR=off to .env.prod"
    echo "LOBBY_COORDINATOR=off" >> "$REPO_DIR/.env.prod"
fi

# 5. Start mock API (for standalone mode - provides JWKS, cluster checkin, health)
log "Starting mock API..."
cd "$REPO_DIR"
if ! pgrep -f "mock-api.ts" >/dev/null 2>&1; then
    sudo -u "$USER" npx tsx mock-api.ts &
    MOCK_API_PID=$!
    log "Mock API started (PID: $MOCK_API_PID)"
    sleep 2
else
    log "Mock API already running"
fi

# 6. Test run (quick validation)
log "Testing server startup..."
cd "$REPO_DIR"
timeout 10 sudo -u "$USER" sh -c "
    export \$(grep -v '^#' .env.prod | xargs)
    npx tsx src/server/Server.ts &
    sleep 5
    kill \$! 2>/dev/null || true
" || error "Server test failed - check .env.prod values"

log "Server test passed"

# 7. Start nginx
log "Starting nginx..."
rc-service nginx start 2>/dev/null || rc-service nginx restart

# 8. Start OpenFront service
log "Starting OpenFront service..."
rc-service openfront start

# 9. Wait and verify
sleep 3
if rc-service openfront status | grep -q "started"; then
    log "OpenFront service started successfully!"
else
    error "Service failed to start. Check logs: tail -f /var/log/messages | grep openfront"
fi

# 10. Show status
log "=== SERVER RUNNING ==="
echo
echo "Service status:"
rc-service openfront status
echo
echo "Recent logs:"
tail -20 /var/log/messages | grep openfront || true
echo
echo "Game URL: https://openfront.filchine.dev"
echo
echo "Useful commands:"
echo "  sudo rc-service openfront status    # Check status"
echo "  sudo rc-service openfront restart   # Restart"
echo "  sudo rc-service openfront stop      # Stop"
echo "  tail -f /var/log/messages | grep openfront  # Follow logs"
echo "  sudo ./run.sh                       # Re-run this script"