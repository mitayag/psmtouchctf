.PHONY: dev dev-api dev-ui build build-ui test test-api test-ui lint clean prod-up prod-down prod-logs backup restore migrate seed create-admin

# ── Development ──────────────────────────────────────────
dev:
	@echo "Starting dev servers (API :8000, UI :5173)..."
	cd api && DATABASE_URL="sqlite:///$$(pwd)/touchctf_dev.db" python3 -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 &
	cd ui && npm run dev

dev-api:
	cd api && DATABASE_URL="sqlite:///$$(pwd)/touchctf_dev.db" python3 -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

dev-ui:
	cd ui && npm run dev

# ── Build ────────────────────────────────────────────────
build: build-ui
	@echo "Build complete: ui/dist/"

build-ui:
	cd ui && npm ci && npm run build

# ── Test ─────────────────────────────────────────────────
test: test-api test-ui

test-api:
	cd api && python3 -m pytest tests/ -v

test-ui:
	cd ui && npx vitest run

lint:
	cd ui && npx oxlint

# ── Production (Docker) ─────────────────────────────────
prod-up:
	@echo "Building and starting production stack..."
	docker compose -f docker-compose.prod.yml up -d --build

prod-down:
	docker compose -f docker-compose.prod.yml down

prod-logs:
	docker compose -f docker-compose.prod.yml logs -f

prod-ps:
	docker compose -f docker-compose.prod.yml ps

# ── SQLite production ────────────────────────────────────
prod-sqlite-up:
	docker compose -f docker-compose.sqlite.prod.yml up -d --build

prod-sqlite-down:
	docker compose -f docker-compose.sqlite.prod.yml down

# ── Database ─────────────────────────────────────────────
migrate:
	cd api && alembic upgrade head

seed:
	cd api && python3 -c "from app.database import SessionLocal, engine, Base; from app import seed, engine as eng; Base.metadata.create_all(bind=engine); db=SessionLocal(); seed.seed(db); print('Seeded.'); db.close()"

create-admin:
	@read -p "Username: " user; \
	read -sp "Password: " pass; echo; \
	python3 scripts/create_staff.py "$$user" "$$pass" admin

# ── Backup / Restore ─────────────────────────────────────
backup:
	./scripts/backup.sh

restore:
	@read -p "Backup file: " file; \
	./scripts/restore.sh "$$file"

# ── Clean ────────────────────────────────────────────────
clean:
	rm -rf api/__pycache__ api/app/__pycache__ api/tests/__pycache__
	rm -rf ui/node_modules/ui/dist
	find . -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null || true
