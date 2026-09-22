# PSM TouchCTF — Product Requirements

Version 1.0 · 20 September 2026 · Companion: [Design specification](DESIGN_SPEC.md)

## Sample design references

The project-root `references/` folder is the designated location for the user-provided approved sample designs, including touchscreen mockups and the CyberSpin-style prize-wheel sample. From this document, the relative path is `../references/`. Use these images as the visual source of truth for layout, colors, typography, components, and wheel styling. Sample filenames are optional; one image may contain multiple screens.

Before implementation, inspect the supplied reference images and reconcile the proposed visual values in these specifications with them. If multiple samples conflict, use the version explicitly identified by the user as approved. Until the images are supplied and reviewed, exact visual fidelity remains unverified.

## 1. Purpose, provenance, and scope

PSM TouchCTF is a touch-first cybersecurity booth game promoting engagement with the PSM in Cybersecurity program. Visitors solve brief simulated investigations, capture a flag, view their score, and earn a chance to spin for a physical prize. It must run from Docker containers on a Linux VM and remain usable on a booth LAN without Internet access.

The referenced **PSM Cyberspin Development Brief** confirms the neon cyberpunk direction, large Android/16:9 touchscreen, challenge-based play, leaderboard, prize management, protected admin panel, and Docker deployment. The screenshot attachments were not accessible in the retrieved history. DESIGN_SPEC.md preserves the stated visual direction while labeling exact visual values as proposed. This PRD likewise establishes **proposed implementation defaults**, not previously approved numerical rules.

MVP includes three challenge types (Phishing Hunt, Log Detective, Decode the Flag), session recovery, scoring, final flag capture, leaderboard, weighted prize wheel, stock and claims, admin management, local analytics, audit logs, and deployment/backup documentation. Future additions may include SOC triage, packet inspection, rule ordering, multilingual content, and separate display devices. Real exploitation targets, cash payments, user accounts for visitors, and cloud dependencies are out of scope.

## 2. Product goals and operating assumptions

- A visitor can learn the rules and complete play with touch alone, without cybersecurity tools or a physical keyboard.
- Default round: three challenges in 180 seconds. Allow roughly five minutes per booth visit including registration and prize handover; verify throughput with a pilot.
- One shared VM is authoritative for every connected kiosk. Internet loss is tolerated; losing the VM or LAN stops authoritative gameplay and prize allocation.
- Default event uses one published difficulty/ruleset to maintain score comparability. An extended-time ruleset uses 300 seconds and a separate leaderboard.
- MVP guarantees one spin per qualifying session. It does **not** guarantee one spin per human: aliases and browser state are not identity verification. Optional staff-issued, single-use admission codes can enforce one round per issued code without collecting personal identity.
- Success metrics: completion rate, median visit duration, challenge success rate, qualification rate, claim redemption rate, duplicate-award incidents (target zero), and inventory discrepancies (target zero). Conversion targets are set after a booth pilot, not invented as existing evidence.

## 3. Roles and permissions

| Role | Allowed operations |
|---|---|
| Visitor | Start authorized round; act on own session; see own result/claim; read public leaderboard |
| Booth operator | View kiosk status; abandon/reset kiosk session; look up and redeem claims; view operational totals |
| Event admin | Operator actions; manage challenges, prizes, stock, event settings, moderation, and exports |
| System admin | Event admin actions; manage staff accounts, system configuration, deployments, backups/restores |

Enforce permissions in the backend on every endpoint. Hidden buttons do not enforce authorization. Operators cannot alter odds, add stock, edit scores, or create staff accounts. Score corrections require an admin adjustment ledger with reason; original scoring records remain immutable.

## 4. Full game flow and state machine

1. **Attract/home:** show rules, event status, leaderboard preview, and prize availability.
2. **Registration:** validate alias, show privacy notice, select public leaderboard opt-in and accessibility mode; validate admission code if enabled.
3. **Ready:** server verifies the event is open, the kiosk has no unresolved active session, and enough published challenges exist. It selects three distinct challenge revisions and snapshots the ruleset. Default selection is one randomly selected challenge from each MVP type at the event difficulty. Require at least two published challenges per type before opening the event.
4. **Active round:** server records `started_at` and `expires_at`. Player answers each challenge sequentially. Maximum two attempts per challenge, one hint, no backtracking to finalized challenges. Skip finalizes that challenge for zero points. Player can abandon with confirmation.
5. **Final flag:** after all three challenges are finalized and at least two are solved, offer a touch-based assembled session flag. Capture must reach the server before expiry. A session-specific unpredictable flag is issued only after eligibility; the UI does not need to hide it from an eligible player.
6. **Finalize:** capture, expiry, or completion without sufficient solves closes the round. Persist immutable result and score components once. A late request cannot alter it.
7. **Results:** publish opted-in eligible leaderboard result. A captured flag plus at least two solved challenges qualifies for exactly one spin, independent of the score total.
8. **Prize:** commit a weighted draw and stock reservation atomically, then animate the returned outcome. Keep an entitlement pending if no eligible stock exists; staff can replenish and help resume it before event claims close. Never silently consume an entitlement for a failed draw.
9. **Claim:** issue a human-readable random claim code with at least 50 bits of entropy, uniqueness checking, and rate-limited lookup. Staff confirms physical handover exactly once.
10. **Reset:** clear visitor data from the kiosk UI and return home. Persist completed rounds, prize awards, and unclaimed claim codes on the server.

Session states: `ready → active → completed | expired | abandoned`. `ready` exists only for server-side setup and cannot earn points. Capture is an outcome on `completed`, not an independent second completion. Uncaptured timeout finalizes as `expired`; an abandoned round is excluded from the leaderboard and prizes. Completed/expired non-abandoned rounds can appear on the leaderboard when opted in, including zero scores.

Entitlement states: `pending → awarded | closed`; award states: `reserved → redeemed | voided`. Only staff may void with a reason. Voiding does not automatically grant another spin; a separate audited correction is required, with at most one active award per entitlement. Closing claims at the configured deadline expires pending entitlements and voids unclaimed reservations through audited operations; do not silently restock previously handed-out prizes.

### Recovery and timing

Server time determines acceptance. Compare the request's server receipt time against expiry; zero remaining time is expired. Return server time and expiry so clients can display an offset-corrected timer. Refresh/reconnect resumes saved progress and the original expiry; disconnection does not pause or extend competitive rounds. Provide a connection warning immediately and reload state before accepting further actions. If a submission response is lost, retry its idempotency key or query the session; do not assume failure.

A kiosk reset abandons an active round but cannot erase an already committed award. Operators can retrieve outstanding claims from session history. A technical failure may receive a staff-authorized replacement admission/session recorded in audit; never mutate the elapsed time or score of the old session.

## 5. Scoring and leaderboard

All values below belong to versioned rulesets. MVP base points are 100 per solved challenge. An incorrect first attempt deducts 10 from that challenge's eventual solved score. One hint deducts 25. Failed or skipped challenges score zero, with no negative total.

```text
solved_challenge_points = max(0, 100 - 10 × prior_wrong_attempts - 25 × hint_used)
challenge_points = 0 when not solved
capture_bonus = 100 if a valid final flag is captured before expiry, else 0
time_bonus = floor(100 × remaining_seconds_at_capture / configured_duration_seconds)
             when captured, else 0
total_score = sum(challenge_points) + capture_bonus + time_bonus
```

`prior_wrong_attempts` is 0 or 1 for a solved challenge. Use nonnegative remaining seconds bounded by the configured duration. Maximum theoretical score is 500. Example: three solves, one hint, one second-attempt solve, and 60 seconds left in a 180-second round yield `300 − 25 − 10 + 100 + 33 = 398`. Two solves plus valid capture qualify even if hints reduce the score. Two solves without capture do not qualify.

Order leaderboard by total score descending, solved count descending, elapsed milliseconds ascending, finalized timestamp ascending, then session ID ascending for deterministic ties. For timeout, elapsed equals configured duration. Separate event, ruleset revision, difficulty, and accessibility mode; never silently combine incompatible scoring schemes. Show top ten and the current opted-in player. Keep all qualifying published entries in storage, paginate admin views, and refresh public views every 10 seconds. Admin may hide inappropriate aliases/results with a reason; this is moderation, not score deletion. Changing a nickname must not move its session's score or prize to another session.

## 6. Functional requirements

| ID | Requirement |
|---|---|
| FR-01 | Home exposes event rules/status, start, public leaderboard, accessibility and privacy options. |
| FR-02 | Backend validates alias, kiosk/session ownership, admission code when enabled, and selected ruleset. |
| FR-03 | Challenge content is schema-validated, revisioned, previewable, and publishable; answers are excluded from public payloads. |
| FR-04 | Server assigns distinct challenge revisions and persists order; refresh cannot redraw easier tasks. |
| FR-05 | Answers, hints, skips, capture, and expiry follow the state machine; scoring is backend-only. |
| FR-06 | Result contains an auditable score breakdown, eligibility reason, and publication status. |
| FR-07 | Only an eligible pending entitlement can request a spin; draw, reservation, and award persist atomically. |
| FR-08 | Claim lookup and redemption are staff-authenticated, rate-limited, and idempotent. |
| FR-09 | Leaderboard filters and ranking use the exact rules above and honor publication consent. |
| FR-10 | Admin supports content, inventory, odds, settings, users, kiosk reset, moderation, analytics, and audit by role. |
| FR-11 | Public workflow and required assets work without Internet while the VM/LAN remain reachable. |
| FR-12 | Restart/reload preserves authoritative game, award, claim, and inventory state. |
| FR-13 | Maintenance prevents new rounds; in-flight rounds finish under their snapshotted rules unless an audited emergency stop is used. |
| FR-14 | Exports use staff authorization, bounded date ranges, proper escaping, and spreadsheet formula-injection protection. |

## 7. Prize inventory, probabilities, and integrity

Each event prize has name, short wheel label, image, active flag, positive integer weight, display order, and stock ledger. Track received quantity and adjustments, reservations, redemptions, and returns explicitly. Available quantity is received plus adjustments minus reserved minus redeemed; voiding an unhanded reservation returns it to availability through a ledger entry. Never allow negative available stock.

Eligible prizes are active, weight greater than zero, and available quantity greater than zero. At draw time:

```text
P(prize i) = weight_i / sum(weights of eligible prizes)
```

Example configuration (illustrative, not actual promised stock): sticker weight 60, badge 30, shirt 10 yields 60%/30%/10% while each is available. Once shirts sell out, probabilities become 66.67%/33.33%. Stock counts do not themselves multiply weights. No-prize outcomes are disabled by default; adding them later requires explicit event rules and honest wheel labeling.

Use an operating-system-backed cryptographic random integer in `[0, total_weight)` and cumulative integer weights to avoid floating-point boundary errors. The backend stores the eligible set, weights, inventory revision, RNG selection value, chosen prize, and ruleset version for audit. Public responses disclose the relevant probability snapshot without exposing internal credentials or future random state.

Serialize all inventory-affecting operations per event. PostgreSQL: lock the event inventory-control row within the transaction before reading eligible stock; every draw, stock adjustment, and claim/void transition follows the same locking order. SQLite: use one backend worker, local disk, short `BEGIN IMMEDIATE` transactions, and a bounded busy timeout/retry. A database unique constraint on entitlement award ownership and an atomic stock condition provide further protection. Commit reservation and award together; rollback consumes neither stock nor entitlement. Persist an idempotency response in the same transaction.

The wheel receives the same snapshot used for the committed draw. An already displayed wheel is only a preview; draw-time availability can differ and the returned snapshot must replace it before animation. Odds edits apply to future draws, including pending entitlements, with disclosure and audit. An award already committed never changes because an admin edits weights.

Physical handling: staff verifies the claim and confirms handover. Redemption changes reserved to redeemed without decrementing availability a second time. Duplicate confirmation returns the original redemption. Adjustments, voids, and substitutions require event-admin authority and reasons; no silent prize substitution. Claims default to event end plus 24 hours, visibly configured before opening.

## 8. Administration

- **Event setup:** title, dates/timezone, kiosk enrollment, ruleset, duration, attempts, qualification, challenge pool, prize availability, claim deadline, privacy text, audio and branding.
- **Challenges:** draft/edit/preview/publish/archive, type/difficulty/tags, instructions, evidence, hint, answer validator, explanation, local assets, revision history. Referenced revisions remain immutable.
- **Prizes:** create/archive, upload image, weight and display ordering, initial receipts, adjustments with reason, low-stock threshold, current odds preview, reservations and handovers.
- **Sessions:** search alias/session/time/kiosk, view score derivation, technical state, outstanding award, abandon/reset one kiosk, issue audited replacement round.
- **Claims:** exact-code lookup, prize summary, redeem once, history and exception handling.
- **Leaderboard:** filters, hide/show with reason, alias moderation, CSV export; no arbitrary total overwrite.
- **Staff/security:** role management by system admin, password reset, session revocation, failed login review.
- **Operations:** health, software/schema version, disk/backup status, maintenance controls. Restore and host administration are documented operator procedures, not arbitrary shell commands exposed through the browser.

Configuration publication validates ranges, challenge coverage, and wheel constraints. Publish a new immutable ruleset for score-affecting changes. An event cannot open with missing answers, invalid weights, or fewer than the required published challenges. It may open with no prizes only in visibly disclosed play-only mode.

## 9. Logical data model

Use UUID identifiers, UTC timestamps, foreign keys, constrained enums, and integer quantities/points. Display time in the event timezone. JSON fields hold versioned challenge schemas/snapshots, not the only copy of relational ownership.

| Entity | Key fields / constraints |
|---|---|
| Event | ID, name, state, timezone, opens/closes, claim deadline, active ruleset |
| Ruleset | ID, event, revision, duration, attempts, scoring JSON, difficulty, mode; immutable after publication |
| Kiosk | ID, event, label, hashed enrollment credential, last seen, revoked flag |
| StaffUser / StaffSession | Username unique, password hash, role; hashed session token, expiry, revoked timestamp |
| AdmissionCode | Event, code hash unique, consumed session ID unique, expiry; optional |
| Challenge / ChallengeRevision | Stable challenge ID; revision, type, difficulty, public content, private validator, hint, explanation, asset references |
| GameSession | Event, kiosk, alias, consent, ruleset, state, start/expiry/finalized timestamps, solved count, score, elapsed; hashed recovery credential |
| SessionChallenge | Session, position unique within session, challenge revision, outcome, hint timestamp, awarded points |
| Attempt | Session challenge, ordinal unique, submitted answer or minimized digest, correctness, received timestamp, request key |
| ScoreEntry | Session, reason, signed points, source reference; unique source prevents duplicate scoring |
| Prize | Event, label, image, active, integer weight, display order |
| InventoryControl / InventoryEntry | Event lock/revision; prize, signed movement/type, actor, reason, award reference, timestamp |
| Entitlement | Session unique, state, qualification reason, expiry |
| Award | Entitlement, prize, wheel/odds snapshot, state, claim-code hash unique, recoverable encrypted claim display, awarded/redeemed timestamps; at most one non-voided award per entitlement |
| IdempotencyRecord | Actor/session scope + route + key unique, request hash, stored response/status, retention expiry |
| AuditLog | Staff/system actor, action, target, timestamp, request ID, redacted before/after and reason; append-only application access |
| AnalyticsEvent | Event/session pseudonymous IDs, type, timestamp, deduplication key, bounded non-sensitive properties |
| MediaAsset | ID, local storage key, media type, size, checksum, alt text, license/source metadata |

Index event/rank fields, session state/expiry, claim hash, prize/event, audit timestamp, and foreign keys used in lookups. Enable SQLite foreign-key enforcement on every connection. Keep leaderboard as a query or rebuildable projection; the session and score ledger remain authoritative. Keep secrets and valid answer definitions outside frontend assets and public serialization. Database migrations are version-controlled and tested on both supported engines.

## 10. API and concurrency contract

Same-origin `/api/v1` JSON API. Minimum endpoints:

| Endpoint family | Purpose |
|---|---|
| `GET /public/event`, `/leaderboard` | Sanitized public configuration and scores |
| `POST /sessions`, `GET /sessions/{id}` | Start and recover authorized session |
| `POST /sessions/{id}/answers`, `/hints`, `/skip`, `/capture`, `/abandon` | Validated game transitions |
| `GET /sessions/{id}/award`, `POST /sessions/{id}/spin` | Recover or allocate award |
| `POST /admin/login`, `/logout` | Staff authentication lifecycle |
| `/admin/events`, `/challenges`, `/prizes`, `/inventory`, `/sessions`, `/claims`, `/analytics`, `/audit`, `/users` | Role-scoped management |
| `GET /health/live`, `/health/ready` | Process health and database/schema readiness |

All mutation requests carry an idempotency key. Reuse with a different body returns conflict; identical retries return the original result. Check session ownership, state, current challenge, revision, and expiry transactionally. Retain financial-like prize/claim deduplication ownership for the award lifetime, even after response-cache expiry. GET requests have no game-state side effects; a server reconciliation task finalizes expired sessions independently, and mutation paths also enforce expiry.

Use typed validation errors, request IDs, and consistent status semantics (401 unauthenticated, 403 forbidden, 409 state conflict, 422 invalid input, 429 throttled, 503 temporarily unavailable). Do not log plaintext credentials or full claim codes. Public result fields never contain the correct answer for unsolved active challenges. Cache static hashed assets aggressively; do not cache private API responses in shared caches.

## 11. Security, privacy, and retention

- HTTPS for kiosks and staff, including on LAN; provision a trusted local certificate where public certificate issuance is unavailable. Limit admin access to a management subnet or VPN plus authentication.
- Staff passwords use Argon2id with deployment-calibrated settings. Bootstrap the first administrator through an operator command, with no default password in images or Compose files. Rate-limit login and claim lookup and revoke sessions on password/role changes.
- Use opaque HttpOnly, Secure, SameSite cookies for staff and scoped kiosk/player sessions; protect mutations against CSRF and validate Origin. UUID knowledge alone never authorizes a session read. Set staff idle expiry to 15 minutes and absolute expiry to 8 hours by default.
- Validate all content, bound request sizes, parameterize SQL, escape text, and sanitize any permitted rich text. Challenge HTML is rendered from safe structured components, never arbitrary uploaded scripts. Apply a restrictive Content Security Policy and deny framing.
- Allow only validated PNG/JPEG/WebP prize images for MVP uploads; cap at 5 MB, verify decoded type/dimensions, re-encode, generate storage names, and reject traversal. Keep uploads outside executable paths. SVG brand assets are bundled and reviewed, not arbitrary visitor uploads.
- No actual malware, live credentials, real exploit execution, or external target scanning in challenges.
- Alias/publication choice is the only visitor information required. No email, phone, or identity capture in MVP. Display consent and allow withdrawal through staff using session proof. Never identify people based on an alias alone.
- Proposed retention: raw game/analytics records 90 days; award, inventory and audit records 180 days; then remove aliases and session linkage where operationally possible. Retain aggregate totals without identifiers. Event owner can shorten these periods; document backup expiry and how deletion propagates as backup sets expire.
- Minimize raw submitted answers, and never store free-text input in analytics. Audit exports and privileged changes. Encrypt off-VM backups and keep encryption/recovery keys separately available to authorized operators.

## 12. Non-functional requirements

| ID | Acceptance target |
|---|---|
| NFR-01 Usability | Entire public journey touch-only; targets, responsive layouts, and WCAG 2.2 AA checks per design spec |
| NFR-02 Performance | Warm LAN API p95 <300 ms for reads and <500 ms for mutations; visible interaction acknowledgement <100 ms |
| NFR-03 Load | PostgreSQL target: 10 concurrent kiosks plus 2 admins and 20 requests/second for 30 minutes; no duplicate awards or negative inventory |
| NFR-04 Startup | Public home interactive within 3 seconds on the specified booth device after assets are available; cold load tested separately |
| NFR-05 Reliability | Committed state survives container/VM restart; no acknowledged transaction lost under normal clean restart |
| NFR-06 Recovery | Proposed RPO ≤1 hour during events; RTO ≤60 minutes from tested off-VM backup on comparable hardware |
| NFR-07 Connectivity | Disconnecting Internet alone does not interrupt play; VM/LAN outage blocks authoritative actions and shows recovery UI |
| NFR-08 Portability | Docker Engine with Compose plugin on supported Linux, matching image CPU architecture; no host-specific application paths |
| NFR-09 Observability | Structured logs, health/readiness, request IDs, backup freshness, disk alerts; bounded log growth |
| NFR-10 Maintainability | Typed API contracts, migrations, reproducible locked dependencies, versioned content and rules |

These are implementation targets, not measured results. Validate on the actual Android touchscreen and chosen VM. Proposed starting VM: 2 vCPU, 4 GB RAM, 40 GB SSD for one booth; 4 vCPU/8 GB for several kiosks, subject to load measurements and media/retention needs.

## 13. Event telemetry

Track `session_started`, `challenge_presented`, `hint_used`, `answer_submitted` (correctness only), `challenge_finalized`, `flag_captured`, `session_finalized`, `spin_awarded`, `claim_redeemed`, `session_abandoned`, and technical errors. Use server events for authoritative counts and unique event keys to deduplicate retries. Reconcile aggregates against game/award tables.

Telemetry filters by event, time range, kiosk, challenge revision, and ruleset. Completion rate = non-abandoned finalized rounds / started rounds; qualification rate = eligible rounds / started rounds; redemption rate = redeemed awards / awarded prizes. Show denominators and distinguish active rounds from completed cohorts. Report median duration, score distribution, hint usage, per-challenge solve rate, award distribution, available stock, outstanding claims, and error rate. Exports must state timezone and filter scope. Do not infer prize fairness from tiny samples; use deterministic boundary tests and large seeded simulations in testing, never seeded randomness in production.

## 14. Recommended stack and deployment choices

| Layer | Recommendation |
|---|---|
| Frontend | React + TypeScript + Vite; static production build, local fonts/assets; reusable CSS token system |
| Backend | Python + FastAPI, Pydantic validation, SQLAlchemy, Alembic migrations; ASGI server |
| Default database | PostgreSQL for shared VM/multiple kiosks or concurrent administration |
| Small installation | SQLite for one kiosk and one API worker, with WAL, foreign keys, short writes, local persistent disk, and tested backups |
| Optional Redis | Shared rate limits and ephemeral caching for multiple API workers; never authoritative for awards, stock, or scoring |
| Edge | Nginx serving built frontend and reverse-proxying `/api`; TLS termination |
| Packaging | Multi-stage Docker builds; Docker Compose; pinned supported image versions/digests selected at implementation |

Choose PostgreSQL at launch if multiple kiosks are expected. SQLite reduces operational overhead for one kiosk but requires contention testing when an admin is active. Migration to PostgreSQL must preserve IDs, awards, ledgers, and history through a validated export/import; changing the connection string alone is not a migration. Redis is unnecessary for a single worker; add it only when distributed limits/caching require it. Core correctness must survive a Redis outage.

## 15. Docker Compose architecture

```text
Android kiosk / admin browser
          │ HTTPS 443 (80 redirects)
          ▼
edge: Nginx + compiled React assets
          │ /api → api:8000
          ▼
api: FastAPI ────────────── optional redis:6379
          │
          ├── PostgreSQL db:5432 → database volume
          └── OR SQLite /data/touchctf.db → local data volume

One-shot migrate service → chosen database before API rollout
Host-scheduled backup job → encrypted off-VM storage
```

Only edge ports 80/443 are published. API 8000, PostgreSQL 5432, and Redis 6379 stay on Compose internal networks and have no host port mappings. Vite's development port 5173 is development-only and must not run in production. SSH 22 is a host administration port restricted to management sources; it is not part of the app.

Deliver two explicit Compose selections, `compose.postgres.yml` and `compose.sqlite.yml`, with a shared base where useful. Do not start both database modes together. PostgreSQL mode has edge, api, db, and one-shot migrate; SQLite omits db, gives only api/migrate access to the data directory, and uses one API worker. Optional Redis is an override/profile with corresponding runtime configuration. Migrations are operator-invoked one-shot jobs before API rollout, never raced by every worker at boot.

### Service contract

| Service | Persistence | Health / startup | Runtime policy |
|---|---|---|---|
| edge | Read-only TLS certificate bind mount; bundled frontend | Local `/healthz` verifies web server, not database; 15s interval, 3s timeout, 3 retries | Restart unless-stopped; read-only root with tmpfs for cache/run |
| api | `/app/media`; `/data` only in SQLite mode | `/api/v1/health/ready` checks DB and schema; 10s interval, 3s timeout, 5 retries, 30s start period | Non-root; restart unless-stopped; bounded workers, resource limits |
| db | Named volume at chosen image's documented data directory | `pg_isready`; 10s interval, 5s timeout, 5 retries | Restart unless-stopped; supported pinned version |
| migrate | Same DB credentials/schema access as required; same SQLite volume when selected | Exit 0 on success; nonzero blocks rollout | One-shot, no restart loop |
| redis (optional) | None if cache-only | Authenticated PING when auth enabled | Bounded memory/eviction, private network |

Use `depends_on` with `service_healthy` for initial dependency readiness where applicable. The API must also retry database connections and handle later outages; Compose ordering is not runtime failover. A Docker health failure by itself does not guarantee restart: alert an operator, and have the process exit on unrecoverable failure. Health checks must use binaries included in their image. See [Docker startup-order documentation](https://docs.docker.com/compose/how-tos/startup-order/).

Use unprivileged processes where the selected image permits, drop unnecessary capabilities, no Docker socket mount, no privileged containers, and explicit writable paths. Set bounded rotating logs (proposed 10 MB × 5 files per service). Network and firewall tests must verify Docker-published ports as well as host firewall configuration.

### Configuration contract

The following are application configuration names to implement, not claims that FastAPI automatically recognizes them. Validate at startup and fail with a redacted message if required values are missing.

| Variable | Example / purpose |
|---|---|
| `APP_ENV` | `production` |
| `PUBLIC_BASE_URL` | `https://touchctf.example.org` or trusted LAN hostname |
| `DATABASE_BACKEND` | `postgresql` or `sqlite` |
| `DATABASE_URL_FILE` | `/run/secrets/database_url`; PostgreSQL connection URL, percent-encoded credentials |
| `SQLITE_PATH` | `/data/touchctf.db`; used only in SQLite mode |
| `APP_SECRET_FILE` | `/run/secrets/app_secret`; high-entropy server secret |
| `CLAIM_ENCRYPTION_KEY_FILE` | `/run/secrets/claim_key`; claim-display encryption key, backed up separately |
| `REDIS_URL_FILE` | Optional `/run/secrets/redis_url`; absent disables Redis |
| `ALLOWED_HOSTS` | Exact deployment hostname list |
| `TRUSTED_PROXY_CIDRS` | Only the edge network range; do not trust arbitrary forwarded headers |
| `COOKIE_SECURE` | `true` in production |
| `MEDIA_DIR` | `/app/media` |
| `LOG_LEVEL` | `INFO`; redact secrets and visitor input |
| `API_WORKERS` | `1` for SQLite; measured value for PostgreSQL |
| `TZ` | `UTC` for infrastructure; event timezone is database configuration |
| `POSTGRES_DB`, `POSTGRES_USER` | Database container initialization values |
| `POSTGRES_PASSWORD_FILE` | DB container secret file; align API connection credentials |
| `BACKUP_DESTINATION` | Operator-managed encrypted off-VM target |
| `BACKUP_RETENTION_DAYS` | `30` proposed; event privacy policy may reduce it |

Use relative `/api/v1` calls from the frontend so no API hostname is baked into every build. Any Vite `VITE_*` value is public build data; never put secrets there. Store non-secret configuration in a deployment `.env` file and secrets in permission-restricted host files mounted through Compose secrets. Compose secrets are file delivery, not automatic encryption at rest: secure the source files and backups. See [Docker secrets reference](https://docs.docker.com/reference/compose-file/secrets/).

### Persistent storage

- Database volume: PostgreSQL data or SQLite directory including WAL/shm files; never an ephemeral container layer or network-shared SQLite file.
- Media volume: uploaded prize/challenge images with asset manifest/checksums.
- TLS files: read-only mount, renewed by a documented certificate process.
- Backup staging: restricted host directory with capacity alerts; copy encrypted backups off the VM.
- Configuration/secrets: separately versioned deployment manifest and securely stored secrets; neither committed nor bundled in images.

Avoid `docker compose down -v` during normal operation because it deletes named volumes. A VM snapshot is useful for disaster recovery but is not a substitute for database-consistent backups and restore tests.

## 16. Backup, restore, deployment, and upgrades

### Backup policy

Back up hourly during events, daily outside events, and before every schema/content rollout. Retain hourly sets for 48 hours and daily sets for 30 days unless the event policy requires shorter retention. Record checksum, timestamp, schema/app versions, and success status; alert if the most recent successful event backup is older than one hour or disk space is low.

PostgreSQL: use a consistent logical dump in custom format (`pg_dump -Fc`) with a compatible client, plus required role/bootstrap information. Include media and configuration manifests, and retain immutable media versions long enough to match the database snapshot. For a small booth, briefly pause administrative content uploads during backup to simplify media consistency; gameplay can continue during a logical dump. Official guidance: [PostgreSQL SQL dumps](https://www.postgresql.org/docs/current/backup-dump.html).

SQLite: use its Online Backup API or CLI `.backup` to produce a consistent snapshot; never copy only an active `.db` file while ignoring WAL. Schedule backup under controlled contention and verify the resulting database. Official guidance: [SQLite Online Backup API](https://www.sqlite.org/backup.html).

Encrypt and transfer the completed set off-VM; verify transfer checksum and retain decryption keys separately. Back up the claim encryption key securely so restored awards can still display valid claim codes. Do not report backup success based only on a scheduled job starting.

### Restore runbook

1. Enter maintenance, isolate the damaged deployment, and preserve its latest state for investigation. Prevent kiosks from writing to either old or restored instances simultaneously.
2. Provision clean volumes and the recorded application/database versions. Retrieve and verify the backup and necessary keys.
3. Restore PostgreSQL with `pg_restore` into a clean database, or place the consistent SQLite backup in the stopped service's data directory with correct ownership. Restore matching media and configuration.
4. Run engine integrity checks, schema-version checks, and reconciliation: scores, entitlements, awards, available/reserved/redeemed inventory, and outstanding claims.
5. Reconcile physical handovers since the backup timestamp using operator records; restoring can otherwise make a redeemed claim appear redeemable again. Keep affected claims blocked until reconciliation completes.
6. Start services, pass readiness, perform a marked test round and test claim using dedicated test inventory, then reopen kiosks. Record actual recovery time and any lost interval.

Perform a restore drill before the first event and after material database/backup changes. RPO means recent data may be missing; stock and claims must be reconciled before resuming prize distribution.

### Linux VM deployment sequence

1. Provision a supported Linux distribution, SSD storage, static IP/DNS, time synchronization, SSH keys, firewall rules, and reliable booth LAN/power. Confirm `amd64`/`arm64` image compatibility.
2. Install Docker Engine and the Compose plugin from a trusted distribution source. Restrict Docker administration privileges.
3. Prepare deployment configuration, secret files, TLS trust, named volumes, backup destination, and pinned application images. For an air-gapped event, preload images, fonts, and content before arrival.
4. Validate the selected Compose configuration, start the database if applicable, run migrations once, bootstrap staff, and start api/edge. Do not expose database ports.
5. Import approved content/assets, set rules and stock, enroll kiosks, and run readiness, touch, scoring, last-item concurrency, and recovery checks.
6. Configure Android kiosk mode, keep screen awake, suppress OS interruptions as permitted, trust the TLS certificate, and confirm physical viewing angle and target sizes.
7. Verify the game works with Internet disconnected. Then simulate LAN loss separately and verify that prizes are blocked until authoritative recovery.
8. Enable host-boot startup/restart behavior, log rotation, disk/backup alerts, and a documented booth operator runbook. Complete a backup/restore drill before opening.

Upgrade in maintenance: back up, pull/preload pinned images, run tested migrations once, deploy, and smoke-test. Retain the prior image. Roll back the app only if the schema is compatible; otherwise restore the matched backup with explicit reconciliation of any newer sessions/claims. Never assume database downgrades are safe. A single VM is a single point of failure; replication/high availability is a future scope decision, not provided by Compose alone.

## 17. Acceptance criteria and verification plan

| ID | Scenario and expected result |
|---|---|
| AC-01 | On the target touchscreen, a new visitor completes registration, all three challenges, capture, results, wheel, and claim display without a physical keyboard. |
| AC-02 | A seeded six-challenge pool selects one distinct revision per MVP type; refresh preserves selection and remaining time. |
| AC-03 | The 398-point scoring example matches exactly; failed/skip cases yield zero challenge points; repeated requests cannot add points twice. |
| AC-04 | Two solves plus timely capture create one entitlement; two solves without capture and late captures create none. |
| AC-05 | Two simultaneous spins for the final unit result in at most one reservation; the other receives an available alternative or retains pending entitlement. Inventory never becomes negative. |
| AC-06 | Duplicate spin requests, different request keys, reload during animation, and response loss all recover the same active award. |
| AC-07 | Weight-boundary unit tests cover every interval and unavailable prize exclusion; large test simulations match configured weights within a defined statistical tolerance. |
| AC-08 | Repeated claim redemption returns the original result; unauthenticated visitors and operators attempting odds edits are denied. |
| AC-09 | Ruleset edits do not change active round scoring; prize edits do not change committed awards; audit records identify the actor and revision. |
| AC-10 | Ranking obeys every tie-break field; opt-out and moderated aliases do not appear; different rulesets are separated. |
| AC-11 | Internet loss leaves LAN gameplay functional; LAN loss shows a warning and prevents unconfirmed score/prize outcomes; reconnect resumes authoritative state. |
| AC-12 | Container/VM restart retains completed games and committed awards. A restore drill meets the proposed RPO/RTO and reconciles claims before reopening. |
| AC-13 | Production publishes only 80/443; no frontend secret, public answer key, default admin password, or externally reachable DB port exists. |
| AC-14 | CSRF, session ownership, role checks, input validation, upload restrictions, login throttling, and CSV escaping pass targeted security tests. |
| AC-15 | All design acceptance checks pass across target viewport sizes, keyboard/screen reader paths, 200% zoom, and reduced motion. Screenshot fidelity remains gated on obtaining the approved image references. |
| AC-16 | Load tests meet NFR targets on the selected deployment, including concurrent staff use; SQLite mode is independently tested with its single-worker limit. |
| AC-17 | Event opening rejects incomplete challenge pools/invalid prizes; play-only mode and stock-out states communicate prize availability honestly. |
| AC-18 | Kiosk idle reset removes the prior player's display and session credentials while retaining server history and outstanding claims. |
| AC-19 | Event telemetry totals reconcile with sessions/awards and deduplicate retries; raw answers, secrets, and claim codes are absent from telemetry. |
| AC-20 | Backup failure/staleness is detectable; restoration includes media and keys, and produces readable outstanding claims with correct stock balances. |

Verification should combine unit tests for scoring/state/weighted selection, database integration tests for concurrency and constraints, API authorization/idempotency tests, browser touch-flow tests, manual accessibility/device checks, and deployment/restore exercises. This document specifies required verification; no application or deployment has been built or tested by producing these Markdown files.

## 18. Decisions to confirm before implementation

The documents are complete specifications with proposed defaults. Before implementation, reconcile the unavailable approved screenshots and actual PSM/prize assets; confirm event difficulty/content, physical stock and weights, claim deadline, privacy retention, standard/extended timing, admission-code policy, and the selected database/VM capacity. These choices are configurable and must not be mistaken for already approved event facts.
