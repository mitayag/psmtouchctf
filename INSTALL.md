# PSM TouchCTF — Installation Guide

## System Requirements

| Resource | Minimum | Recommended |
|----------|---------|-------------|
| CPU | 2 cores | 4 cores |
| RAM | 2 GB | 4 GB |
| Disk | 20 GB | 40 GB SSD |
| OS | Ubuntu 24.04 LTS | Ubuntu 24.04 LTS |
| Network | Port 80 (or custom) | Port 80 + HTTPS via reverse proxy |

## Prerequisites

- `git` installed (comes with Ubuntu: `apt install git`)
- SSH access to the VM
- Root or sudo privileges

## Installation

### 1. Clone the repository

```bash
git clone https://github.com/mitayag/psmtouchctf.git
cd psmtouchctf
```

For private repositories, authenticate first:

```bash
git clone https://github.com/mitayag/psmtouchctf.git  # prompts for credentials
# or with a personal access token:
# git clone https://<token>@github.com/mitayag/psmtouchctf.git
```

### 2. Run the installer

```bash
sudo bash install.sh
```

The frontend and API images are built inside Docker — Node.js does **not** need to be installed on the VM.

The installer will:

1. Validate your system (OS, memory, disk space)
2. Install Docker Engine and Compose plugin (if missing)
3. Generate secure secrets (app key + database password), preserving any existing ones
4. Build the API and frontend images **inside Docker** (Node.js is not required on the host)
5. Start the Docker stack and run Alembic migrations via the `migrate` service
6. Wait until the **api** service reports healthy and `/api/v1/health/ready` responds
7. Verify the frontend is served through the edge proxy
8. Seed challenge data through the `api` service (no `create_all`)
9. Ask for admin credentials and create the administrator securely
10. Print the application URL

Re-running the installer is safe: existing `.env`, `secrets/`, database volumes, and accounts are preserved.

**Options:**

| Flag | Description | Default |
|------|-------------|---------|
| `--port PORT` | HTTP port to expose | `80` |
| `--hostname HOST` | LAN hostname for display | none |
| `--sqlite` | Use SQLite instead of PostgreSQL | PostgreSQL |

Examples:

```bash
sudo bash install.sh                          # defaults, PostgreSQL on port 80
sudo bash install.sh --port 8080              # custom port
sudo bash install.sh --port 80 --hostname 192.168.1.100
sudo bash install.sh --sqlite                 # SQLite (single-kiosk mode)
```

### 3. Verify installation

```bash
# Check container health
docker compose -f docker-compose.prod.yml ps

# Test the health endpoint
curl http://localhost/healthz
# Expected: "healthy"

# Open in browser
# Player:   http://localhost/
# Admin:    http://localhost/admin
# Staff:    http://localhost/staff
```

## URLs

| Route | Purpose |
|-------|---------|
| `/` | Player home — start challenge, view leaderboard |
| `/admin` | Admin panel — login with the admin account created during install |
| `/staff` | Staff portal — claim code redemption |
| `/leaderboard` | Public leaderboard |

## Configuration

### Environment Variables

Edit `.env` to change settings:

| Variable | Description | Default |
|----------|-------------|---------|
| `DB_PASSWORD` | PostgreSQL password (must match `secrets/db_password.txt`) | auto-generated |
| `APP_SECRET` | Session signing key (must match `secrets/app_secret.txt`) | auto-generated |
| `APP_ENV` | `production` or `development` | `production` |
| `API_WORKERS` | Uvicorn worker count (cores - 1 recommended) | `2` |
| `HTTP_PORT` | Exposed HTTP port | `80` |

After changing `.env`, restart the stack:

```bash
docker compose -f docker-compose.prod.yml restart
```

### Secrets

Secrets are stored in `secrets/` with restrictive permissions (600):

- `secrets/app_secret.txt` — Application session key
- `secrets/db_password.txt` — PostgreSQL password

**Do not commit these files.** The `.gitignore` excludes them.

## Operations

### Start, Stop, Restart

```bash
# Start
docker compose -f docker-compose.prod.yml up -d

# Stop
docker compose -f docker-compose.prod.yml down

# Restart
docker compose -f docker-compose.prod.yml restart

# View status
docker compose -f docker-compose.prod.yml ps
```

### Logs

```bash
# Follow all logs
docker compose -f docker-compose.prod.yml logs -f

# API logs only
docker compose -f docker-compose.prod.yml logs -f api

# Last 100 lines
docker compose -f docker-compose.prod.yml logs --tail=100 api
```

### Database Operations

```bash
# Run migrations (usually automatic during install) — via the migrate service
docker compose -f docker-compose.prod.yml run --rm migrate

# Seed/re-seed challenge data (idempotent; schema comes from migrations only)
docker compose -f docker-compose.prod.yml exec -T api python3 -m app.seed
```

### Staff Management

Staff credentials are passed on **stdin** (NUL-separated) so the password never appears in process arguments or Python source:

```bash
# Create a new staff user
read -rsp "Password: " P; echo
printf '%s\0%s' "<username>" "$P" | docker compose -f docker-compose.prod.yml exec -T api python3 -m app.create_staff staff
unset P

# Roles: staff, admin, system_admin
```

### Backup and Restore

```bash
# PostgreSQL backup (creates timestamped .sql.gz file)
./scripts/backup.sh

# Restore from backup
./scripts/restore.sh backups/touchctf_YYYYMMDD_HHMMSS.sql.gz
```

## HTTPS Setup

The default installation uses plain HTTP. For production, add TLS:

**Option A: External reverse proxy (recommended)**

Place nginx/Apache/Caddy in front of port 80 with TLS termination.

**Option B: Certbot in edge container**

Edit `edge/nginx.prod.conf` to add port 443 and SSL directives, then mount certificates.

See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed TLS configuration.

## SQLite Alternative

For single-kiosk or offline deployments:

```bash
sudo bash install.sh --sqlite
```

This skips PostgreSQL and uses a file-based SQLite database. The compose file is `docker-compose.sqlite.prod.yml`.

## Updates

```bash
# 1. Back up first
./scripts/backup.sh

# 2. Pull latest changes
git pull

# 3. Rebuild and restart (frontend is rebuilt inside the edge image)
docker compose -f docker-compose.prod.yml up -d --build

# 4. Run any new migrations
docker compose -f docker-compose.prod.yml run --rm migrate
```

**Note:** Updates preserve staff accounts, prizes, and configuration. Player data is not affected.

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `503 Service Unavailable` | API container not healthy | `docker compose -f docker-compose.prod.yml logs api` |
| `Connection refused` | Container not started | `docker compose -f docker-compose.prod.yml up -d` |
| Port already in use | Another service on port 80 | Change port: `--port 8080` |
| `Event not found` | Database not seeded | Run `docker compose -f docker-compose.prod.yml exec -T api python3 -m app.seed` |
| Admin login fails | Wrong credentials | Create a new admin (see Staff Management above) |
| Slow first load | Uvicorn worker startup | Normal on first request; subsequent requests are fast |
| Frontend shows API error | API unreachable from edge | Check `docker compose -f docker-compose.prod.yml ps` — all services should be healthy |

## Uninstall

```bash
# Stop and remove containers
docker compose -f docker-compose.prod.yml down

# Remove volumes (WARNING: deletes all data)
docker compose -f docker-compose.prod.yml down -v

# Remove project files
cd .. && rm -rf psmtouchctf
```

**Docker and images are not removed** — this only cleans up the project.
