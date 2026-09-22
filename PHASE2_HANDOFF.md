# PSM TouchCTF — Phase 2 Handoff

Date: 21 September 2026

## 1. Summary

Phase 2 replaces Phase 1's frontend-only demo gameplay with a server-authoritative game engine backed by persistent storage.

### What now works
- FastAPI backend under `/api/v1/` with typed Pydantic validation.
- PostgreSQL default and SQLite single-kiosk alternatives via Docker Compose.
- Alembic migrations and a seed command that imports all 20 challenges without duplicating or erasing history.
- Real sessions, challenge selection, answer validation, scoring, timer, final flag capture, and results persistence.
- Frontend integration using the same Phase 1 screens, with API-driven state and a shared `StatusOverlay` for loading and connection errors.
- 10 backend engine tests covering the 398-point example, failures, skips, expiry, idempotency, ownership, and answer-key privacy.
- Browser verification scripts that complete a full qualifying round through the real API.

### What remains mocked/deferred
- Prize wheel draws, inventory, reservations, claim codes, and redemption (Phase 3).
- Staff authentication and admin panel (Phase 4).
- Production TLS, backups, load testing, and VM deployment hardening (Phase 5).
- The public leaderboard queries real sessions only for the current player; fixture leaderboard entries are no longer presented as live results.

## 2. Architecture

```text
Android kiosk / admin browser
          │ HTTP 5173 (local dev) or 80/443 (production)
          ▼
   edge: Nginx + compiled React assets
          │ /api → api:8000
          ▼
   api: FastAPI + SQLAlchemy + Alembic
          │
          ├── PostgreSQL db:5432 → named volume (compose.postgres.yml)
          └── SQLite /data/touchctf.db → named volume (compose.sqlite.yml)
```

## 3. Project layout

```
api/
  app/
    main.py           # FastAPI app, middleware, routers
    config.py         # Pydantic settings
    database.py       # SQLAlchemy engine/session/base
    models.py         # Database models
    schemas.py        # Pydantic request/response schemas
    engine.py         # Game engine: selection, validation, scoring, capture
    seed.py           # Seed event, ruleset, and 20 challenges
  alembic/            # Alembic migrations
  tests/              # Pytest backend tests
  Dockerfile
  requirements.txt
ui/
  src/services/api.ts # Real API client
  src/hooks/useGameSession.ts  # Updated to use API
  src/screens/...     # Minor updates for API state
edge/
  nginx.conf
compose.postgres.yml
compose.sqlite.yml
.env.example
secrets/              # Example secret files (change in production)
```

## 4. Setup, migration, seed, start, and stop

### Local development (no Docker)

Backend:
```bash
cd api
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# SQLite
export DATABASE_BACKEND=sqlite
export SQLITE_PATH=/tmp/touchctf.db
alembic upgrade head
python -m app.seed
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Frontend (in another terminal):
```bash
cd ui
npm install
npm run dev
# Opens http://localhost:5173, proxies /api to localhost:8000
```

Run backend tests:
```bash
cd api
pytest tests/test_engine.py -v
```

Run frontend tests:
```bash
cd ui
npm test
```

### Docker Compose — SQLite (single kiosk)

```bash
# Build frontend first
cd ui
npm run build
cd ..

# Start
docker compose -f compose.sqlite.yml up --build -d

# Seed if first time (migrations run automatically; seed runs via API lifespan)
docker compose -f compose.sqlite.yml exec api python -m app.seed

# Stop
docker compose -f compose.sqlite.yml down
```

### Docker Compose — PostgreSQL

```bash
cd ui
npm run build
cd ..

# Ensure secrets exist (edit contents for production)
mkdir -p secrets
printf 'change-me-in-production' > secrets/app_secret.txt
printf 'touchctf' > secrets/db_password.txt

# Ensure the Docker Compose interpolation variable is set
printf 'DB_PASSWORD=touchctf\n' > .env

# Start
docker compose -f compose.postgres.yml up --build -d

# Stop
docker compose -f compose.postgres.yml down
```

### Reset database (destructive)

```bash
# SQLite
docker compose -f compose.sqlite.yml down -v

# PostgreSQL
docker compose -f compose.postgres.yml down -v
```

## 5. URLs

- Local development UI: `http://localhost:5173/`
- Local development API: `http://localhost:8000/`
- Docker Compose UI/API: `http://localhost:5173/`
- Health live: `GET /api/v1/health/live`
- Health ready: `GET /api/v1/health/ready`
- Public config: `GET /api/v1/public/config`

## 6. API endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/v1/public/config` | Public event config |
| GET | `/api/v1/public/event` | Event status and qualification text |
| POST | `/api/v1/sessions` | Create session |
| POST | `/api/v1/sessions/{id}/begin` | Start timer |
| GET | `/api/v1/sessions/{id}` | Get authorized session state |
| POST | `/api/v1/sessions/{id}/answers` | Submit answer |
| POST | `/api/v1/sessions/{id}/hints` | Request hint |
| POST | `/api/v1/sessions/{id}/skip` | Skip challenge |
| POST | `/api/v1/sessions/{id}/capture` | Capture final flag |
| GET | `/api/v1/sessions/{id}/results` | Final results |
| POST | `/api/v1/sessions/{id}/abandon` | Abandon round |
| GET | `/api/v1/leaderboard` | Leaderboard placeholder |
| GET | `/api/v1/health/live` | Liveness |
| GET | `/api/v1/health/ready` | DB readiness |

All mutations require an `idempotency_key` in the request body and a `kiosk-credential` header.

## 7. Manual test checklist

1. Start the stack (Docker SQLite or local dev).
2. Open `http://localhost:5173/` and confirm the home screen loads event info from `/api/v1/public/event`.
3. Tap **Start challenge**, enter a nickname, and tap **Ready to begin**.
4. Confirm the round has three unique challenges: one Phishing, one Log, one Decode, in random order.
5. Complete the three challenges using touch/pointer only.
6. Submit an incorrect answer, then correct; verify the 10-point deduction and feedback.
7. Use a hint and verify the 25-point deduction.
8. Skip a challenge and confirm it scores zero.
9. On the flag-capture screen, tap **Assemble flag → Capture flag**.
10. View results and confirm score breakdown.
11. Verify the 398-point example: three solves, one hint, one prior wrong attempt, and ~60 seconds remaining in a 180-second round should yield **398** points.
12. Refresh mid-round and confirm the same challenges and original timer resume.
13. Abandon a round and confirm it is excluded from live results.
14. Complete a round with fewer than two solves and confirm no prize qualification.
15. Complete a round with two solves and a timely capture and confirm **Prize spin unlocked**.
16. Enable sound and confirm audio feedback on button presses and correct/incorrect answers.
17. Enable reduced motion and confirm the confetti/wheel animations are suppressed.
18. Resize the browser to 1920×1080, 1366×768, 1280×720, and 390 px wide; verify no essential controls are clipped.
19. Visit `/dev-scenarios` and confirm fixture scenarios still run independently.
20. Visit `/dev-challenges` and confirm all 20 challenges are inspectable.

## 8. Automated verification results

Backend tests:
```bash
cd api
pytest tests/test_engine.py -v
```
Result: **10 passed**.

Browser verification (Docker SQLite):
```bash
cd ui
node verify-phase2.mjs ../screenshots/phase2-docker
```
Result: Phase 2 browser verification complete.

Browser verification (Docker PostgreSQL):
```bash
cd ui
node verify-phase2.mjs ../screenshots/phase2-docker-postgres
```
Result: Phase 2 browser verification complete.

## 9. Screenshots

Both SQLite and PostgreSQL runs produce the same screenshot set in their respective folders:

- `screenshots/phase2-docker/phase2-home.png`
- `screenshots/phase2-docker/phase2-register.png`
- `screenshots/phase2-docker/phase2-challenge-1-selected.png`
- `screenshots/phase2-docker/phase2-challenge-2-selected.png`
- `screenshots/phase2-docker/phase2-challenge-3-selected.png`
- `screenshots/phase2-docker/phase2-flag.png`
- `screenshots/phase2-docker/phase2-results.png`

PostgreSQL equivalents are in `screenshots/phase2-docker-postgres/`.

## 10. Known limitations

1. **Prize wheel**: Phase 2 only records prize eligibility. Real weighted draws, inventory, and claim codes are Phase 3.
2. **Leaderboard**: Phase 2 stores results; public leaderboard management and staff moderation are Phase 4.
3. **Admin panel**: `/admin` is still a visual placeholder.
4. **Production deployment**: TLS, backup/restore, load testing, and VM hardening are Phase 5.
5. **Reference screenshots**: Exact visual fidelity remains gated on the unavailable approved reference images, as documented in Phase 1.
6. **Connection recovery**: The UI now shows loading and retry overlays; fully seamless offline-queueing is a Phase 5 hardening item.

## 11. Next steps

Please test Phase 2 using the checklist above and share feedback. Once approved, Phase 3 will implement real prize draws, inventory transactions, claim codes, and staff redemption.
