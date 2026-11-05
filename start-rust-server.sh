#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

PORT="${PORT:-3000}"

# Build frontend if static assets are missing
if [ ! -d "static/assets" ]; then
  echo "Building frontend client assets with Vite..."
  npx vite build
fi

# Build Rust server if missing
if [ ! -f "server-rs/target/release/server-rs" ]; then
  echo "Building Rust server (release profile)..."
  (cd server-rs && cargo build --release)
fi

echo "Starting OpenFront Rust Self-Hosted Server on http://localhost:$PORT ..."
PORT="$PORT" ./server-rs/target/release/server-rs
