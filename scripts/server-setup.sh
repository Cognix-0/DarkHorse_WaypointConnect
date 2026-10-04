#!/usr/bin/env bash
# One-command install on a fresh Ubuntu server (run as root, e.g. in the DigitalOcean droplet console):
#
#   curl -fsSL https://raw.githubusercontent.com/Cognix-0/DarkHorse_WaypointConnect/main/scripts/server-setup.sh | bash
#
# Optional, before "bash":  DOMAIN=waypoint.example.com
# Without DOMAIN it uses <ip-with-dashes>.sslip.io, which points at this server with no DNS setup.
# Safe to run again: it pulls the latest code and rebuilds, keeping .env and the database.
set -euo pipefail
REPO=${REPO:-https://github.com/Cognix-0/DarkHorse_WaypointConnect.git}
DIR=${DIR:-/opt/waypoint}

say() { printf '\n\033[1;34m== %s\033[0m\n' "$*"; }

# The build needs ~1.5 GB of memory; small servers get swap.
if [ "$(free -m | awk '/Mem:/{print $2}')" -lt 3000 ] && ! swapon --show | grep -q /swapfile; then
  say "Adding 2 GB swap"
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  grep -q /swapfile /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# Server clock: synced to internet time, shown in Sri Lanka time.
timedatectl set-timezone Asia/Colombo || true
timedatectl set-ntp true || true

command -v docker >/dev/null || { say "Installing Docker"; curl -fsSL https://get.docker.com | sh; }
command -v git >/dev/null || { apt-get update -qq && apt-get install -y -qq git; }
if command -v ufw >/dev/null && ufw status | grep -q "Status: active"; then ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null; fi

say "Getting the code"
if [ -d "$DIR/.git" ]; then git -C "$DIR" pull --ff-only; else git clone "$REPO" "$DIR"; fi
cd "$DIR"

if [ ! -f .env ]; then
  IP=$(curl -fsS -4 https://api.ipify.org || hostname -I | awk '{print $1}')
  DOMAIN=${DOMAIN:-$(echo "$IP" | tr . -).sslip.io}
  say "Writing .env for $DOMAIN"
  cat > .env <<EOF
DOMAIN=$DOMAIN
DB_PASSWORD=$(openssl rand -hex 16)
JWT_SECRET=$(openssl rand -hex 32)
ACCOUNT_SECRET=$(openssl rand -hex 32)
DEMO_MODE=1
EOF
fi
DOMAIN=$(grep '^DOMAIN=' .env | cut -d= -f2)

say "Building and starting (first time: 5-10 minutes)"
docker compose up -d --build

say "Waiting for https://$DOMAIN"
for i in $(seq 1 60); do
  if curl -fsS "https://$DOMAIN/api/health" >/dev/null 2>&1; then
    docker compose exec -T api pnpm -s credentials > credentials.csv && chmod 600 credentials.csv
    say "Live: https://$DOMAIN   (every account and its password: $DIR/credentials.csv)"
    exit 0
  fi
  sleep 5
done
echo "Not reachable over HTTPS yet. Check: docker compose logs --tail=50 caddy api   (see docs/deploy.md, Troubleshooting)"
exit 1
