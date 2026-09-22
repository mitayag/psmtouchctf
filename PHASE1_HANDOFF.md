# PSM TouchCTF — Phase 1 Handoff (Corrected)

Date: 20 September 2026

## 1. Summary of corrections

This handoff covers the corrected Phase 1 prototype. The following issues from the first pass have been addressed:

- **Home-screen layout**: wheel, stats cards, footer, and primary buttons now fit within target landscape viewports without clipping or unnecessary scrolling.
- **Content and rules**: sample average score reduced to a plausible value within the 500-point maximum; non-physical wheel outcomes removed; qualification wording clarified.
- **Challenge bank**: expanded from a repeated 3-challenge set to **20 distinct, playable challenges**.
- **Random selection**: each round now presents one random Phishing Hunt, one Log Detective, and one Decode the Flag challenge, shuffled, with pool rotation and localStorage persistence for the prototype.
- **Register / on-screen keyboard**: fixed the **Done** button so it dismisses the keyboard and validates the nickname; physical keyboards also work, and the field stays focused while typing.
- **Audio**: implemented a Web Audio API sound layer with button, correct/incorrect, hint, timer warnings, wheel spin/tick, prize reveal, and leaderboard celebration sounds; sound starts **off by default** and must be enabled with the header toggle.
- **Animation toggle**: added an independent **Effects on/off** toggle in the header that disables decorative animations and confetti without muting sound; OS reduced motion is still honored.
- **Leaderboard redesign**: replaced the flat table with an animated podium (gold/silver/bronze trophy SVGs), confetti celebration on arrival from a round, score-count-up animation, and an event-stats sidebar.
- **Dev tooling**: added a development-only challenge gallery at `/dev-challenges`.
- **Tests**: added Vitest tests for challenge-bank validation, selection/rotation, and session persistence.

## 2. Implemented challenge bank (20 challenges)

### Phishing Hunt — 7 challenges
1. Fake password-reset email
2. Parcel-delivery payment scam
3. Executive gift-card request
4. Fake shared-document invitation
5. Suspicious QR-code login message
6. Account-verification phishing text
7. Fake technical-support warning

### Log Detective — 7 challenges
8. Repeated failed logins followed by a successful login
9. Unusual privileged-account creation
10. Suspicious login from an unfamiliar device
11. Unexpected bulk file downloads
12. Repeated access to restricted pages
13. Security logging unexpectedly disabled
14. Unexpected scheduled-task creation

### Decode the Flag — 6 challenges
15. Short Base64 message
16. Caesar cipher with a provided shift
17. Short hexadecimal message
18. Binary ASCII with a touch-friendly lookup aid
19. Reversed text
20. Simple symbol substitution with a provided legend

## 3. What was implemented

### Built screens

| Screen | Route | Notes |
|---|---|---|
| Home / attract | `/` | Corrected layout; sample stats; qualification explanation; responsive wheel preview |
| Registration / ready | `/play/setup`, `/play/:id/ready` | Updated rules; on-screen keyboard; accessibility options; countdown |
| Challenge | `/play/:id/challenge/:position` | Randomly selected Phishing/Log/Decode challenges from the 20-challenge bank |
| Flag capture | `/play/:id/flag` | Eligibility check; vault-breached celebration |
| Results | `/play/:id/results` | Score breakdown; qualification status |
| Prize wheel | `/play/:id/prize` | Physical prizes only; committed fixture segment |
| Claim result | `/play/:id/claim` | Prize and demonstration claim code |
| Leaderboard | `/leaderboard` | Animated podium with trophy SVGs, confetti on arrival from a round, score count-up, event-stats sidebar |
| Admin overview | `/admin` | Stats, inventory, kiosks, recent claims |
| Dev scenario selector | `/dev-scenarios` | **Development-only** deterministic fixture scenarios |
| Dev challenge gallery | `/dev-challenges` | **Development-only** inspection of all 20 bank challenges |

### Shared design system

- `tokens.css` + `global.css` with reference colors, typography, spacing, and glow effects.
- Reusable components: `Shell`, `Header`, `Footer`, `Button`, `Card`, `Timer`, `Modal`, `TouchKeyboard`, `Wheel`, `StepProgress`, `StatusBadge`, `PrizeLegend`, `SoundToggle`, `AnimationToggle`, `Confetti`, `TrophyIcons`.
- Reduced-motion support via `prefers-reduced-motion` plus an explicit in-app animation toggle.
- Touch targets ≥56 px for public controls; visible focus rings; semantic roles/labels.
- Responsive breakpoints for 1920×1080, 1366×768, 1280×720, and a 390 px narrow fallback.

### Challenge selection and persistence (Phase 1 prototype only)

- `services/challengeBank.ts` contains all 20 challenges.
- `services/challengeSelection.ts` implements shuffled type pools, rotation, and localStorage persistence for pool progress and the active session.
- `services/fixtureApi.ts` uses the challenge bank and persists session state locally.
- **Important**: selection, validation, scoring, timer, and persistence are frontend-only for this prototype. Phase 2 will make these server-authoritative.

### Fixture layer

- `services/fixtureData.ts` provides event status, physical prize list, leaderboard, admin data, and scenario setups.
- All fixture scores, odds, inventory, authentication, and claim codes are clearly labeled as demonstrations.

### Container preview

- `ui/Dockerfile` (multi-stage Node → Nginx) and `ui/nginx.conf`.
- `compose.phase1.yml` for local preview.

## 4. How to start and stop the preview

### Development server (no Docker)

```bash
cd ui
npm install
npm run dev
```

Stop with `Ctrl+C`.

### Production build + static server

```bash
cd ui
npm install
npm run build
npx serve -s dist -l 5173
```

Stop with `Ctrl+C`.

### Docker Compose preview

```bash
# Start
docker compose -f compose.phase1.yml up --build -d

# Stop
docker compose -f compose.phase1.yml down
```

## 5. URL and port

- Development / static server: `http://localhost:5173/`
- Docker Compose: `http://localhost:5173/`
- Dev scenario selector: `http://localhost:5173/dev-scenarios`
- Dev challenge gallery: `http://localhost:5173/dev-challenges`

## 6. Automated tests

```bash
cd ui
npm test
```

Tests cover:
- Challenge bank: exactly 20 challenges, correct type distribution, unique IDs, required metadata, and expected answers.
- Selection/rotation: one of each type per round, unique positions, full pool rotation before reshuffle, and no immediate repeat on reshuffle.
- Session persistence: save/load by ID, mismatched-ID rejection, active-session load, and clear.

## 7. Verification scripts

- `ui/screenshot.cjs` — captures the corrected home screen and a full challenge flow using the exposed dev bank.
- `ui/verify-challenges.mjs` — browser-based verification of layout, rules, challenge answers, prize labels, refresh persistence, and dev scenarios.
- `ui/console-check.cjs` — checks key routes for browser console/page errors.

Run them after `npm run dev` is running on port 5173:

```bash
cd ui
node screenshot.cjs
node verify-challenges.mjs
node console-check.cjs
```

## 8. Manual test checklist

1. Open `http://localhost:5173/`. Confirm home layout, stats, wheel preview, and **Start challenge** button.
2. Verify the wheel rim, pointer, and glow fit inside the right panel at 1920×1080, 1366×768, and 1280×720.
3. Verify statistics cards stay inside the header and do not overlap the main content.
4. Verify the primary buttons and footer are reachable without scrolling at landscape sizes.
5. Confirm the sample average score is ≤ 500 and labeled as sample data.
6. Confirm the qualification text: "Solve at least two of the three challenges and capture the final flag before time expires to unlock one prize spin."
7. Tap **Start challenge** → enter a nickname or use the generated alias. Tap the on-screen keyboard **Done** button; confirm the keyboard closes and the nickname is accepted.
8. Review the updated rules in **How to play**.
9. Choose accessibility options and tap **Ready to begin**.
10. Confirm the round has three unique challenges: one Phishing Hunt, one Log Detective, one Decode the Flag, in random order.
11. Complete the three challenges using touch/pointer only.
12. Submit an incorrect answer, then the correct answer; verify feedback and scoring.
13. Use a hint and confirm the 25-point deduction in the results breakdown.
14. On the flag-capture screen, tap **Assemble flag → Capture flag**, then **View results →**.
15. View results; if qualified, tap **Spin for a prize**.
16. On the prize-wheel screen, tap **SPIN FOR A PRIZE**. Verify the wheel animates to a physical prize segment (no "Try Again" or "Extra Points").
17. View the claim code, then tap **Done** to return home.
18. Visit `/dev-scenarios` and run each scenario.
19. Visit `/dev-challenges` and inspect all 20 challenges, their hints, answers, and explanations.
20. Start a new round, note the first challenge, refresh the browser, and confirm the same challenges and order remain and the timer did not restart.
21. Play several rounds and confirm pool rotation (each type cycles through its full set before repeating).
22. Resize the browser to 1920×1080, 1366×768, 1280×720, and 390 px wide; verify essential controls remain reachable.
23. Enable reduced motion in OS settings and confirm the wheel highlights instead of rotating.
24. Tap the **Effects on/off** toggle in the header and confirm decorative animations (podium rise, confetti) stop while functional transitions remain.
25. Tap the **Sound off/on** toggle, enable sound, and confirm audio feedback on button presses, correct/incorrect answers, and the prize-wheel spin.
26. Open `/leaderboard` after finishing a round and confirm the podium, trophy icons, confetti, and animated score counters appear.
27. Open browser DevTools and confirm no console errors.
28. Run `npm test` and confirm all tests pass.

## 9. Screenshots

Screenshots are saved in `screenshots/`:

- `home-1920x1080.png`, `home-1366x768.png`, `home-1280x720.png`, `home-390x844.png` (corrected home screen)
- `home-corrected-1920x1080.png`, `home-corrected-1366x768.png`, `home-corrected-1280x720.png`, `home-corrected-390x844.png` (verification captures)
- `register-1920x1080.png`
- `dev-scenarios-1920x1080.png`
- `dev-challenge-gallery-1920x1080.png`
- `flag-capture-success-1920x1080.png`
- `challenge-flow-flag-1920x1080.png`
- `prize-wheel-success-1920x1080.png`, `prize-wheel-awarded-1920x1080.png`
- `claim-result-1920x1080.png`
- `results-qualified-1920x1080.png`
- `leaderboard-1920x1080.png`, `leaderboard-celebration-1920x1080.png`
- `admin-1920x1080.png`

## 10. What is mocked / what remains for later phases

### Mocked in Phase 1

- Event status, scores, leaderboard, and admin data are static fixtures.
- Session persistence is localStorage-based for the prototype; a different browser or cleared storage starts fresh.
- Prize draw, inventory, odds, and claim-code generation are deterministic fixtures.
- Authentication and authorization are visual placeholders.
- Challenge selection, answer validation, scoring, and timer are implemented in the frontend for demonstration; no real backend exists yet.

### Remaining for later phases

- **Phase 2**: FastAPI backend, PostgreSQL/SQLite database, server-authoritative session persistence, answer validation, scoring, flag capture, recovery.
- **Phase 3**: Server-controlled weighted draws, inventory transactions, claim-code generation/redemption, audit ledger.
- **Phase 4**: Staff authentication/roles, challenge/prize/event management, moderation, analytics, audit history.
- **Phase 5**: Production Docker Compose, TLS/reverse proxy, health checks, backups, load testing, VM deployment.

## 11. Known issues / remaining limitations

1. **Background artwork**: The reference uses a detailed cyberpunk city skyline. Phase 1 uses a CSS gradient + simplified SVG silhouette. Approved PSM/prize artwork should replace placeholder icons and background when available.
2. **Prize wheel segment labels**: Labels are horizontal/upright; the reference has radial/tangential text in some segments. This is a documented deviation pending exact reference measurement.
3. **Narrow layout (≤390 px)**: The home layout becomes a single scrollable column; further touch-device polish is planned after booth testing.
4. **Sound**: Implemented via Web Audio API. Browsers require a user gesture to enable audio output; the sound toggle asks for it and is off by default.
5. **Docker verification**: Docker Compose preview builds and runs successfully. Verified with `docker compose -f compose.phase1.yml up --build -d`; the app is reachable at `http://localhost:5173` and passes the browser verification scripts.
6. **Reference gaps**: No separate reference images were supplied for the registration/ready screen, detailed results screen, or claim-result screen; those screens follow the written design specification and reuse the established visual system.

## 12. Next steps

Please test Phase 1 using the checklist above and share feedback. Once approved, Phase 2 will implement the FastAPI backend, real session persistence, and server-authoritative scoring.
