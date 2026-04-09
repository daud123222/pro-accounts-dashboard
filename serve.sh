#!/bin/bash
# Pro Accounts Dashboard Server
# Run this script to start the dashboard and get a shareable link.
# Press Ctrl+C to stop.

DIR="$(cd "$(dirname "$0")" && pwd)"
PIDFILE_SERVER="/tmp/dashboard_server.pid"
PIDFILE_TUNNEL="/tmp/dashboard_tunnel.pid"
TUNNEL_LOG="/tmp/dashboard_tunnel.log"
PORT=8080

cleanup() {
    echo ""
    echo "Shutting down..."
    [ -f "$PIDFILE_SERVER" ] && kill "$(cat $PIDFILE_SERVER)" 2>/dev/null && rm -f "$PIDFILE_SERVER"
    [ -f "$PIDFILE_TUNNEL" ] && kill "$(cat $PIDFILE_TUNNEL)" 2>/dev/null && rm -f "$PIDFILE_TUNNEL"
    lsof -ti:$PORT | xargs kill -9 2>/dev/null
    exit 0
}
trap cleanup EXIT INT TERM

# Kill anything on the port
lsof -ti:$PORT | xargs kill -9 2>/dev/null
sleep 1

# Start local server
cd "$DIR"
python3 -m http.server $PORT &
SERVER_PID=$!
echo $SERVER_PID > "$PIDFILE_SERVER"
echo "Local server started on http://localhost:$PORT (PID: $SERVER_PID)"

sleep 2

# Verify server is running
if ! kill -0 $SERVER_PID 2>/dev/null; then
    echo "ERROR: Server failed to start"
    exit 1
fi

# Start cloudflared tunnel
cloudflared tunnel --url http://localhost:$PORT > "$TUNNEL_LOG" 2>&1 &
TUNNEL_PID=$!
echo $TUNNEL_PID > "$PIDFILE_TUNNEL"
echo "Starting Cloudflare tunnel (PID: $TUNNEL_PID)..."

# Wait for tunnel URL to appear
for i in $(seq 1 30); do
    URL=$(grep -o 'https://[a-zA-Z0-9-]*\.trycloudflare\.com' "$TUNNEL_LOG" 2>/dev/null | head -1)
    if [ -n "$URL" ]; then
        echo ""
        echo "================================================"
        echo "  Dashboard is live!"
        echo "  Public URL: $URL"
        echo "  Local URL:  http://localhost:$PORT"
        echo "================================================"
        echo ""
        echo "Press Ctrl+C to stop."
        break
    fi
    sleep 1
done

if [ -z "$URL" ]; then
    echo "WARNING: Could not get tunnel URL. Check $TUNNEL_LOG"
    echo "Dashboard still available at http://localhost:$PORT"
fi

# Keep alive - monitor and restart if needed
while true; do
    sleep 10

    if ! kill -0 $SERVER_PID 2>/dev/null; then
        echo "Server died, restarting..."
        cd "$DIR"
        python3 -m http.server $PORT &
        SERVER_PID=$!
        echo $SERVER_PID > "$PIDFILE_SERVER"
    fi

    if ! kill -0 $TUNNEL_PID 2>/dev/null; then
        echo "Tunnel died, restarting..."
        cloudflared tunnel --url http://localhost:$PORT > "$TUNNEL_LOG" 2>&1 &
        TUNNEL_PID=$!
        echo $TUNNEL_PID > "$PIDFILE_TUNNEL"
        sleep 5
        NEW_URL=$(grep -o 'https://[a-zA-Z0-9-]*\.trycloudflare\.com' "$TUNNEL_LOG" 2>/dev/null | tail -1)
        if [ -n "$NEW_URL" ]; then
            echo "New tunnel URL: $NEW_URL"
        fi
    fi
done
