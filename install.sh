#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# PSM TouchCTF — Ubuntu 24.04 LTS Installer
# Installs Docker, builds images, starts the stack, seeds data, creates admin.
#
# Usage:
#   sudo bash install.sh [--port PORT] [--hostname HOSTNAME] [--sqlite]
#
# Requirements: Ubuntu 24.04, 4 CPU cores, 4 GB RAM, 40 GB SSD, root/sudo.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Colour helpers ───────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()  { printf "${CYAN}[INFO]${NC}  %s\n" "$*"; }
ok()    { printf "${GREEN}[ OK ]${NC}  %s\n" "$*"; }
warn()  { printf "${YELLOW}[WARN]${NC}  %s\n" "$*"; }
die()   { printf "${RED}[FAIL]${NC}  %s\n" "$*" >&2; exit 1; }

# ── Parse arguments ──────────────────────────────────────────────────────────
APP_PORT=80
HOSTNAME_ARG=""
USE_SQLITE=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --port)      APP_PORT="$2"; shift 2 ;;
    --hostname)  HOSTNAME_ARG="$2"; shift 2 ;;
    --sqlite)    USE_SQLITE=true; shift ;;
    -h|--help)
      echo "Usage: sudo bash install.sh [--port PORT] [--hostname HOSTNAME] [--sqlite]"
      echo ""
      echo "Options:"
      echo "  --port PORT        HTTP port (default: 80)"
      echo "  --hostname HOST    Server hostname for display"
      echo "  --sqlite           Use SQLite instead of PostgreSQL"
      exit 0 ;;
    *) die "Unknown argument: $1" ;;
  esac
done

# ── Pre-flight checks ───────────────────────────────────────────────────────
info "PSM TouchCTF Installer"
echo ""

# Must be root
if [[ $EUID -ne 0 ]]; then
  die "This installer must be run as root. Use: sudo bash install.sh"
fi

# Must be Ubuntu 24.04
if [[ -f /etc/os-release ]]; then
  . /etc/os-release
  if [[ "$ID" != "ubuntu" || "$VERSION_ID" != "24.04" ]]; then
    warn "Detected $ID $VERSION_ID. This installer targets Ubuntu 24.04."
    warn "Proceeding anyway — some steps may differ."
  fi
else
  warn "Cannot detect OS. Assuming Ubuntu-compatible system."
fi

# Check available memory (warn if < 3 GB)
TOTAL_MEM_KB=$(grep MemTotal /proc/meminfo 2>/dev/null | awk '{print $2}' || echo 0)
TOTAL_MEM_GB=$(( TOTAL_MEM_KB / 1024 / 1024 ))
if [[ $TOTAL_MEM_GB -lt 3 ]]; then
  warn "System has ${TOTAL_MEM_GB} GB RAM. Recommended minimum is 4 GB."
fi

# Check disk space (warn if < 20 GB free)
FREE_DISK_GB=$(df -BG / | awk 'NR==2{print $4}' | tr -d 'G')
if [[ $FREE_DISK_GB -lt 20 ]]; then
  warn "Only ${FREE_DISK_GB} GB free disk space. Recommended minimum is 40 GB."
fi

ok "Pre-flight checks passed"

# ── Install Docker ───────────────────────────────────────────────────────────
info "Checking for Docker..."

if command -v docker &>/dev/null && docker info &>/dev/null 2>&1; then
  ok "Docker is already installed: $(docker --version)"
else
  info "Installing Docker Engine..."

  # Remove old versions if present
  apt-get remove -y docker docker-engine docker.io containerd runc 2>/dev/null || true

  # Install prerequisites
  apt-get update -qq
  apt-get install -y -qq ca-certificates curl gnupg

  # Add Docker GPG key and repo
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    > /etc/apt/sources.list.d/docker.list

  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

  systemctl enable docker
  systemctl start docker
  ok "Docker installed: $(docker --version)"
fi

# Verify Compose plugin
if docker compose version &>/dev/null; then
  ok "Docker Compose plugin: $(docker compose version --short)"
else
  die "Docker Compose plugin not found. Install docker-compose-plugin manually."
fi

# ── Generate secrets ────────────────────────────────────────────────────────
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SECRETS_DIR="${PROJECT_DIR}/secrets"
mkdir -p "$SECRETS_DIR"
chmod 700 "$SECRETS_DIR"

APP_SECRET_FILE="${SECRETS_DIR}/app_secret.txt"
DB_PASSWORD_FILE="${SECRETS_DIR}/db_password.txt"

if [[ ! -f "$APP_SECRET_FILE" ]]; then
  openssl rand -hex 32 > "$APP_SECRET_FILE"
  chmod 600 "$APP_SECRET_FILE"
  ok "Generated app secret"
else
  ok "App secret already exists — preserving"
fi

if [[ "$USE_SQLITE" == "false" ]]; then
  if [[ ! -f "$DB_PASSWORD_FILE" ]]; then
    openssl rand -hex 16 > "$DB_PASSWORD_FILE"
    chmod 600 "$DB_PASSWORD_FILE"
    ok "Generated database password"
  else
    ok "Database password already exists — preserving"
  fi
fi

# ── Configure application ───────────────────────────────────────────────────
ENV_FILE="${PROJECT_DIR}/.env"
ENV_EXAMPLE="${PROJECT_DIR}/.env.prod.example"

if [[ ! -f "$ENV_FILE" ]]; then
  DB_PASSWORD_VALUE=""
  if [[ "$USE_SQLITE" == "false" ]]; then
    DB_PASSWORD_VALUE=$(cat "$DB_PASSWORD_FILE")
  fi

  cat > "$ENV_FILE" <<ENVEOF
# PSM TouchCTF Production Configuration
# Generated by install.sh on $(date -u +%Y-%m-%dT%H:%M:%SZ)

DB_PASSWORD=${DB_PASSWORD_VALUE}
APP_ENV=production
API_WORKERS=2
HTTP_PORT=${APP_PORT}
ENVEOF
  chmod 600 "$ENV_FILE"
  ok "Created .env configuration"
else
  ok ".env already exists — preserving"
fi

# ── Select compose file ─────────────────────────────────────────────────────
if [[ "$USE_SQLITE" == "true" ]]; then
  COMPOSE_FILE="docker-compose.sqlite.prod.yml"
  info "Using SQLite production configuration"
else
  COMPOSE_FILE="docker-compose.prod.yml"
  info "Using PostgreSQL production configuration"
fi

# ── Check port availability ─────────────────────────────────────────────────
if command -v ss &>/dev/null; then
  PORT_USER=$(ss -tlnp 2>/dev/null | grep ":${APP_PORT} " | head -1)
elif command -v netstat &>/dev/null; then
  PORT_USER=$(netstat -tlnp 2>/dev/null | grep ":${APP_PORT} " | head -1)
else
  PORT_USER=""
fi

if [[ -n "$PORT_USER" ]]; then
  die "Port ${APP_PORT} is already in use: ${PORT_USER}\nChoose a different port with --port PORT"
fi
ok "Port ${APP_PORT} is available"

# ── Validate compose configuration ──────────────────────────────────────────
info "Validating Docker Compose configuration..."
cd "$PROJECT_DIR"
if ! docker compose -f "$COMPOSE_FILE" config --quiet 2>&1; then
  die "Invalid Docker Compose configuration in ${COMPOSE_FILE}"
fi
ok "Compose configuration is valid"

# ── Build frontend (required for nginx serving) ─────────────────────────────
UI_DIST="${PROJECT_DIR}/ui/dist"
if [[ ! -d "$UI_DIST" ]]; then
  info "Building frontend..."
  if command -v node &>/dev/null && command -v npm &>/dev/null; then
    cd "${PROJECT_DIR}/ui"
    npm ci --silent
    npm run build --silent
    cd "$PROJECT_DIR"
    ok "Frontend built successfully"
  else
    info "Node.js not found on host — frontend will be built inside Docker during image build."
  fi
else
  ok "Frontend build already exists"
fi

# ── Start the stack ─────────────────────────────────────────────────────────
info "Starting application stack..."

# Stop any existing stack gracefully
docker compose -f "$COMPOSE_FILE" down 2>/dev/null || true

# Start new stack
docker compose -f "$COMPOSE_FILE" up -d --build --remove-orphans
ok "Stack started"

# ── Wait for health ─────────────────────────────────────────────────────────
info "Waiting for application to become healthy..."

MAX_WAIT=120
WAITED=0
HEALTHY=false

while [[ $WAITED -lt $MAX_WAIT ]]; do
  # Check if the API container is healthy
  API_HEALTH=$(docker compose -f "$COMPOSE_FILE" ps --format json 2>/dev/null | grep -o '"Health":"[^"]*"' | head -1 || echo "")
  if echo "$API_HEALTH" | grep -q "healthy"; then
    HEALTHY=true
    break
  fi

  # Also try direct HTTP check
  if curl -sf "http://localhost:${APP_PORT}/healthz" >/dev/null 2>&1; then
    HEALTHY=true
    break
  fi

  sleep 5
  WAITED=$((WAITED + 5))
  printf "."
done
echo ""

if [[ "$HEALTHY" == "true" ]]; then
  ok "Application is healthy"
else
  warn "Health check timed out after ${MAX_WAIT}s. Checking container logs..."
  docker compose -f "$COMPOSE_FILE" logs --tail=30
  warn "The application may still be starting. Check logs with:"
  warn "  docker compose -f ${COMPOSE_FILE} logs -f"
fi

# ── Seed challenge data ─────────────────────────────────────────────────────
info "Seeding challenge data..."

# Run the seed command inside the API container
API_CONTAINER=$(docker compose -f "$COMPOSE_FILE" ps -q 2>/dev/null | head -1 || echo "")
if [[ -n "$API_CONTAINER" ]]; then
  SEED_OUTPUT=$(docker exec "$API_CONTAINER" python3 -c "
from app.database import SessionLocal, engine, Base
from app import seed
Base.metadata.create_all(bind=engine)
db = SessionLocal()
try:
    result = seed.seed(db)
    print(result)
except Exception as e:
    print(f'Seed error: {e}')
finally:
    db.close()
" 2>&1) || true
  if echo "$SEED_OUTPUT" | grep -qi "error"; then
    warn "Seed output: ${SEED_OUTPUT}"
  else
    ok "Challenge data seeded"
  fi
else
  warn "Could not find API container for seeding. Run manually after startup."
fi

# ── Create admin user ───────────────────────────────────────────────────────
echo ""
info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
info "  Initial System Administrator Setup"
info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

ADMIN_CREATED=false
while [[ "$ADMIN_CREATED" == "false" ]]; do
  read -rp "Admin username [admin]: " ADMIN_USER
  ADMIN_USER="${ADMIN_USER:-admin}"

  read -rsp "Admin password: " ADMIN_PASS
  echo ""
  if [[ -z "$ADMIN_PASS" ]]; then
    warn "Password cannot be empty."
    continue
  fi

  read -rsp "Confirm password: " ADMIN_PASS_CONFIRM
  echo ""
  if [[ "$ADMIN_PASS" != "$ADMIN_PASS_CONFIRM" ]]; then
    warn "Passwords do not match. Try again."
    continue
  fi

  if [[ ${#ADMIN_PASS} -lt 8 ]]; then
    warn "Password must be at least 8 characters."
    continue
  fi

  # Create admin via the running API container
  if [[ -n "$API_CONTAINER" ]]; then
    CREATE_OUTPUT=$(docker exec "$API_CONTAINER" python3 -c "
from app.database import SessionLocal, Base
from app.engine import create_staff_user
Base.metadata.create_all(bind=__import__('app.database', fromlist=['engine']).engine)
db = SessionLocal()
try:
    user = create_staff_user(db, '${ADMIN_USER}', '${ADMIN_PASS}', 'system_admin')
    print(f'OK:{user.username}:{user.role.value}')
except Exception as e:
    print(f'ERROR:{e}')
finally:
    db.close()
" 2>&1) || true

    if echo "$CREATE_OUTPUT" | grep -q "^OK:"; then
      ok "System administrator '${ADMIN_USER}' created successfully"
      ADMIN_CREATED=true
    else
      ERROR_MSG=$(echo "$CREATE_OUTPUT" | grep "ERROR:" | cut -d: -f2- || echo "Unknown error")
      warn "Failed to create admin: ${ERROR_MSG}"
      read -rp "Try again? [Y/n]: " RETRY
      RETRY="${RETRY:-Y}"
      if [[ "${RETRY^^}" != "Y" ]]; then
        warn "Skipping admin creation. Create manually later with:"
        warn "  docker exec \$(docker compose -f ${COMPOSE_FILE} ps -q | head -1) python3 -c \"...\""
        break
      fi
    fi
  else
    warn "API container not found. Skipping admin creation."
    break
  fi
done

# ── Print summary ───────────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
info "Installation complete!"
echo ""
echo "  Application URL:  http://localhost:${APP_PORT}"
echo "  Admin panel:      http://localhost:${APP_PORT}/admin"
echo "  Staff portal:     http://localhost:${APP_PORT}/staff"
echo ""

if [[ -n "$HOSTNAME_ARG" ]]; then
  info "LAN URL (other devices): http://${HOSTNAME_ARG}:${APP_PORT}"
  echo ""
fi

echo "  Compose file:     ${COMPOSE_FILE}"
echo "  Project dir:      ${PROJECT_DIR}"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  Quick commands:"
echo ""
echo "    View logs:      docker compose -f ${COMPOSE_FILE} logs -f"
echo "    Stop:           docker compose -f ${COMPOSE_FILE} down"
echo "    Restart:        docker compose -f ${COMPOSE_FILE} restart"
echo "    Backup DB:      ./scripts/backup.sh"
echo "    Create staff:   docker exec \$(docker compose -f ${COMPOSE_FILE} ps -q | head -1) python3 /app/scripts/create_staff.py <user> <pass> <role>"
echo ""
echo "  See INSTALL.md for full documentation."
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
