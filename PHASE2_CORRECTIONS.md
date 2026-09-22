# Phase 2 Corrections — PSM TouchCTF

**Date:** 2026-09-21  
**Scope:** Fix the Phase 2 kiosk CTF experience without starting Phase 3 (prize allocation/claims).

## 1. What was wrong

| Area | Symptom | Root cause |
|---|---|---|
| Timer | Countdown stuck at `00:00` immediately after starting | Backend stored naive UTC datetimes; browsers ahead of UTC parsed `expires_at` as local time, so it already looked expired. Frontend also derived the countdown from local clock without server sync. |
| Challenge quality | Original 20 challenges were placeholder-ish or trivia | Bank was not grounded in real source material. |
| Answer leakage | Flag values and `correct` markers were discoverable in the client bundle | `ui/src/services/challengeBank.ts` shipped the full challenge bank, including `correct` flags, decode `answer`s, and full explanations. |
| Prize wheel | Wheel appeared playable in Phase 2 | UI did not clearly mark prize allocation as Phase-3-only. |

## 2. What was changed

### Backend (`api/`)

- Added explicit `Z` suffix serialization for all datetimes returned by `SessionOut` (`schemas.py`).
- Added `server_now` to `SessionOut` so the frontend can sync against server time.
- Added `Ruleset.extended_duration_seconds` and `ChallengeRevision.content_hash` with Alembic migrations:
  - `8f4a2b1c9d3e_add_extended_duration_seconds_to_rulesets.py`
  - `3c8d5e2f1a4b_add_content_hash_to_challenge_revisions.py`
- Implemented versioned challenge seeding: new revisions are only inserted when `content_hash` changes.
- Ensured public challenge payloads strip `correct`, `answer`, and `explanation`.
- Added exception handlers in `main.py` so `PermissionError` returns `403` and `ValueError` returns `422` instead of generic `500`.

### Frontend (`ui/`)

- Rewrote `Timer.tsx` to sync against `server_now` and use monotonic `performance.now()` for the countdown.
- Replaced the 20-challenge bank in `api/data/challenge_bank.json` with source-informed phishing, log, and decode scenarios.
- Updated `scripts/generate_challenge_bank_ts.py` to generate a **client-safe** `ui/src/services/challengeBank.ts`:
  - strips `correct` from evidence/log items,
  - strips `answer` from decode challenges,
  - redacts `PSM{...}` flag values in text fields,
  - omits `explanation` from the client bundle.
- Removed `correct`/`answer` from the UI `Challenge` type and from `api.ts` response mapping.
- Disabled offline answer validation in `fixtureApi.ts` so the production bundle never needs canonical answers.
- Updated `DevChallengeGalleryScreen` so it no longer displays correct answers.
- Updated `ui/nginx.conf` to proxy `/api/` to the backend container so the production Docker image can talk to the API out of the box.
- Kept the prize wheel visible but clearly labeled as Phase-3-only ("Prize allocation is coming in Phase 3.").

### Tests

- Backend pytest: 19 tests passing.
- Frontend Vitest: 20 tests passing.
- TypeScript build: clean.
- Browser verification (`ui/verify-phase2.mjs`): passes end-to-end.
- Production bundle scan: zero `"correct"` or `"answer"` keys; only redacted/template `PSM{...}` strings remain.

## 3. New challenge bank (20 scenarios)

| # | ID | Type | Title | Primary source |
|---|---|---|---|---|
| 1 | phishing-display-name | Phishing | Display Name Trap | NIST Phishing guidance |
| 2 | phishing-url-hostname | Phishing | Hostname Hijack | NIST Phishing guidance |
| 3 | phishing-document-share | Phishing | Shared Doc Login | NIST Phishing guidance |
| 4 | phishing-payment-change | Phishing | Payment Detail Change | NIST Phishing guidance |
| 5 | phishing-qr-code | Phishing | QR Code Redirection | NIST Phishing guidance |
| 6 | phishing-mfa-request | Phishing | Unexpected MFA Approval | NIST MFA guidance |
| 7 | phishing-tech-support | Phishing | Fake Tech Support | NIST Phishing guidance |
| 8 | logs-brute-success | Logs | Failed Then Successful | Microsoft brute-force analysis |
| 9 | logs-password-spray | Logs | Password Spray | Microsoft brute-force analysis |
| 10 | logs-stale-credential | Logs | Stale Service Credential | Azure SecurityEvent examples |
| 11 | logs-privileged-group | Logs | Privileged Group Change | Azure SecurityEvent examples |
| 12 | logs-log-cleared | Logs | Security Log Cleared | Azure SecurityEvent examples |
| 13 | logs-bulk-download | Logs | Bulk File Download | Microsoft SecurityEvent patterns |
| 14 | logs-scheduled-task | Logs | Suspicious Scheduled Task | Microsoft SecurityEvent patterns |
| 15 | decode-base64 | Decode | Base64 | RFC 4648 |
| 16 | decode-hex | Decode | Hexadecimal | RFC 4648 |
| 17 | decode-binary | Decode | Binary ASCII | RFC 4648 |
| 18 | decode-url | Decode | URL Encoding | RFC 3986 / 4648 concepts |
| 19 | decode-caesar | Decode | Caesar Cipher | Classical substitution cipher |
| 20 | decode-substitution | Decode | Symbol Substitution | Classical substitution cipher |

Full source mapping and adaptation notes are in `CHALLENGE_SOURCES.md`.

## 4. Verification performed

- **Unit/controlled-clock expiry tests** (`api/tests/test_engine.py`):
  - `test_submit_answer_one_ms_before_expiry_accepted`
  - `test_submit_answer_exactly_at_expiry_rejected`
  - `test_capture_flag_one_ms_before_expiry_accepted`
  - `test_capture_flag_exactly_at_expiry_rejected`
- **Real browser countdown test**: manually created a session, shortened `expires_at` to 10 seconds, and observed the timer count `00:10 → 00:01` before the UI transitioned to results.
- **Bundle leak scan**:
  ```bash
  npm run build
  grep -R -o -E '"correct":\s*(true|false)' dist/assets/*.js | wc -l   # 0
  grep -R -o -E '"answer":\s*"[^"]+"' dist/assets/*.js | wc -l       # 0
  ```
- **Browser screenshots** saved to `/tmp/phase2-verify/` confirm timer starts near `02:57` and prize wheel shows the Phase-2 unavailable state.

## 5. Phase 2 Round Lifecycle and Audio Fixes

### What was wrong

| Area | Symptom | Root cause |
|---|---|---|
| Session reuse | Finished sessions carried over to the next player (no clean slate) | `resetForNextPlayer()` only cleared audio prefs; `localStorage` still held the old active session ID, causing the next player to land on the same challenge |
| Challenge count display | "Challenge 4 of 3" appeared after solving the third challenge | `ChallengeScreen` HeaderRight used `challenges.filter(c => c.outcome).length + 1` to derive display; after three challenges with outcomes, the math overflowed to 4 |
| Next button | "Next" appeared after solving all challenges instead of "Capture Flag" | The next-button label was always `pos < 3 ? 'Next →' : 'Capture Flag →'` without checking whether the user had qualified |
| Stale responses | Old API responses could overwrite newer session state in the polling hook | `useGameSession` polling didn't abort in-flight requests when a newer session ID was set; no guard against stale `sessionId` |
| Double ready/click | Users could double-click "Ready to begin" and create duplicate sessions | No debounce or disabled state on the ready button |
| Play again | No way to start a new round from the results screen | ResultsScreen only had a "Finish" button, requiring navigation back to home first |
| Active session pointer | No way to resume a session from the home screen | `api.setActiveSession` / `getActiveSession` / `clearActiveSession` existed but were never wired into the home/register flow |
| Sound enable | All audio was oscillator-based and gated behind the `?sound=1` query param or a hidden toggle | No visible, discoverable UI to enable sounds; many users never hear audio |
| Audio quality | All sounds were Web Audio oscillator tones (beeps/clicks) | No real audio assets; oscillator tones sounded mechanical and lacked variety |
| Encouraging feedback | After a wrong answer, the user only saw "Incorrect" with no guidance | No encouragement message; the UX felt discouraging after failures |
| Button press feedback | Buttons had no tactile press animation | All buttons had static styling; no micro-interaction on tap |
| Challenge entrance | Challenges loaded without animation | Cards appeared instantly; no entrance animation for challenges |
| Confetti on flag capture | Flag capture celebration lacked visual flair | Only a box-shadow animation played; no particle or confetti effect |

### What was changed

#### Audio system

- **New Kenney UI Audio pack** (`ui/public/sounds/kenney/`): 14 CC0 WAV files (`click1.wav`–`click3.wav`, `pause1.wav`, `powerup1.wav`, `powerdown1.wav`, `screenshot1.wav`, `two_tone_high.wav`, `two_tone_low.wav`, `success1.wav`, `error1.wav`, `open1.wav`, `close1.wav`, `transition1.wav`, `back1.wav`, `coin3.wav`).
- **Rewritten `audio.ts`**: Loads WAV buffers via Web Audio API on first `enable()` call; falls back to oscillator if decoding fails. Throttles rapid calls (120ms). `stopAll()` disconnects all active sources for clean round transitions. Persists `enabled`/`volume` in localStorage.
- **New `SoundActivator` component** (`SoundActivator.tsx` + `.css`): Compact enable/test/mute/volume control. Test plays a click and a power-up. Volume slider. Added to HomeScreen (below action buttons) and RegisterScreen (compact, below card).

#### Round lifecycle

- **`useGameSession.ts` rewritten**:
  - `isCurrent(sessionId)` guard: all state updates after API calls check that `sessionIdRef.current` still matches; stale responses are discarded.
  - Abort pending requests on unmount via `AbortController`.
  - Polling stops when `state !== 'active'` (no more infinite polling after finalization).
  - `createSession()` calls `clearActiveSession()` before creating, so the old pointer is always cleared.
  - `resetForNextPlayer()` calls `api.clearActiveSession()`.
  - `submitAnswer()` now returns `attemptsRemaining` so callers can display encouraging messages.
  - `start()`, `captureFlag()`, `skip()`, `useHint()` all return proper typed results.
- **`api.ts`**: Added `setActiveSession(id, state)`, `getActiveSession()`, `clearActiveSession()` using localStorage (`touchctf_active_session`).

#### HomeScreen

- Loads active session from localStorage on mount.
- Shows a "Resume" button when an active session exists and its state is `'active'`.
- "Start Challenge" always passes empty nickname to RegisterScreen (fresh slate).
- `SoundActivator` wired below the action buttons.

#### RegisterScreen

- Alias defaults to empty string regardless of navigation state (clears previous nickname).
- Ready button disables while readying (shows "Starting…").
- Catch block on `createSession` failure shows error and re-enables button.
- `SoundActivator` added below the card.

#### ReadyScreen

- Prevents double start via `startedRef` (effect only fires once per mount).
- Catches start errors and updates error state.
- Calls `api.setActiveSession(sessionId, 'active')` after successful start.
- Plays `startRound` sound.
- CSS animations: `ready-enter` (fade up + scale) and `ready-pulse` (number pulse).

#### ChallengeScreen

- **HeaderRight** now receives `position` prop (URL param); display is `{position} of 3` — no more `solvedCount + 1` math.
- **Navigation guard**: invalid positions (e.g., `/challenge/5`) redirect to `/challenge/1`. Finalized sessions redirect to flag/results.
- **Double-tap protection**: `isSubmitting` state disables submit/hint/skip while a request is in flight.
- **Next-button logic**: After solving all challenges (solvedCount ≥ 2 and pos === 3), "Capture Flag →" is shown. After solving 1 or 2 and pos === 3, "View results →" is shown. `isNavigating` prevents double-navigation.
- **Encouraging messages**: After incorrect answer, if `attemptsRemaining > 0`, a gentle message appears: "You have N attempt(s) left. Review the clue and try again!"
- **Button feedback**: Submit shows "Checking…" while in flight.

#### FlagCaptureScreen

- **Confetti overlay**: 40 animated confetti pieces (5 colors) fall from the top with random delays and durations, using pure CSS `confetti-fall` keyframes.
- Confetti appears during the `celebrating` state (1.5s after flag capture).
- Respects `prefers-reduced-motion` (via existing global rule).

#### ResultsScreen

- **"Play again" button**: Primary button that calls `resetForNextPlayer()` and navigates to `/` (home), providing a clean slate for the next round.
- "Finish" button demoted to ghost style below "Play again".

#### CSS animations and micro-interactions

- **Button press**: `.btn:active` scale(0.97) (global `Button.css`).
- **Challenge card entrance**: `.evidence-item` and `.challenge-evidence-card` use `card-enter` keyframe (fade up + translate).
- **Score bump**: `.challenge-score-value.bump` triggers `score-bump` keyframe on point change.
- **Feedback pop**: `.challenge-feedback` uses `feedback-pop` keyframe (fade up).
- **Flag celebration**: `.fc-status-card.celebrating` uses `flag-celebrate` keyframe (box-shadow pulse + scale).
- **Ready pulse**: `.ready-count` uses `ready-pulse` keyframe (scale 1 → 1.08 → 1).
- All animations respect `prefers-reduced-motion` via global media query.

### Verification

- Backend pytest: 19/19 passing.
- Frontend Vitest: 20/20 passing.
- TypeScript build: clean (no errors).
- Manual: Home shows Resume button when active session exists; starting a new round clears old session; Ready shows countdown without double-fire; Challenge shows "N of 3" correctly; Next/Capture Flag/View results buttons appear at correct times; encouraging messages appear after incorrect answers; Play again returns to fresh home state; confetti appears on flag capture; sounds play when enabled.

## 6. Countdown Screen, Preparation Flow, and End Game

### What was wrong

| Area | Symptom | Root cause |
|---|---|---|
| Countdown removed | After fixing the ReadyScreen freeze, the 3→2→1→GO countdown was removed entirely; users went straight from "Ready" to challenge with no countdown | The countdown code was the source of the StrictMode and AbortController bugs; simplest fix was to remove it |
| No preparation step | `begin` endpoint started the timer immediately, giving countdown no buffer time | No `prepared` state existed; `begin` was the only transition |
| End Game missing | No way to quit a round mid-challenge without browser refresh or back button | No abandon/end-game UI existed in ChallengeScreen, FlagCaptureScreen, or HomeScreen |
| Nickname lost | HomeScreen hardcoded `{ nickname: '' }`, discarding typed nickname; RegisterScreen always called `generateAlias()` replacing user input | `HomeScreen.start()` used empty nickname; RegisterScreen validated empty input and silently generated alias |

### What was changed

#### Backend: `prepared` state

- **`models.py`**: Added `GameSessionState.prepared` enum value and `prepared_at` nullable column on `GameSession`.
- **`engine.py`**: Added `prepare_session()` function (idempotent: ready→prepared, returns prepared/active if already prepared/active). Updated `begin_round()` to handle prepared→active transition and to be fully idempotent (already-active sessions return without resetting timer). Updated `start_session()` to treat `prepared` as an active state (one-per-kiosk). Updated `to_session_out()` to include `prepared_at`.
- **`schemas.py`**: Added `prepared_at` field to `SessionOut` with Z-suffix serializer.
- **`main.py`**: Added `POST /sessions/{id}/prepare` endpoint. Updated `begin` endpoint to delegate to `engine.begin_round()` (removed redundant state check).
- **`alembic/versions/d4e5f6a7b8c9_add_prepared_state.py`**: Migration adds `prepared_at` column.

#### Frontend: Countdown screen

- **`ReadyScreen.tsx` rewritten**: Three-phase flow: (1) prepare (ready→prepared via `prepare()`), (2) countdown (3→2→1→GO! with 1s intervals), (3) activate (begin timer, navigate to challenge/1). Reduced motion: instant numbers, no animation. Each number gets a countdown tick sound; GO gets a distinct ascending sound. Uses `navigateRef` to survive React StrictMode. Resumes countdown from `prepared_at` if page reloads mid-countdown. Already-active sessions skip directly to challenge/1.
- **`ReadyScreen.css` updated**: Large glowing cyan countdown numbers with pop-in animation. GO text with glow and rotation entrance. Reduced motion: no animations, no text-shadow.
- **`audio.ts`**: Added `countdown` and `countdownGo` sound names with oscillator fallbacks (880 Hz tick, ascending 1047→1568 Hz sweep for GO). Volume overrides and throttle settings added.
- **`ui/public/sounds/kenney/countdown.wav`** and **`countdownGo.wav`**: Generated sine-wave WAV files for countdown ticks and GO cue.

#### Frontend: End Game button + confirmation dialog

- **`ConfirmDialog.tsx` + `.css`**: Shared modal dialog component with backdrop blur, Escape-to-cancel, focus trapping, and accessible aria attributes.
- **`ChallengeScreen.tsx`**: End Game button in actions row. Opens `ConfirmDialog` with message about abandoned round not qualifying for prize. On confirm: calls `abandon()`, clears active session, navigates home. Double-tap protection via `isEnding` state.
- **`FlagCaptureScreen.tsx`**: End Game button below results buttons. Same `ConfirmDialog` flow.
- **`HomeScreen.tsx`**: Already had End game + Start new flow with custom confirm dialog (kept as-is).

#### Frontend: Nickname and resume fixes

- **`HomeScreen.tsx`**: Passes typed nickname to RegisterScreen via `location.state`. Shows Resume button only for `active`/`ready`/`prepared` states. Completed/expired sessions get pointer cleared on mount.
- **`RegisterScreen.tsx`**: Validates non-empty nickname input, shows error if empty. Never silently replaces with `generateAlias()`.
- **`useGameSession.ts`**: `createSession()` stores pointer for `ready`/`prepared`/`active` states. Added `prepare()` function. `start()` uses independent AbortController (not tracked in pool) to avoid being killed by polling cleanup.

#### Frontend: Route guards

- **`ChallengeScreen.tsx`**: Route guard now treats `prepared` same as `ready` (redirects to ReadyScreen).
- **`useGameSession.ts`**: `createSession` sets pointer for `prepared` state.

### Verification

- Backend pytest: 19/19 passing.
- Frontend Vitest: 47/47 passing (27 new tests for countdown, lifecycle, and end game).
- TypeScript build: clean (no errors).
- Production bundle: zero leaked flags or answers.
- Browser verification: full flow from home → nickname → countdown (3→2→1→GO) → 3 challenges → flag capture → results → Play again.

## 7. Known limitations / next steps

- The offline/fixture answer validator is intentionally disabled. Dev testing of correct answers now requires the backend running; this is the trade-off for removing answer metadata from the client bundle.
- `DevChallengeGalleryScreen` no longer shows correct answers or explanations. Use the backend `api/data/challenge_bank.json` and `CHALLENGE_SOURCES.md` for authoring/review.
- Phase 3 (real prize allocation, stock checking, claim codes) is still stubbed; only the Phase-2 unavailable state is implemented.
- The `?session=` query parameter is present in the URL but the frontend currently resumes from `localStorage`; a future handoff may wish to wire query-param session recovery.

## 8. How to run the verification suite

```bash
# Backend tests
cd api
source .venv/bin/activate
pytest -q

# Frontend tests and build
cd ../ui
npm test -- --run
npx tsc --noEmit
npm run build

# Browser verification (requires api + ui dev servers running)
node verify-phase2.mjs /tmp/phase2-verify

# Docker run
docker compose up --build -d
# App is then available at http://localhost:8080
# To run verification against the Docker deployment:
node verify-phase2.mjs /tmp/phase2-verify-docker http://localhost:8080
```
