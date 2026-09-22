# PSM TouchCTF — Production Deployment Guide

## Prerequisites

### VM Requirements

| Resource | Minimum | Recommended |
|----------|---------|-------------|
| CPU | 2 vCPU | 4 vCPU |
| RAM | 2 GB | 4 GB |
| Disk | 20 GB | 50 GB SSD |
| OS | Ubuntu 22.04+ / Debian 12+ / RHEL 9+ |
| Arch | amd64, arm64 | amd64 |

### Software Requirements

```bash
# Docker Engine 24+ and Compose plugin
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# Log out and back in for group changes to take effect

docker --version   # >= 24.0
docker compose version  # >= 2.20
```

### Network

- Static IP or DNS hostname (e.g., `ctf.example.com`)
- Port 80 open for HTTP (port 443 for HTTPS if using reverse proxy)

## Quick Start

```bash
# 1. Clone the repository
git clone <repo-url> /opt/touchctf
cd /opt/touchctf

# 2. Generate secrets
openssl rand -hex 32 > secrets/app_secret.txt
openssl rand -hex 16 > secrets/db_password.txt

# 3. Configure environment
cp .env.prod.example .env.prod
# Edit .env.prod — set DB_PASSWORD to match secrets/db_password.txt

# 4. Build frontend
cd ui && npm ci && npm run build && cd ..

# 5. Start production stack
docker compose -f docker-compose.prod.yml up -d --build

# 6. Create admin user
docker compose -f docker-compose.prod.yml exec api \
  python3 -c "
from app.database import SessionLocal, Base, engine
from app.engine import create_staff_user
Base.metadata.create_all(bind=engine)
db = SessionLocal()
u = create_staff_user(db, 'admin', 'CHANGE_ME', 'system_admin')
print(f'Admin created: {u.username} (role: {u.role.value})')
db.close()
"

# 7. Verify health
curl http://localhost/api/v1/health/ready
```

## Configuration

### Secrets

Secrets are stored in `secrets/` and loaded via Docker secrets (not environment variables).

```bash
# Generate production secrets
openssl rand -hex 32 > secrets/app_secret.txt
openssl rand -hex 16 > secrets/db_password.txt

# Ensure proper permissions
chmod 600 secrets/*.txt
```

**Never commit secrets to git.** The `.gitignore` already excludes `secrets/*.txt`.

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DB_PASSWORD` | Yes | — | PostgreSQL password (must match `secrets/db_password.txt`) |
| `APP_SECRET` | Yes | — | Application secret (must match `secrets/app_secret.txt`) |
| `API_WORKERS` | No | `2` | Number of uvicorn workers |
| `HTTP_PORT` | No | `80` | Port exposed to the host |

### SQLite Alternative

For single-kiosk or offline deployments without PostgreSQL:

```bash
docker compose -f docker-compose.sqlite.prod.yml up -d --build
```

This uses a file-based SQLite database stored in a Docker volume. No `DB_PASSWORD` needed — only `secrets/app_secret.txt` is required.

## HTTPS / TLS

For internet-facing deployments, add TLS termination. Two options:

### Option A: External Reverse Proxy (Recommended)

Place nginx, Caddy, or a cloud load balancer in front of port 80:

```
Internet → [Cloudflare / ALB / nginx+certbot :443] → [touchctf edge :80]
```

### Option B: Certbot in Edge Container

Replace `edge/nginx.prod.conf` with a TLS-enabled version:

```nginx
server {
    listen 80;
    server_name ctf.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name ctf.example.com;

    ssl_certificate /etc/letsencrypt/live/ctf.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/ctf.example.com/privkey.pem;

    # ... rest of config
}
```

Then mount certbot volumes in `docker-compose.prod.yml` and add a certbot service.

### Kiosk Device: Trusted Certificates

If using self-signed certs on the kiosk:

1. Install the CA certificate in the Android/iOS trusted store
2. Or use a proper certificate from Let's Encrypt with DNS validation

## Firewall

```bash
# Allow only HTTP/SSH
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw enable
```

## Operations

### Health Checks

```bash
# Application health
curl http://localhost/api/v1/health/ready

# Container status
docker compose -f docker-compose.prod.yml ps
```

### Logs

```bash
# All services
docker compose -f docker-compose.prod.yml logs -f

# API only
docker compose -f docker-compose.prod.yml logs -f api

# Edge only
docker compose -f docker-compose.prod.yml logs -f edge
```

### Backup (PostgreSQL)

```bash
# Manual backup
./scripts/backup.sh ./backups

# List backups
ls -la backups/

# Automated daily backup (add to crontab)
0 2 * * * /opt/touchctf/scripts/backup.sh /opt/touchctf/backups >> /var/log/touchctf-backup.log 2>&1
```

### Backup (SQLite)

```bash
./scripts/backup-sqlite.sh ./backups
```

### Restore

```bash
./scripts/restore.sh ./backups/touchctf_20260922_020000.sql.gz
```

### Database Migration

Migrations run automatically on startup via the `migrate` service. To run manually:

```bash
docker compose -f docker-compose.prod.yml exec api alembic upgrade head
```

### Restart

```bash
# Full stack restart
docker compose -f docker-compose.prod.yml restart

# Single service
docker compose -f docker-compose.prod.yml restart api
```

### Update

```bash
git pull
cd ui && npm ci && npm run build && cd ..
docker compose -f docker-compose.prod.yml up -d --build
```

## Auto-Recovery

The `restart: unless-stopped` policy ensures containers restart automatically after:

- Docker daemon restart
- Host reboot (with Docker configured to start on boot)

```bash
# Ensure Docker starts on boot
sudo systemctl enable docker
sudo systemctl enable docker-compose.service  # if using systemd unit
```

### Systemd Unit (Optional)

Create `/etc/systemd/system/touchctf.service`:

```ini
[Unit]
Description=PSM TouchCTF
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/touchctf
ExecStart=/usr/bin/docker compose -f docker-compose.prod.yml up -d
ExecStop=/usr/bin/docker compose -f docker-compose.prod.yml down
TimeoutStartSec=120

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable touchctf
sudo systemctl start touchctf
```

## Android Touchscreen Kiosk Setup

### Prerequisites

- Android tablet with Chrome or a kiosk browser app
- LAN access to the TouchCTF server

### Steps

1. Open Chrome, navigate to `http://<server-ip>`
2. Open Chrome menu → **Add to Home Screen**
3. Install a kiosk browser app (e.g., Fully Kiosk Browser, Android kiosk mode)
4. Configure the kiosk app to:
   - Launch URL: `http://<server-ip>`
   - Lock to this app (disable Home, Back, Recent)
   - Auto-start on boot
5. Set screen timeout to "Never" and disable lock screen

### Chrome Kiosk Mode (via Intent)

```bash
# Launch Chrome in kiosk mode via ADB
adb shell am start -a android.intent.action.MAIN \
  -c android.intent.category.HOME \
  -n com.android.chrome/com.google.android.apps.chrome.Main \
  --es "org.chromium.chrome.browser.EXTRA_SPECIAL_URL" "http://<server-ip>"
```

## Ports Reference

| Service | Internal Port | External Port | Protocol |
|---------|--------------|---------------|----------|
| edge (nginx) | 80 | 80 (configurable via `HTTP_PORT`) | HTTP |
| api (FastAPI) | 8000 | — (internal only) | HTTP |
| db (PostgreSQL) | 5432 | — (internal only) | TCP |

Only port 80 (or 443 with TLS) is exposed. The database and API are internal to the Docker network.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `503 Service Unavailable` | Check `docker compose ps` — API may still be starting. Wait 30s. |
| `Connection refused` | Ensure port 80 is open: `sudo ufw allow 80/tcp` |
| `Database not ready` | Check PostgreSQL logs: `docker compose logs db` |
| `Admin login fails` | Verify admin user exists: `docker compose exec api python3 scripts/create_staff.py ...` |
| Slow first request | Normal — uvicorn worker startup. Subsequent requests are fast. |
| Container keeps restarting | Check logs: `docker compose logs <service>` |

## Architecture

```
┌─────────────────────────────────────────┐
│  Touchscreen Device (Android/iOS/PC)    │
│  http://<server-ip>                     │
└──────────────────┬──────────────────────┘
                   │
┌──────────────────▼──────────────────────┐
│  nginx edge (:80)                       │
│  • Static files (React SPA)            │
│  • /api → FastAPI proxy                │
│  • Security headers, rate limiting     │
└──────────────────┬──────────────────────┘
                   │
┌──────────────────▼──────────────────────┐
│  FastAPI (:8000)                        │
│  • Game engine, auth, scoring          │
│  • Admin panel, leaderboard            │
│  • Prize wheel, claims                 │
└──────────────────┬──────────────────────┘
                   │
┌──────────────────▼──────────────────────┐
│  PostgreSQL 17 (or SQLite)             │
│  • Sessions, challenges, prizes        │
│  • Persistent volume                   │
└─────────────────────────────────────────┘
```
