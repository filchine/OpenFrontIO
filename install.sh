#!/bin/sh
# OpenFront Production Install Script
# Run on your server (alpine) as root or with sudo
# Usage: sudo ./install.sh

set -eu

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo "${GREEN}[install]${NC} $*"; }
warn() { echo "${YELLOW}[install]${NC} $*"; }
error() { echo "${RED}[install]${NC} $*"; exit 1; }

# Check root (POSIX compatible)
if [ "$(id -u)" -ne 0 ]; then
    error "Run as root: sudo ./install.sh"
fi

REPO_DIR="/home/filippo/openfront"
USER="filippo"

log "Installing OpenFront game server..."

# 1. Install dependencies
log "Installing Node.js, npm, bash..."
apk add --no-cache nodejs npm bash

# 2. Clone/pull repo
if [ ! -d "$REPO_DIR/.git" ]; then
    log "Cloning repository..."
    git clone https://github.com/openfrontio/OpenFrontIO.git "$REPO_DIR"
    chown -R "$USER:$USER" "$REPO_DIR"
else
    log "Repository exists, pulling latest..."
    cd "$REPO_DIR"
    sudo -u "$USER" git pull origin main
fi

# 3. Install npm dependencies
log "Installing npm dependencies..."
cd "$REPO_DIR"
sudo -u "$USER" npm run inst

# 4. Create .env.prod if missing
if [ ! -f "$REPO_DIR/.env.prod" ]; then
    log "Creating .env.prod template..."
    cat > "$REPO_DIR/.env.prod" << 'ENVEOF'
# OpenFront Production Environment
# EDIT THIS FILE - fill in your Turnstile keys below

GAME_ENV=prod
DOMAIN=openfront.dev
JWT_AUDIENCE=openfront.dev
JWT_SECRET=not-used-with-official-api
TURNSTILE_SECRET_KEY=PUT_YOUR_TURNSTILE_SECRET_KEY_HERE
TURNSTILE_SITE_KEY=PUT_YOUR_TURNSTILE_SITE_KEY_HERE
NUM_WORKERS=2
INSTANCE_LETTER=a
INSTANCE_ID=server-1
SITE_HOST=openfront.filchine.dev
GAME_HOST=openfront.filchine.dev
CDN_BASE=
GIT_COMMIT=PLACEHOLDER_WILL_BE_SET_ON_RUN
LOBBY_COORDINATOR=off
API_KEY=
ENVEOF
    chown "$USER:$USER" "$REPO_DIR/.env.prod"
    warn ".env.prod created — YOU MUST EDIT IT with your Turnstile keys!"
    warn "Run: nano $REPO_DIR/.env.prod"
else
    log ".env.prod already exists"
fi

# 5. Create OpenRC init script
log "Creating OpenRC service..."
cat > /etc/init.d/openfront << 'INITEOF'
#!/sbin/openrc-run

name="openfront"
description="OpenFront Game Server"

command="/usr/bin/npx"
command_args="tsx src/server/Server.ts"
command_background=true
pidfile="/run/openfront.pid"
directory="/home/filippo/openfront"
user="filippo"
env_file="/home/filippo/openfront/.env.prod"

depend() {
    need net
    after firewall
}
INITEOF

chmod +x /etc/init.d/openfront
rc-update add openfront default

log "OpenRC service created and added to default runlevel"

# 6. Install nginx and certbot
log "Installing nginx and certbot..."
apk add --no-cache nginx certbot certbot-nginx

# 7. Create nginx config
log "Creating nginx configuration..."
cat > /etc/nginx/http.d/openfront.conf << 'NGINXEOF'
server {
    listen 80;
    server_name openfront.filchine.dev;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name openfront.filchine.dev;

    ssl_certificate /etc/letsencrypt/live/openfront.filchine.dev/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/openfront.filchine.dev/privkey.pem;

    # WebSocket proxy
    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
    }
}
NGINXEOF

# Test nginx config
nginx -t

log "Nginx configured (SSL will be set up by certbot)"

echo
log "=== INSTALL COMPLETE ==="
echo
warn "NEXT STEPS (required):"
echo "  1. Edit .env.prod with your Turnstile keys:"
echo "     nano $REPO_DIR/.env.prod"
echo "     Replace TURNSTILE_SECRET_KEY and TURNSTILE_SITE_KEY"
echo
echo "  2. Get Turnstile keys from Cloudflare:"
echo "     https://dash.cloudflare.com → Turnstile → Add Widget"
echo "     Hostnames: filchine.dev, openfront.filchine.dev"
echo
echo "  3. Run the server:"
echo "     sudo ./run.sh"
echo
echo "  4. After server runs, set up SSL:"
echo "     certbot --nginx -d openfront.filchine.dev"
echo