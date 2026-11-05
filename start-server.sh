#!/bin/bash
# Start game server in tmux session

SESSION="openfront-game"

# Kill existing session if any
tmux kill-session -t "$SESSION" 2>/dev/null || true

# Create new tmux session
tmux new-session -d -s "$SESSION" -c /home/filippo/openfront

# Send the start command
tmux send-keys -t "$SESSION" "GAME_ENV=dev TURNSTILE_SITE_KEY=1x00000000000000000000AA API_KEY=WARNING_DEV_API_KEY_DO_NOT_USE_IN_PRODUCTION ADMIN_BOT_API_KEY=WARNING_DEV_ADMIN_BOT_KEY_DO_NOT_USE_IN_PRODUCTION DOMAIN=filchine.dev GIT_COMMIT=$(git rev-parse --short HEAD) NUM_WORKERS=1 CDN_BASE='' npx tsx src/server/Server.ts" Enter

echo "Game server started in tmux session: $SESSION"
echo "Attach with: tmux attach -t $SESSION"