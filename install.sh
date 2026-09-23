#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# PSM TouchCTF — Ubuntu 24.04 LTS Installer
# Installs Docker, builds images (API + frontend inside Docker), starts the
# stack, verifies migrations/seed data, and creates the administrator.
#
# Usage:
#   sudo bash install.sh [--port PORT] [--hostname HOSTNAME] [--sqlite]
#
# Requirements: Ubuntu 24.04, 4 CPU cores, 4 GB RAM, 40 GB SSD, root/sudo.
#
# Safe to re-run: existing .env, secrets/, database volumes and accounts
# are always preserved.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Colour helpers ───────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()  { printf "${CYAN}[INFO]${NC}  %s\n" "$*"; }
ok()    { printf "${GREEN}[ OK ]${NC}  %s\n" "$*"; }
warn()  { printf "${YELLOW}[WARN]${NC}  %s\n" "$*"; }
die()   { printf "${RED}[FAIL]${NC}  %s\n" "$*" >&2; exit 1; }

validate_port() {
  [[ "$1" =~ ^[0-9]+$ ]] || die "Invalid port: $1 (must be a number)"
  (( $1 >= 1 && $1 <= 65535 )) || die "Invalid port: $1 (must be 1-65535)"
}

# ── Parse arguments ──────────────────────────────────────────────────────────
APP_PORT=80
PORT_EXPLICIT=false
HOSTNAME_ARG=""
USE_SQLITE=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --port)
      [[ $# -ge 2 ]] || die "--port requires a value"
      APP_PORT="$2"; PORT_EXPLICIT=true; shift 2 ;;
    --hostname)
      [[ $# -ge 2 ]] || die "--hostname requires a value"
      HOSTNAME_ARG="$2"; shift 2 ;;
    --sqlite)    USE_SQLITE=true; shift ;;
    -h|--help)
      echo "Usage: sudo bash install.sh [--port PORT] [--hostname HOSTNAME] [--sqlite]"
      echo ""
      echo "Options:"
      echo "  --port PORT        HTTP port (default: 80)"
      echo "  --hostname HOST    Server hostname for display"
      echo "  --sqlite           Use SQLite instead of PostgreSQL"
      echo ""
      echo "Re-running is safe: .env, secrets, database volumes and accounts are preserved."
      exit 0 ;;
    *) die "Unknown argument: $1" ;;
  esac
done
validate_port "$APP_PORT"

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
if [[ -n "$FREE_DISK_GB" && "$FREE_DISK_GB" =~ ^[0-9]+$ && $FREE_DISK_GB -lt 20 ]]; then
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
  docker info &>/dev/null || die "Docker installed but the daemon is not running."
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
  ok ".env already exists — preserving existing configuration"
  # Keep all settings; only honour an explicit --port change, otherwise
  # adopt the configured port so checks match what the stack will bind.
  ENV_PORT=$(sed -n 's/^HTTP_PORT=//p' "$ENV_FILE" | tail -n 1)
  if [[ "$PORT_EXPLICIT" == "true" ]]; then
    if [[ -z "$ENV_PORT" ]]; then
      printf '\nHTTP_PORT=%s\n' "$APP_PORT" >> "$ENV_FILE"
      chmod 600 "$ENV_FILE"
      ok "Added HTTP_PORT=${APP_PORT} to existing .env"
    elif [[ "$ENV_PORT" != "$APP_PORT" ]]; then
      ENV_TMP="${ENV_FILE}.tmp.$$"
      sed "s/^HTTP_PORT=.*/HTTP_PORT=${APP_PORT}/" "$ENV_FILE" > "$ENV_TMP"
      chmod 600 "$ENV_TMP"
      mv "$ENV_TMP" "$ENV_FILE"
      ok "Updated HTTP_PORT in .env: ${ENV_PORT} → ${APP_PORT} (all other settings preserved)"
    fi
  elif [[ -n "$ENV_PORT" ]]; then
    APP_PORT="$ENV_PORT"
    info "Using HTTP_PORT=${APP_PORT} from existing .env"
  fi
  validate_port "$APP_PORT"
fi

# ── Select compose file ─────────────────────────────────────────────────────
if [[ "$USE_SQLITE" == "true" ]]; then
  COMPOSE_FILE="docker-compose.sqlite.prod.yml"
  info "Using SQLite production configuration"
else
  COMPOSE_FILE="docker-compose.prod.yml"
  info "Using PostgreSQL production configuration"
fi
COMPOSE_FILE_PATH="${PROJECT_DIR}/${COMPOSE_FILE}"

compose() {
  docker compose -f "$COMPOSE_FILE_PATH" "$@"
}

compose_logs() {
  compose logs --tail=40 "$@" 2>/dev/null || true
}

# ── Validate compose configuration ──────────────────────────────────────────
info "Validating Docker Compose configuration..."
cd "$PROJECT_DIR"
if ! compose config --quiet 2>&1; then
  die "Invalid Docker Compose configuration in ${COMPOSE_FILE}"
fi
ok "Compose configuration is valid"

# ── Check port availability ─────────────────────────────────────────────────
# Distinguishes three cases:
#   1. Port free                     → proceed
#   2. Port held by our edge service → repeat install; it will be re-created
#   3. Port held by something else   → fail with details
# A grep "no match" (exit 1) is the expected free-port result and must not
# abort the script; only genuine ss/netstat inspection failures are fatal.
inspect_port_listener() {
  local listing=""
  if command -v ss &>/dev/null; then
    if ! listing=$(ss -tlnp 2>/dev/null); then
      die "Failed to inspect listening TCP ports with 'ss'."
    fi
  elif command -v netstat &>/dev/null; then
    if ! listing=$(netstat -tlnp 2>/dev/null); then
      die "Failed to inspect listening TCP ports with 'netstat'."
    fi
  else
    warn "Neither 'ss' nor 'netstat' is available — skipping port inspection."
    PORT_LISTENER=""
    return 0
  fi
  PORT_LISTENER=$(printf '%s\n' "$listing" | grep -E ":${APP_PORT}([[:space:]]|$)" | head -n 1 || true)
}

inspect_port_listener

if [[ -n "$PORT_LISTENER" ]]; then
  OWNED_BY_US=false
  EDGE_CID=$(compose ps -q edge 2>/dev/null | head -n 1 || true)
  if [[ -n "$EDGE_CID" ]] && [[ "$(docker inspect -f '{{.State.Running}}' "$EDGE_CID" 2>/dev/null || echo false)" == "true" ]]; then
    EDGE_BINDINGS=$(docker inspect -f '{{range $p, $b := .HostConfig.PortBindings}}{{range $b}}{{.HostPort}} {{end}}{{end}}' "$EDGE_CID" 2>/dev/null || true)
    case " ${EDGE_BINDINGS} " in
      *" ${APP_PORT} "*) OWNED_BY_US=true ;;
    esac
  fi
  if [[ "$OWNED_BY_US" == "true" ]]; then
    info "Port ${APP_PORT} is held by the existing PSM TouchCTF edge service — it will be re-created."
  else
    warn "Port ${APP_PORT} is already in use: ${PORT_LISTENER}"
    die "Choose a different port with --port PORT"
  fi
else
  ok "Port ${APP_PORT} is available"
fi

# ── Frontend ────────────────────────────────────────────────────────────────
info "Frontend will be built inside Docker (multi-stage edge image) — Node.js is not required on the host."

# ── Start the stack ─────────────────────────────────────────────────────────
info "Starting application stack (builds API + frontend images, runs migrations)..."

# Stop any existing stack gracefully. Named volumes are NOT removed,
# so database data and accounts survive reinstallation.
compose down 2>/dev/null || true

if ! compose up -d --build --remove-orphans; then
  compose_logs
  die "Failed to start the application stack. See logs above."
fi
ok "Stack started"

# ── Verify migrations (via the migrate service, never create_all) ──────────
info "Verifying database migrations..."

MIGRATE_CID=$(compose ps -aq migrate 2>/dev/null | head -n 1 || true)
if [[ -z "$MIGRATE_CID" ]]; then
  compose_logs
  die "Migration service did not run. Check: docker compose -f ${COMPOSE_FILE} logs migrate"
fi

MIGRATE_WAITED=0
while true; do
  MIGRATE_STATE=$(docker inspect -f '{{.State.Status}}' "$MIGRATE_CID" 2>/dev/null || echo "missing")
  if [[ "$MIGRATE_STATE" == "missing" ]]; then
    compose_logs migrate
    die "Migration container disappeared before completing."
  fi
  if [[ "$MIGRATE_STATE" != "running" && "$MIGRATE_STATE" != "created" ]]; then
    break
  fi
  if [[ $MIGRATE_WAITED -ge 300 ]]; then
    compose_logs migrate
    die "Database migration did not finish within 300s."
  fi
  sleep 5
  MIGRATE_WAITED=$((MIGRATE_WAITED + 5))
  printf "."
done
echo ""

MIGRATE_EXIT=$(docker inspect -f '{{.State.ExitCode}}' "$MIGRATE_CID")
if [[ "$MIGRATE_EXIT" != "0" ]]; then
  compose_logs migrate
  die "Database migration failed (exit code ${MIGRATE_EXIT})."
fi
ok "Database migrations completed successfully (alembic upgrade head)"

# ── Wait for the API service (explicit service, exact health match) ────────
info "Waiting for the API service to become healthy..."

API_CID=""
API_HEALTHY=false
UNHEALTHY_WARNED=false
MAX_WAIT=180
WAITED=0

while [[ $WAITED -lt $MAX_WAIT ]]; do
  API_CID=$(compose ps -aq api 2>/dev/null | head -n 1 || true)
  if [[ -n "$API_CID" ]]; then
    API_STATE=$(docker inspect -f '{{.State.Status}}' "$API_CID" 2>/dev/null || true)
    API_HEALTH=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$API_CID" 2>/dev/null || true)

    if [[ "$API_STATE" == "exited" || "$API_STATE" == "dead" ]]; then
      compose_logs api
      die "API container stopped (state: ${API_STATE})."
    fi

    # Exact match only — 'unhealthy' must never be treated as healthy.
    if [[ "$API_HEALTH" == "healthy" ]]; then
      API_HEALTHY=true
      break
    fi
    if [[ "$API_HEALTH" == "unhealthy" && "$UNHEALTHY_WARNED" == "false" ]]; then
      warn "API health probe is failing (continuing to wait)..."
      UNHEALTHY_WARNED=true
    fi
  fi

  sleep 5
  WAITED=$((WAITED + 5))
  printf "."
done
echo ""

if [[ "$API_HEALTHY" != "true" ]]; then
  compose_logs api db migrate
  die "API service did not become healthy within ${MAX_WAIT}s."
fi
ok "API service is healthy"

# ── Verify API readiness directly (not the edge /healthz) ──────────────────
info "Verifying API readiness directly (API + database)..."

if ! docker exec "$API_CID" python3 -c "import urllib.request; r = urllib.request.urlopen('http://localhost:8000/api/v1/health/ready', timeout=5); raise SystemExit(0 if r.status == 200 else 1)"; then
  compose_logs api
  die "API readiness check failed inside the api container (/api/v1/health/ready)."
fi
ok "API is ready and the database connection works"

# ── Verify frontend (edge) availability end-to-end ─────────────────────────
info "Waiting for the edge (frontend) service..."

frontend_ok() {
  curl -sf --max-time 5 "http://localhost:${APP_PORT}/healthz" >/dev/null 2>&1 || return 1
  curl -sf --max-time 5 "http://localhost:${APP_PORT}/" 2>/dev/null | grep -q 'id="root"' || return 1
  curl -sf --max-time 5 "http://localhost:${APP_PORT}/api/v1/health/ready" >/dev/null 2>&1 || return 1
  return 0
}

EDGE_READY=false
EDGE_WAITED=0
EDGE_MAX_WAIT=90
while [[ $EDGE_WAITED -lt $EDGE_MAX_WAIT ]]; do
  EDGE_CID=$(compose ps -aq edge 2>/dev/null | head -n 1 || true)
  if [[ -n "$EDGE_CID" ]]; then
    EDGE_STATE=$(docker inspect -f '{{.State.Status}}' "$EDGE_CID" 2>/dev/null || true)
    if [[ "$EDGE_STATE" == "exited" || "$EDGE_STATE" == "dead" ]]; then
      compose_logs edge
      die "Edge container stopped (state: ${EDGE_STATE})."
    fi
  fi
  if frontend_ok; then
    EDGE_READY=true
    break
  fi
  sleep 5
  EDGE_WAITED=$((EDGE_WAITED + 5))
  printf "."
done
echo ""

if [[ "$EDGE_READY" != "true" ]]; then
  curl -sf --max-time 5 "http://localhost:${APP_PORT}/healthz" >/dev/null 2>&1 \
    || warn "Edge /healthz is not responding on port ${APP_PORT}."
  curl -sf --max-time 5 "http://localhost:${APP_PORT}/" 2>/dev/null | grep -q 'id="root"' \
    || warn "Frontend index was not served — the edge image build may have failed."
  curl -sf --max-time 5 "http://localhost:${APP_PORT}/api/v1/health/ready" >/dev/null 2>&1 \
    || warn "API readiness through the edge proxy failed."
  compose_logs edge api
  die "Frontend/API verification failed on port ${APP_PORT}."
fi
ok "Frontend and API are available through the edge proxy"

# ── Seed challenge data (via the api service, no create_all) ──────────────
info "Seeding challenge data..."

if ! SEED_OUTPUT=$(compose exec -T api python3 -m app.seed 2>&1); then
  compose_logs api
  die "Seeding failed: ${SEED_OUTPUT}"
fi
ok "Challenge data seeded"

# Verify seed data is actually present
if ! PUBLISHABLE=$(compose exec -T api python3 -c 'from app.database import SessionLocal
from app.models import ChallengeRevision
db = SessionLocal()
try:
    print(db.query(ChallengeRevision).filter(ChallengeRevision.published == True).count())
finally:
    db.close()' 2>&1); then
  die "Seed verification query failed: ${PUBLISHABLE}"
fi
PUBLISHABLE=$(printf '%s' "$PUBLISHABLE" | tr -cd '0-9')
if [[ -z "$PUBLISHABLE" || "$PUBLISHABLE" -le 0 ]]; then
  die "Seed verification failed: no published challenges found in the database."
fi
ok "Seed verification passed: ${PUBLISHABLE} published challenge(s) in the database"

# ── Create admin user ───────────────────────────────────────────────────────
echo ""
info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
info "  Initial System Administrator Setup"
info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if ! EXISTING_ADMINS=$(compose exec -T api python3 -m app.count_admins 2>&1); then
  die "Could not query existing administrators: ${EXISTING_ADMINS}"
fi
EXISTING_ADMINS=$(printf '%s' "$EXISTING_ADMINS" | tr -cd '0-9')

ADMIN_CREATED=false
CREATE_ADMIN=true
if [[ -n "$EXISTING_ADMINS" && "$EXISTING_ADMINS" -gt 0 ]]; then
  info "Found ${EXISTING_ADMINS} existing system administrator account(s) — preserved."
  if ! read -rp "Create an additional system administrator? [y/N]: " ADDITIONAL; then
    echo ""
    ADDITIONAL=""
  fi
  if [[ ! "${ADDITIONAL:-}" =~ ^[Yy] ]]; then
    CREATE_ADMIN=false
    ok "Keeping existing administrator account(s)"
  fi
fi

while [[ "$CREATE_ADMIN" == "true" && "$ADMIN_CREATED" == "false" ]]; do
  if ! read -rp "Admin username [admin]: " ADMIN_USER; then
    die "Input closed before administrator credentials were provided."
  fi
  ADMIN_USER="${ADMIN_USER:-admin}"

  if ! read -rsp "Admin password: " ADMIN_PASS; then
    echo ""
    die "Input closed before administrator credentials were provided."
  fi
  echo ""
  if [[ -z "$ADMIN_PASS" ]]; then
    warn "Password cannot be empty."
    continue
  fi

  if ! read -rsp "Confirm password: " ADMIN_PASS_CONFIRM; then
    echo ""
    die "Input closed before administrator credentials were provided."
  fi
  echo ""
  if [[ "$ADMIN_PASS" != "$ADMIN_PASS_CONFIRM" ]]; then
    warn "Passwords do not match. Try again."
    continue
  fi

  if [[ ${#ADMIN_PASS} -lt 8 ]]; then
    warn "Password must be at least 8 characters."
    continue
  fi

  # Credentials travel as NUL-separated stdin — never in process arguments,
  # environment variables, or interpolated Python source. printf is a bash
  # builtin, so the password never appears in any process command line.
  if CREATE_OUTPUT=$(printf '%s\0%s' "$ADMIN_USER" "$ADMIN_PASS" | compose exec -T api python3 -m app.create_staff system_admin 2>&1); then
    if printf '%s' "$CREATE_OUTPUT" | grep -q "^OK:"; then
      ok "System administrator '${ADMIN_USER}' created successfully"
      ADMIN_CREATED=true
    else
      warn "Failed to create admin: ${CREATE_OUTPUT}"
      if ! read -rp "Try again? [Y/n]: " RETRY; then
        RETRY="n"
      fi
      RETRY="${RETRY:-Y}"
      if [[ ! "${RETRY^^}" =~ ^Y ]]; then
        warn "Skipping administrator creation. Create one later with:"
        warn "  read -rsp 'Password: ' P; echo; printf '%s\\0%s' '<user>' \"\$P\" | docker compose -f ${COMPOSE_FILE} exec -T api python3 -m app.create_staff system_admin"
        break
      fi
    fi
  else
    warn "Failed to create admin: ${CREATE_OUTPUT}"
    if ! read -rp "Try again? [Y/n]: " RETRY; then
      RETRY="n"
    fi
    RETRY="${RETRY:-Y}"
    if [[ ! "${RETRY^^}" =~ ^Y ]]; then
      warn "Skipping administrator creation. Create one later with:"
      warn "  read -rsp 'Password: ' P; echo; printf '%s\\0%s' '<user>' \"\$P\" | docker compose -f ${COMPOSE_FILE} exec -T api python3 -m app.create_staff system_admin"
      break
    fi
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

if [[ "$ADMIN_CREATED" != "true" && "$CREATE_ADMIN" == "true" ]]; then
  warn "No administrator was created. Create one before using the admin panel:"
  warn "  read -rsp 'Password: ' P; echo; printf '%s\\0%s' '<user>' \"\$P\" | docker compose -f ${COMPOSE_FILE} exec -T api python3 -m app.create_staff system_admin"
  echo ""
elif [[ "$CREATE_ADMIN" == "false" ]]; then
  info "Existing administrator account(s) preserved."
  echo ""
fi

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
echo "    Stop:           docker compose -f ${COMPOSE_FILE} down      (data is preserved)"
echo "    Restart:        docker compose -f ${COMPOSE_FILE} restart"
echo "    Backup DB:      ./scripts/backup.sh"
echo "    Create staff:   see INSTALL.md → Staff Management"
echo ""
echo "  See INSTALL.md for full documentation."
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
