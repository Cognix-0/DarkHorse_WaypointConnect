# Deploying Waypoint Connect to a public URL

The whole system is one `docker compose up`: PostgreSQL, the API (it syncs the schema and seeds the demo day on every start), the web app, and Caddy for HTTPS. HTTPS matters: browsers only allow the driver's offline service worker and the camera on a secure origin.

About 20 minutes the first time.

## Quick way (one command)

1. Create an Ubuntu 24.04 server (DigitalOcean: *Create → Droplet*, Ubuntu 24.04, Basic, 2 GB RAM recommended; the 1 GB size works because the script adds swap). Choose *Password* or your SSH key.
2. Open its console (DigitalOcean: the droplet → *Console*) and paste:

   ```bash
   curl -fsSL https://raw.githubusercontent.com/Cognix-0/DarkHorse_WaypointConnect/main/scripts/server-setup.sh | bash
   ```

   With your own domain (its A record pointing at the server): `curl … | DOMAIN=waypoint.example.com bash`.
3. After 5–10 minutes it prints `Live: https://…`. That is the public URL for the submission. Without a domain it is `https://<ip-with-dashes>.sslip.io`.

Run the same command again to deploy a new commit. The steps below are the same thing done by hand.

## 1. Get a server

Any Linux VPS with **2 vCPU, 2 GB RAM, 20 GB disk** (DigitalOcean, Hetzner, AWS Lightsail, Azure, a university VM…). Ubuntu 24.04 is assumed below. Open ports **22, 80 and 443** in the provider's firewall.

The build (pnpm install + Vite) needs about 1.5 GB of memory. On a 1 GB server, add swap first:

```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
```

## 2. Point a domain at it

At your DNS provider add an **A record**, e.g. `waypoint.example.com → <server IP>`. Check it before going on:

```bash
dig +short waypoint.example.com   # must print the server IP
```

No domain? A free one works: DuckDNS (`darkhorse.duckdns.org`), or `<ip-with-dashes>.sslip.io` (for example `203-0-113-7.sslip.io`), which resolves to the IP with no setup.

## 3. Install Docker

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER && newgrp docker
docker compose version   # v2.x
```

## 4. Get the code and configure

```bash
git clone https://github.com/<team>/DarkHorse_WaypointConnect.git
cd DarkHorse_WaypointConnect
cp .env.example .env
nano .env
```

Set at least:

| Variable | Value |
| --- | --- |
| `DOMAIN` | `waypoint.example.com` (no `https://`) |
| `DB_PASSWORD` | a random string (`openssl rand -hex 16`) |
| `JWT_SECRET` | a long random string (`openssl rand -hex 32`) |
| `ACCOUNT_SECRET` | a long random string (`openssl rand -hex 32`). Every account's password is derived from it; list them with `docker compose exec api pnpm -s credentials > credentials.csv` and keep that file private |

Leave `DEMO_DATE` and the `DEMO_*_CLOCK` values empty: every screen then shows today and the real Asia/Colombo time.

## 5. Start it

```bash
docker compose up -d --build
docker compose logs -f api    # wait for "Seed complete" and "Server listening"
```

Caddy gets a Let's Encrypt certificate on the first request to `https://<DOMAIN>` (a few seconds). Then open it and sign in as each of the four accounts.

## 6. Check before submitting

- [ ] `https://<DOMAIN>` shows a padlock (no certificate warning).
- [ ] The walkthrough accounts sign in with their passwords from `credentials.csv`: `dispatcher.peliyagoda@`, `loader1.peliyagoda@`, `veh024@`, `out026@waypoint.lk`.
- [ ] Dispatcher → Order Queue shows 85 orders; Planning Board says *All booklet rules pass*.
- [ ] On a phone: driver app → *Add to Home Screen*, airplane mode, reopen: it still loads.
- [ ] Run the README judge walkthrough once end to end, then reset (below) so judges start clean.

## Database access for the team

The database runs in the `db` container on the server. Its port is open only on the server itself (`127.0.0.1:15432`), never to the internet, so each teammate reaches it through SSH with their own key. No database password travels over the network unencrypted, and removing a key removes that person's access.

**1. Each teammate makes an SSH key** (once, on their own computer) and sends you the **public** half:

```bash
ssh-keygen -t ed25519 -C "name@team"      # press Enter for the defaults
cat ~/.ssh/id_ed25519.pub                 # send this line (never the file without .pub)
```

**2. You add each key on the server** (droplet console):

```bash
echo 'ssh-ed25519 AAAA... name@team' >> ~/.ssh/authorized_keys
grep DB_PASSWORD /opt/waypoint/.env       # share this password privately (not in Git, not in a group chat)
```

**3. Teammates connect** with TablePlus, DBeaver or pgAdmin:

| Field | Value |
| --- | --- |
| Connection type | PostgreSQL **over SSH** |
| SSH host / user / key | `<server IP>` / `root` / `~/.ssh/id_ed25519` |
| Database host / port | `127.0.0.1` / `15432` |
| User / database | `postgres` / `waypoint` |
| Password | the `DB_PASSWORD` from step 2 |

Or a tunnel by hand, then any tool on `localhost:5434`:

```bash
ssh -N -L 5434:127.0.0.1:15432 root@<server IP>
DATABASE_URL="postgresql://postgres:<DB_PASSWORD>@localhost:5434/waypoint" pnpm prisma studio   # table editor in the browser
```

To remove someone: delete their line from `~/.ssh/authorized_keys` on the server. To change the database password after someone leaves: `docker compose exec db psql -U postgres -c "ALTER USER postgres PASSWORD 'new'"`, put the same value in `.env` as `DB_PASSWORD`, then `docker compose up -d api`.

Your own laptop's copy is on `localhost:15432` (no SSH needed). If 15432 is also taken, set `DB_HOST_PORT=15440` in `.env`.

For day-to-day coding, everyone should still run their own local copy (`docker compose up` on their machine), so experiments never touch the shared demo data.

## Everyday commands

| Need | Command |
| --- | --- |
| Reset the demo to a clean day (wipes the database, re-seeds) | `docker compose down -v && docker compose up -d` |
| Deploy a new commit | `git pull && docker compose up -d --build` |
| See errors | `docker compose logs --tail=100 api` (or `web`, `caddy`) |
| Open the database | `docker compose exec db psql -U postgres waypoint` |

`down -v` also deletes Caddy's stored certificate; it fetches a new one, but Let's Encrypt allows only 5 per domain per week, so don't reset in a loop. To reset only the database: `docker compose down && docker volume rm darkhorse_waypointconnect_pgdata && docker compose up -d` (the volume name is the folder name + `_pgdata`; `docker volume ls` shows it).

## Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| "Wrong email or password" | Each account has its own password: look it up with `docker compose exec api pnpm -s credentials`. Changing `ACCOUNT_SECRET` (or `JWT_SECRET` when it is empty) changes every password after `docker compose up -d api`. |
| Certificate error / Caddy log says "challenge failed" | DNS does not point at this server yet, or ports 80/443 are closed in the provider firewall. Fix, then `docker compose restart caddy`. |
| Build stops with "killed" | Out of memory: add swap (step 1). |
| New screens missing after `git pull` | Rebuild: `docker compose up -d --build`. On phones, close and reopen the app once so the service worker picks up the new version. |
| Store or driver account shows another outlet/vehicle | The database was seeded by an older version. Reset with `docker compose down -v && docker compose up -d`. |
