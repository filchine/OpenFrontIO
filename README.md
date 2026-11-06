<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="proprietary/images/OpenFrontLogoDark.svg">
    <source media="(prefers-color-scheme: light)" srcset="proprietary/images/OpenFrontLogo.svg">
    <img src="proprietary/images/OpenFrontLogo.svg" alt="OpenFrontIO Logo" width="300">
  </picture>
</p>

[OpenFront.io](https://openfront.io/) is an online real-time strategy game focused on territorial control and alliance building. Players compete to expand their territory, build structures, and form strategic alliances in various maps based on real-world geography.

This is a **fork** of the original [OpenFront.io](https://openfront.io/) by [filchine](https://github.com/filchine). The original project is at https://github.com/openfrontio/OpenFrontIO.

> **Note:** This fork will be exclusively vibe coded, as the original project was already vibe coded from the beginning and I don't want to spend time learning TypeScript to maintain it.

![CI](https://github.com/openfrontio/OpenFrontIO/actions/workflows/ci.yml/badge.svg)
[![Crowdin](https://badges.crowdin.net/openfront-mls/localized.svg)](https://crowdin.com/project/openfront-mls)
[![CLA assistant](https://cla-assistant.io/readme/badge/openfrontio/OpenFrontIO)](https://cla-assistant.io/openfrontio/OpenFrontIO)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![Assets: CC BY-SA 4.0](https://img.shields.io/badge/Assets-CC%20BY--SA%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by-sa/4.0/)

## License

OpenFront source code is licensed under the **GNU Affero General Public License v3.0**

Current copyright notices appear in:

- Footer: "© OpenFront and Contributors"
- Loading screen: "© OpenFront and Contributors"

Modified versions must preserve these notices in reasonably visible locations.

See the [LICENSE](LICENSE) for complete requirements.

For asset licensing, see [LICENSE-ASSETS](LICENSE-ASSETS).
For license history, see [LICENSING.md](LICENSING.md).

## 🌟 Features

- **Real-time Strategy Gameplay**: Expand your territory and engage in strategic battles
- **Alliance System**: Form alliances with other players for mutual defense
- **Multiple Maps**: Play across various geographical regions including Europe, Asia, Africa, and more
- **Resource Management**: Balance your expansion with defensive capabilities
- **Cross-platform**: Play in any modern web browser
- **Submarines**: New stealth unit type with underwater mechanics
- **Nation AI**: AI-controlled nations with difficulty-based behavior (Easy/Medium/Hard/Impossible)

## 📚 Documentation

- **[Unit & NPC Behavior Reference](UNIT_BEHAVIOR.md)** — Comprehensive guide to all unit types, submarine mechanics, and Nation AI behavior
- **[Architecture](docs/Architecture.md)** — Game architecture and simulation flow
- **[API](docs/API.md)** — Public API endpoints
- **[Auth](docs/Auth.md)** — JWT/authentication flow
- **[Multi-Server](docs/MultiServer.md)** — Multi-server deployment architecture

## 📋 Prerequisites

- [Node.js](https://nodejs.org/) v24.15.0 or newer in the Node 24 release line
- [npm](https://www.npmjs.com/) v12.1.0 or newer in the npm 12 release line
- A modern web browser (Chrome, Firefox, Edge, etc.)

Node.js may bundle an older npm version. Upgrade it before installing project dependencies:

```bash
npm install --global --ignore-scripts npm@12.1.0
```

## 🚀 Installation

1. **Clone the repository**

   ```bash
   git clone https://github.com/openfrontio/OpenFrontIO.git
   cd OpenFrontIO
   ```

2. **Install dependencies**

   ```bash
   npm run inst
   ```

   Do NOT use `npm install` nor `npm i` for project dependencies. Use `npm run inst`; it runs the safer `npm ci --ignore-scripts` to install exactly the versions in `package-lock.json` without running lifecycle scripts.

   The repository also rejects dependency releases less than seven days old and dependencies sourced from Git, remote URLs, local tarballs, or directories. Wait until a new release passes the seven-day window before updating it; security exceptions require explicit maintainer review.

## 🎮 Running the Game

### Development Mode

Run both the client and server in development mode with live reloading:

```bash
npm run dev
```

This will:

- Start the Vite dev server for the client
- Launch the game server with development settings
- Open the game in your default browser (to disable this behavior, set `SKIP_BROWSER_OPEN=true` in your environment)

> **⚠️ Important:** Plain `npm run dev` runs **without connecting to the external authentication API**. You'll get a generated username but **cannot create or join lobbies**, purchase cosmetics, or access player profiles. The game simulation runs locally, but auth/stats/cosmetics require the Cloudflare Worker API (closed source).

### Development Mode with Authentication (Recommended)

To enable full functionality (lobbies, auth, cosmetics, leaderboards), connect to the staging or production API:

```bash
# Staging environment (recommended for development)
npm run dev:staging

# Production environment (for testing against live data)
npm run dev:prod
```

These commands connect to `api.openfront.dev` (staging) or `api.openfront.io` (prod) for authentication, allowing you to sign in and use all features.

### Client Only

To run just the client with hot reloading:

```bash
npm run start:client
```

### Server Only

To run just the server with development settings:

```bash
npm run start:server-dev
```

### Connecting to staging or production backends

Sometimes it's useful to connect to production servers when replaying a game, testing user profiles, purchases, or login flow.

> To replay a production game, make sure you're on the same commit that the game you want to replay was executed on, you can find the `gitCommit` value via `https://api.openfront.io/game/[gameId]`.
> Unfinished games cannot be replayed on localhost.

To connect to staging api servers:

```bash
npm run dev:staging
```

To connect to production api servers:

```bash
npm run dev:prod
```

## 🏗️ Production Deployment (24/7 Server)

### What's in this repo (Open Source)

This repository contains the **game server** and **game client**:

| Component | Description |
|-----------|-------------|
| **Game Server** (`src/server/`) | WebSocket relay, game coordination, lobby scheduling, intent relay between players. Does NOT run the simulation. |
| **Game Client** (`src/client/`) | WebGL2 renderer, Lit UI components, WebSocket communication, runs the simulation in a Web Worker |
| **Engine** (`packages/engine/`) | Deterministic game simulation (runs in browser Web Workers) |
| **Engine API** (`packages/engine-api/`) | Contracts: intent/config schemas, game types, GameUpdates, worker protocol |
| **Engine Lib** (`packages/engine-lib/`) | Shared engine code: map grid, terrain loading, rules, PRNG, DetMath |
| **Shared** (`packages/shared/`) | Client/server code: wire schemas, ZbinWire, env, asset URLs, map loaders |
| **Zbin** (`packages/zbin/`) | Binary wire format for zod schemas |

### What's CLOSED SOURCE (External API)

The following services are provided by a **closed-source Cloudflare Worker** (not in this repo):

| Service | Purpose | Endpoint |
|---------|---------|----------|
| **Authentication** | JWT issuance/validation, refresh tokens, Turnstile verification | `api.<DOMAIN>` |
| **Player Stats/Leaderboards** | ELO, rankings, game history, clan stats | `api.<DOMAIN>/public/*` |
| **Cosmetics/Shop** | Skin/pattern purchases, Stripe integration | `api.<DOMAIN>` |
| **Lobby Coordinator** | Cross-server public lobby merging, matchmaking queue | `wss://api.<DOMAIN>/cluster/lobbies` |
| **Cluster Registry** | Server check-in, fleet management, `GET /cluster.json` | `api.<DOMAIN>/cluster/*` |
| **Game Archival** | Game records, replays, persistent storage | `api.<DOMAIN>/game/*` |

**You cannot host these yourself** — they are proprietary services run by the OpenFront team. Your game server connects to them.

### Architecture Summary

```
┌─────────────────┐     WebSocket      ┌──────────────────┐
│   Browser       │◄──────────────────►│  Game Server     │
│   (Client)      │   (intent relay)   │  (this repo)     │
│                 │                    │                  │
│  - Rendering    │                    │  - WebSocket     │
│  - Simulation   │                    │    relay         │
│    (Web Worker) │                    │  - Lobby         │
└────────┬────────┘                    │    scheduling    │
         │                             │  - Intent relay  │
         │ HTTPS                       └────────┬─────────┘
         ▼                                      │
┌─────────────────┐                      HTTPS  │
│  Cloudflare     │◄────────────────────────────┘
│  API Worker     │  (closed source)
│                 │
│  - Auth/JWT     │
│  - Stats/Leader │
│  - Cosmetics    │
│  - Lobby coord  │
│  - Cluster reg  │
└─────────────────┘
```

**Key insight:** The game simulation runs **in each client's browser** (Web Worker), NOT on the server. The server only relays WebSocket messages (intents) between players. This is why the engine must be deterministic.

### Required External Services

To run a fully functional 24/7 server, you need:

1. **Domain name** (e.g., `filchine.dev`)
2. **DNS** pointing to your server:
   - `A` record for `openfront.filchine.dev` → your server IP
   - (Optional) `A` record for `api.filchine.dev` if you run your own API (not possible — closed source)
3. **SSL certificates** (Let's Encrypt via certbot/nginx)
4. **Cloudflare Turnstile** keys for bot protection (free at dash.cloudflare.com → Turnstile)
5. **Connection to official OpenFront API** for auth/stats/cosmetics

### Environment Variables

Create `.env.prod` on your server:

```bash
# Game environment
GAME_ENV=prod                    # "dev", "staging", or "prod"
DOMAIN=openfront.dev             # Controls API hostname: https://api.<DOMAIN>
                                 # Use "openfront.dev" (staging) or "openfront.io" (prod)
                                 # for official API. Your custom domain goes in SITE_HOST.

# Your site's hostnames (where players load the page / open WebSockets)
SITE_HOST=openfront.filchine.dev  # Page host (HTML, assets)
GAME_HOST=openfront.filchine.dev  # Game host (WebSockets, /api/*)

# API connection (for auth/stats/cosmetics - uses official API)
JWT_AUDIENCE=openfront.dev        # Must match DOMAIN for official API
JWT_SECRET=                       # Not used with official API
TURNSTILE_SECRET_KEY=             # From Cloudflare Turnstile dashboard
TURNSTILE_SITE_KEY=               # From Cloudflare Turnstile dashboard

# Server identity (required for prod)
NUM_WORKERS=2                     # Worker processes (simulation threads)
INSTANCE_LETTER=a                 # Single letter, assigned by API registry
INSTANCE_ID=server-1              # Unique identifier for this deployment
GIT_COMMIT=<git rev-parse HEAD>   # Current commit hash (required!)

# Lobby coordinator (set to "off" for personal servers)
LOBBY_COORDINATOR=off             # "api" = use official coordinator (needs API_KEY)
                                  # "off" = run lobbies locally, no API key needed

# Optional
API_KEY=                          # Only needed if LOBBY_COORDINATOR=api
CDN_BASE=                         # Empty = same-origin, or CDN URL (https://cdn.example.com)
STRIPE_PUBLISHABLE_KEY=           # For shop (optional)
FARO_COLLECTOR_URL=               # Grafana Faro telemetry (optional)
OTEL_EXPORTER_OTLP_ENDPOINT=      # OpenTelemetry (optional)
OTEL_AUTH_HEADER=                 # OpenTelemetry auth (optional)
ADMIN_BOT_API_KEY=                # Admin bot API (optional)
ALLOWED_FLARES=                   # Comma-separated flare names (optional)
MACHINE=                          # Machine identifier for multi-box deployments (optional)
```

### Quick Start (Personal Server)

For a personal server without official API registration:

```bash
# On your server (Alpine Linux example):

# 1. Clone and install
git clone https://github.com/openfrontio/OpenFrontIO.git
cd OpenFrontIO
npm run inst

# 2. Create .env.prod
cat > .env.prod << 'EOF'
GAME_ENV=prod
DOMAIN=openfront.dev
JWT_AUDIENCE=openfront.dev
JWT_SECRET=not-used-with-official-api
TURNSTILE_SECRET_KEY=your-turnstile-secret-key
TURNSTILE_SITE_KEY=your-turnstile-site-key
NUM_WORKERS=2
INSTANCE_LETTER=a
INSTANCE_ID=server-1
SITE_HOST=openfront.filchine.dev
GAME_HOST=openfront.filchine.dev
CDN_BASE=
GIT_COMMIT=$(git rev-parse HEAD)
LOBBY_COORDINATOR=off
API_KEY=
EOF

# 3. Test run
export $(grep -v '^#' .env.prod | xargs)
npx tsx src/server/Server.ts
# Should start without errors — Ctrl+C to stop

# 4. Set up OpenRC service (Alpine Linux)
sudo tee /etc/init.d/openfront > /dev/null << 'EOF'
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
depend() { need net; after firewall; }
EOF

sudo chmod +x /etc/init.d/openfront
sudo rc-update add openfront default
sudo rc-service openfront start
sudo rc-service openfront status

# 5. Configure nginx + SSL
# (Standard nginx reverse proxy to localhost:3001, certbot for SSL)
```

### What Works / What Doesn't

| Feature | With Official API (`DOMAIN=openfront.dev`) | Without API (`npm run dev`) |
|---------|-------------------------------------------|----------------------------|
| Play singleplayer | ✅ | ✅ |
| Create/join public lobbies | ✅ (with `LOBBY_COORDINATOR=off`) | ❌ |
| Create/join private lobbies | ✅ | ❌ |
| User accounts / login | ✅ | ❌ (generated username only) |
| Player stats / leaderboards | ✅ | ❌ |
| Cosmetics / shop | ✅ | ❌ |
| Clan system | ✅ | ❌ |
| Replays | ✅ | ❌ |
| Game simulation | ✅ (runs in browser) | ✅ |

### Alpine Linux (OpenRC) Service

The server uses OpenRC on Alpine, not systemd:

```bash
# Start
sudo rc-service openfront start

# Stop
sudo rc-service openfront stop

# Restart
sudo rc-service openfront restart

# Status
sudo rc-service openfront status

# Logs (Alpine uses /var/log/messages)
tail -f /var/log/messages | grep openfront
```

### Nginx Configuration Example

```nginx
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
```

### Common Issues

| Error | Cause | Fix |
|-------|-------|-----|
| `unsupported game env: undefined` | `GAME_ENV` not set | Add `GAME_ENV=prod` to `.env.prod` |
| `GIT_COMMIT not set` | Missing commit hash | Add `GIT_COMMIT=$(git rev-parse HEAD)` |
| `ENOTFOUND api.filchine.dev` | Wrong `DOMAIN` | Set `DOMAIN=openfront.dev` (not your custom domain) |
| `401 Unauthorized` polling lobbies | `LOBBY_COORDINATOR=api` without `API_KEY` | Set `LOBBY_COORDINATOR=off` |
| `TURNSTILE_SITE_KEY not set` | Missing Turnstile keys | Get keys from Cloudflare Turnstile dashboard |

### Turnstile Setup

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com) → Turnstile
2. Click "Add Site" → enter your domain (e.g., `filchine.dev`)
3. Copy **Site Key** → `TURNSTILE_SITE_KEY`
4. Copy **Secret Key** → `TURNSTILE_SECRET_KEY`

## 🛠️ Development Tools

- **Format code**:
  ```bash
  npm run format
  ```

- **Lint code with Oxlint**:
  ```bash
  npm run lint
  ```

- **Lint and fix code with Oxlint**:
  ```bash
  npm run lint:fix
  ```

- **Testing**
  ```bash
  npm test
  ```

## 🏗️ Project Structure

- `/src/client` - Frontend game client
- `/src/server` - Backend game server
- `/packages/engine` - Deterministic game simulation (`@openfront/engine`)
- `/packages/engine-api` - The engine's contract: types, schemas, game updates and the worker protocol (`@openfront/engine-api`)
- `/packages/engine-lib` - Engine code also used outside the engine: map grid, rules, helpers (`@openfront/engine-lib`)
- `/packages/shared` - Code shared by client and server: wire schemas, env, asset URLs (`@openfront/shared`)
- `/packages/zbin` - Compact binary wire format for zod schemas (self-contained, zod-only)
- `/resources` - Static assets (images, maps, etc.)

## 🤝 Contributing

Contributions and translations are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for the workflow, the approved-issue process, project governance, and translation info.

## ⚠️ Important Notes for Fork Maintainers

1. **You cannot host the API** — Auth, stats, cosmetics, lobby coordination, and game archival are closed-source Cloudflare Workers run by the OpenFront team.

2. **Use `DOMAIN=openfront.dev` (staging) or `openfront.io` (prod)** to connect to the official API. Your custom domain goes in `SITE_HOST`/`GAME_HOST`.

3. **Set `LOBBY_COORDINATOR=off`** for personal servers — the official lobby coordinator requires an API key from the OpenFront team (your server must be registered in their cluster registry).

4. **The simulation runs in the browser** — The game server only relays WebSocket messages. Don't try to run the simulation on the server.

5. **Engine must stay deterministic** — Use `packages/engine-lib/src/DetMath.ts` instead of `Math.*`, seeded PRNG only, no `Math.random()`/`Date.now()`/`fetch` in engine packages.

6. **Alpine Linux users** — Use OpenRC (`/etc/init.d/`), not systemd.