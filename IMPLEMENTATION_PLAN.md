# PSM TouchCTF — Implementation Plan

Version 1.0 · 20 September 2026

This plan delivers PSM TouchCTF in five independently testable phases. Each phase ends with a runnable application, explicit manual test instructions, and a handoff checkpoint. Work on a later phase begins only when the previous phase has been tested and approved.

## Reference mapping

| Reference image | Corresponds to |
|---|---|
| `references/home-screen.png` | Home / attract screen (`/`) |
| `references/challenge-screen.png` | Challenge screen (`/play/:sessionId/challenge/:position`) |
| `references/flag-capture-screen.png` | Flag-capture + wheel-preview milestone (`/play/:sessionId/flag`) |
| `references/leaderboard-screen.png` | Leaderboard / Hall of Hackers (`/leaderboard`) |
| `references/cyberspin-prize-wheel.png` | Dedicated prize-wheel spin screen (`/play/:sessionId/prize`) |
| `references/admin-panel.png` | Admin overview (`/admin`) |

> Note: No separate reference was supplied for the registration/ready screen, the detailed results screen, or the claim-result screen. Those screens follow the written design specification and reuse the visual system established by the supplied images.

## Visual approach

- Use the supplied images as the source of truth for proportions, colors, neon framing, segment geometry, and component styling.
- Build a single shared token file (`src/styles/tokens.css`) with the values measured from the references: dark navy canvas (`#070B17`), cyan primary (`#20E3FF`), magenta accent (`#FF4FD8`), violet gradient (`#A98BFF`), and the reference-matched panel framing.
- Implement the prize wheel as an SVG with equal-angle wedges, a luminous double rim, fixed top pointer, and a center **SPIN** hub matching `cyberspin-prize-wheel.png`.
- Keep all assets and fonts locally bundled so the booth preview works without Internet access.

## Phase 1 — Visual foundation and screen prototype

### Scope
- Reference-matched React + TypeScript + Vite frontend.
- Shared design system: tokens, shell, header/footer, cards, buttons, timer, modal, on-screen keyboard, prize wheel.
- Screens: Home, registration/ready, challenge, flag-capture, results, leaderboard, prize-wheel, claim-result, admin.
- **20-challenge bank**: 7 Phishing Hunt, 7 Log Detective, 6 Decode the Flag. Each challenge has its own evidence, answer, hint, and explanation.
- **Random challenge selection per round**: one challenge of each type, shuffled order, no repeats within a round, and pool rotation so every challenge in a type is presented before reshuffling.
- **Phase 1 prototype persistence**: selected challenge IDs, order, answers, and timer state are stored in `localStorage` so a browser refresh resumes the active round. The server will own selection, validation, timing, and persistence in Phase 2.
- Deterministic fixture data and a complete navigable game flow.
- Separate development-only scenario selector reachable at `/dev-scenarios`.
- Development-only challenge gallery reachable at `/dev-challenges` for inspecting every bank challenge.
- Reduced motion, visible focus, touch targets ≥56 px, and responsive breakpoints for 1920×1080, 1366×768, 1280×720, and narrow fallback.
- Sound layer (Web Audio API) for gameplay feedback, off by default, with a header toggle.
- Independent animation/effects toggle and `prefers-reduced-motion` support for decorative animations.
- Animated leaderboard podium with trophy SVGs, confetti, and score-count animations.
- On-screen keyboard **Done** button behavior and physical-keyboard support on registration.
- Docker Compose preview (`compose.phase1.yml`).
- Automated tests for challenge-bank validation, selection/rotation, and session persistence.

### Dependencies
- Node.js ≥ 20, npm
- Docker + Docker Compose (for preview)

### Deliverables
- `IMPLEMENTATION_PLAN.md`
- Vite project under `ui/`
- `ui/src/` components, screens, fixture service, challenge bank, selection logic, and routes
- `ui/src/services/__tests__/` Vitest tests for the challenge bank, selection/rotation, and persistence
- `ui/Dockerfile` and `compose.phase1.yml`
- Sound service (`ui/src/services/audio.ts`), animation toggle (`ui/src/services/animations.ts`), confetti component, and trophy icons
- Manual test checklist (see Section 7 of this plan)

### Manual test checklist (Phase 1)
1. Start the preview with `npm run dev` or `docker compose -f compose.phase1.yml up --build`.
2. Open `http://localhost:5173/` and confirm the home screen matches the reference layout:
   - Prize wheel fits entirely inside its panel (no clipped rim, pointer, or glow).
   - Statistics cards stay inside the header.
   - Primary buttons and footer are reachable without scrolling at 1920×1080, 1366×768, and 1280×720.
   - Sample average score is ≤ 500 and labeled as sample data.
   - Qualification text reads: "Solve at least two of the three challenges and capture the final flag before time expires to unlock one prize spin."
3. Tap **Start challenge**, enter a nickname, choose accessibility options, and tap **Ready to begin**.
4. Confirm the round presents exactly three challenges: one Phishing Hunt, one Log Detective, and one Decode the Flag, in random order.
5. Complete the three challenges using touch/pointer only:
   - Phishing Hunt: tap the suspicious items from the list.
   - Log Detective: tap the suspicious log rows.
   - Decode the Flag: type or token-build the decoded value.
6. Confirm each challenge accepts its correct answer and rejects an incorrect answer, and that the two-attempt limit and hint penalty still work.
7. On the flag-capture screen, tap **Assemble flag → Capture flag**, then **View results →**.
8. View results, then tap **Spin for a prize** (qualified) or **Finish** (unqualified).
9. On the prize-wheel screen, tap **SPIN FOR A PRIZE**. Verify the wheel animates to a physical prize segment (no "Try Again" or "Extra Points" outcomes).
10. View the claim code, then tap **Done** to return home.
11. Visit `/dev-scenarios` and run each scenario: success, unqualified, timer expiry, stock unavailable, connection failure, prize awarded.
12. Visit `/dev-challenges` and confirm all 20 challenges can be inspected, including their hints, answers, and explanations.
13. Start a new round, note the first challenge, refresh the browser, and confirm the same three challenges remain in the same order and the timer has not restarted.
14. Play several rounds and confirm each type's pool rotates through its full set before repeating.
15. Resize the browser to 1920×1080, 1366×768, 1280×720, and 390 px wide; verify no essential controls are clipped.
16. Enable reduced motion in OS settings and confirm the wheel shows a highlight instead of rotation.
17. Tap the **Effects on/off** toggle; confirm decorative animations (podium, confetti) are suppressed while functional transitions remain.
18. Tap the **Sound off/on** toggle, enable sound, and confirm audio feedback on button presses, correct/incorrect answers, timer warnings, and wheel spin.
19. Complete a round and navigate to `/leaderboard`; confirm the podium, trophy icons, confetti, and animated score counters.
20. Check browser console for errors.
21. Run `npm test` and confirm all Vitest tests pass.

## Phase 2 — Playable game engine

### Scope
- FastAPI backend with PostgreSQL default and SQLite kiosk option.
- Session persistence, recovery, and state machine.
- Challenge selection, answer validation, hints, timer, scoring, flag capture, results, and recovery.
- Idempotency and server-authoritative scoring.

### Dependencies
- Phase 1 approved
- Python ≥ 3.11, FastAPI, SQLAlchemy, Alembic, Pydantic
- PostgreSQL or SQLite

### Deliverables
- `api/` FastAPI application (`app/main.py`, `app/engine.py`, `app/models.py`, `app/schemas.py`, `app/seed.py`, `app/config.py`, `app/database.py`)
- PostgreSQL/SQLite-agnostic SQLAlchemy models and Alembic migrations under `api/alembic/`
- API endpoints under `/api/v1/`
- `ui/src/services/api.ts` and updated `useGameSession.ts` integrating real API calls
- `compose.postgres.yml`, `compose.sqlite.yml`, `api/Dockerfile`, and `edge/nginx.conf`
- Unit/integration tests in `api/tests/test_engine.py`
- Browser verification script `ui/verify-phase2.mjs`
- `PHASE2_HANDOFF.md`

### Manual test checklist (Phase 2)
1. Start the full stack with `docker compose -f compose.postgres.yml up --build`.
2. Create a session, complete challenges, and verify the 398-point example from the PRD.
3. Refresh the browser mid-round and confirm progress and timer resume from the server.
4. Submit an incorrect answer, then a correct one; verify the 10-point deduction.
5. Use a hint and verify the 25-point deduction.
6. Let the timer expire and confirm the round finalizes as `expired`.
7. Abandon a round and confirm it is excluded from the leaderboard.
8. Verify two solves + capture qualifies; two solves without capture does not.

## Phase 3 — Prize allocation and claims

### Scope
- Server-controlled weighted draws with inventory transactions.
- Prize wheel snapshot, spin animation driven by committed server result.
- Duplicate-request protection, claim codes, staff redemption, audit ledger.
- Stock-out and pending-entitlement handling.

### Dependencies
- Phase 2 approved
- Inventory and prize models

### Deliverables
- Prize/Inventory models and endpoints
- Weighted draw implementation with cryptographic integer RNG
- Claim code generation, encryption, and redemption flow
- Updated wheel screen consuming the real award snapshot

### Manual test checklist (Phase 3)
1. Configure prizes with weights (e.g., sticker 60, badge 30, shirt 10).
2. Run many spins and verify awarded distribution matches configured weights within tolerance.
3. Deplete one prize and confirm its probability is redistributed among remaining eligible prizes.
4. Verify the wheel animates to the server-committed segment.
5. Reload during animation and confirm the same award is restored.
6. Redeem a claim code as staff and confirm duplicate redemption returns the original result.
7. Verify negative inventory cannot occur under concurrent spins.

## Phase 4 — Administration and leaderboard

### Scope
- Staff authentication and role-based access.
- Challenge management, event settings, inventory management.
- Leaderboard, analytics, moderation, and audit history.
- Kiosk reset and session management.

### Dependencies
- Phase 3 approved
- Staff user/session models

### Deliverables
- Admin authentication endpoints and protected UI
- Challenge editor, prize/inventory editor, event settings
- Leaderboard filters and exports
- Audit log viewer

### Manual test checklist (Phase 4)
1. Log in as system admin and create an event.
2. Create, preview, publish, and archive challenges.
3. Add prizes, set weights, record stock receipts, and verify odds preview.
4. Open the event, play a round, and confirm leaderboard publication respects opt-in.
5. Moderate an alias and confirm it disappears from the public leaderboard.
6. Export leaderboard CSV and verify formula-injection escaping.
7. Review audit history for prize, session, and claim changes.

## Phase 5 — Deployment and end-to-end hardening

### Scope
- Production Docker Compose files (`compose.postgres.yml`, `compose.sqlite.yml`).
- Nginx edge reverse proxy with TLS guidance.
- Health checks, persistent volumes, security checks.
- Load testing, backup/restore runbook, Linux VM deployment instructions.

### Dependencies
- Phase 4 approved
- Target VM or equivalent test environment

### Deliverables
- `compose.postgres.yml` and `compose.sqlite.yml`
- `edge/` Nginx configuration
- Backup/restore scripts and runbook
- Load-test scripts
- `DEPLOYMENT.md` with VM setup instructions

### Manual test checklist (Phase 5)
1. Deploy with `compose.postgres.yml` on a Linux VM.
2. Verify only ports 80/443 are published.
3. Run health checks and confirm `/api/v1/health/ready` returns healthy.
4. Perform a backup, run test sessions, restore, and reconcile claims.
5. Run load test: 10 concurrent kiosks + 2 admins for 30 minutes.
6. Disconnect Internet and confirm LAN gameplay continues.
7. Disconnect LAN and confirm the UI blocks unconfirmed actions.
8. Verify no default admin password, no exposed DB port, and no secrets in the frontend build.

---

## Notes

- All fixture data, scores, odds, inventory, authentication, and claims in Phase 1 are clearly labeled as demonstrations. The fixture service layer is isolated so the real backend can replace it cleanly in Phase 2.
- Challenge selection, answer validation, scoring, timer, and persistence are implemented in the frontend for Phase 1 prototyping only. Phase 2 will move these to a server-authoritative FastAPI backend.
- Development scenario controls are reachable only at `/dev-scenarios`; the challenge gallery is reachable only at `/dev-challenges`. Neither is shown inside the intended production kiosk interface.
- Screenshot fidelity is recorded against the supplied references; any remaining deviations are documented in the Phase 1 handoff.

## Phase completion status

- **Phase 1 — Complete.** Delivered, tested (20 Vitest tests), browser-verified, and Docker preview confirmed healthy.
- **Phase 2 — Complete.** FastAPI backend, PostgreSQL/SQLite Docker Compose stacks, frontend integration, 10 backend tests, and browser verification passing. Handoff documented in `PHASE2_HANDOFF.md`.
- **Phase 3 — Not started.** Deferred until Phase 2 is approved.
- **Phase 4 — Not started.** Deferred until Phase 3 is approved.
- **Phase 5 — Partially advanced.** `compose.postgres.yml`, `compose.sqlite.yml`, and `edge/nginx.conf` were created during Phase 2 to support realistic testing; final TLS, backups, load testing, and deployment runbook remain for Phase 5.
