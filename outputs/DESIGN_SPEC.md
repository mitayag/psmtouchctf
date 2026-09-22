# PSM TouchCTF — Design Specification

Version 1.0 · 20 September 2026 · Companion: [Product requirements](PRODUCT_REQUIREMENTS.md)

## Sample design references

The project-root `references/` folder is the designated location for the user-provided approved sample designs, including touchscreen mockups and the CyberSpin-style prize-wheel sample. From this document, the relative path is `../references/`. Use these images as the visual source of truth for layout, colors, typography, components, and wheel styling. Sample filenames are optional; one image may contain multiple screens.

Before implementation, inspect the supplied reference images and reconcile the proposed visual values in these specifications with them. If multiple samples conflict, use the version explicitly identified by the user as approved. Until the images are supplied and reviewed, exact visual fidelity remains unverified.

## 1. Intent and reference fidelity

Create a welcoming cybersecurity booth experience: **Capture. Crack. Defend.** Players complete short touch-based investigations, capture a flag, see their rank, and potentially spin for a physical prize. Preserve the requested dark neon cyberpunk touchscreen direction and CyberSpin-style prize wheel.

The source is the referenced conversation **PSM Cyberspin Development Brief**, ID `6aacfab6-537c-83ec-a0d0-d2bb88732709`. Retrieved text confirms a large Android touchscreen, 16:9 composition, dark cyberpunk/arcade treatment, short interactive challenges, and a prize wheel with configurable inventory and weights. The approved screenshots themselves were not available in the retrieved conversation. Consequently, the exact colors, typography, geometry, and layouts below are **proposed implementation values**, not measurements of the approved images. When images become available, compare and reconcile them before visual sign-off; preserve their distinctive hierarchy, frame shapes, branding, and wheel treatment. Do not claim pixel fidelity until that comparison is complete.

Confirmed scope: home, challenge, flag capture, leaderboard, admin panel, prize wheel, and Linux VM deployment. Proposed baseline: three challenges in 180 seconds; rules and score formulas are authoritative in the PRD.

## 2. Visual direction

Use a near-black/navy stage, luminous cyan framing, magenta accents, restrained violet gradients, and high-contrast readable text. Build a cyber control-console atmosphere with fine grid lines, corner brackets, small status lights, and subtle circuit traces. Keep ornament behind content. Neon should emphasize actions and achievements; body text must remain sharp rather than glowing.

Brand hierarchy: PSM logo → **PSM TouchCTF** → **Capture. Crack. Defend.** Retain supplied PSM artwork without redrawing or inventing institutional seals. Reserve a logo slot until an approved asset is provided. The prize screen may use **Hack. Spin. Win.** as a secondary CyberSpin-inspired line; the product name remains PSM TouchCTF.

### Design tokens

| Token | Proposed value | Use |
|---|---|---|
| `bg.canvas` | `#070B17` | Fullscreen background |
| `bg.surface` | `#111A2E` | Cards and panels |
| `bg.raised` | `#1A2640` | Inputs, dialogs, selected rows |
| `text.primary` | `#F4F7FF` | Titles and main text |
| `text.secondary` | `#B8C5DD` | Instructions and metadata |
| `accent.cyan` | `#20E3FF` | Primary actions, focus, outlines |
| `accent.magenta` | `#FF4FD8` | Wheel accents, celebration |
| `accent.violet` | `#A98BFF` | Decorative gradients |
| `state.success` | `#53F5AD` | Solved and captured states |
| `state.warning` | `#FFD166` | Timer warnings, low stock |
| `state.error` | `#FF738C` | Validation and failure |
| `border.subtle` | `#34445F` | Neutral boundaries |

Validate actual foreground/background combinations; token selection alone does not establish accessibility. Primary filled buttons use dark text on cyan. Never place white text over a bright glow without an opaque backing.

Spacing scale: 4, 8, 12, 16, 24, 32, 48, 64 px. Cards use 16 px corners; buttons 12 px; badges pill-shaped. Optional clipped decorative corners belong to an outer frame and must not clip focus rings. Borders are 1–2 px; selected states use a 3 px edge plus icon/text. Panel shadows are soft and dark; cyan outer glow is reserved for the main action and wheel rim.

### Typography and iconography

Bundle fonts locally: Rajdhani Bold for display titles, Inter for controls/body, and JetBrains Mono for flags, timers, and technical clues, subject to retaining their license files. System sans-serif/monospace fallbacks must preserve layout. Proposed 1080p sizes: hero 64/70 px, screen title 40/48, panel title 28/36, body 22/32, button 24/30, metadata 18/26, timer 40/44. Smaller displays may reduce body to 18 px; admin tables may use 16 px. Avoid all-caps paragraphs and excessive letter spacing.

Use consistent 2 px stroke icons with text labels: shield, flag, timer, trophy, hint, sound, home, and settings. Decorative icons are hidden from assistive technology; interactive icons have accessible names. Never communicate success, difficulty, or connectivity through color alone.

## 3. Layout and navigation

Primary reference viewport: 1920 × 1080 landscape. Also support 1366 × 768 and 1280 × 720. Use a fluid CSS layout, not a screenshot scaled to fit. Main shell: 32 px outer padding at 1080p, 96 px header, flexible main area, 80 px footer, 24 px inter-region gap. At 720p reduce shell padding to 16 px, header to 72 px, footer to 64 px and gaps to 16 px. Main content can scroll when needed; controls cannot become unreachable.

The header contains PSM branding left, screen/round context center, and timer/status right. The footer provides contextual navigation, muted audio toggle, and privacy/help access. During a round, Home becomes **End round** with confirmation. Public users never see administrative navigation or operational errors containing technical details.

```text
┌───────────────────────────────────────────────────────────────┐
│ PSM TouchCTF         ROUND / CHALLENGE            TIME / SCORE │
├───────────────────────────────────────────────────────────────┤
│                                                               │
│       PRIMARY INTERACTION                 CONTEXT / PROGRESS   │
│       Large, readable content             Instructions         │
│       Touch targets and evidence          Hint / feedback      │
│                                                               │
├───────────────────────────────────────────────────────────────┤
│ Back / End round       Step progress            Primary action │
└───────────────────────────────────────────────────────────────┘
```

## 4. Screen specifications

### 4.1 Home / attract — `/`

Center the brand and tagline above a large **Start challenge** button. Place three concise instruction cards beneath: **Solve 3 challenges → Capture the flag → Unlock a prize spin**. A supporting panel shows current event, local leaderboard preview, round duration, and an accurate qualification summary. Do not promise every player a prize. Background grid movement is slow and optional.

Primary action opens registration. Secondary **Leaderboard** opens a read-only overlay/page with a clear return. Footer includes sound (off by default), accessibility options, and privacy notice. Home displays **Temporarily unavailable — please ask booth staff** when the API is unavailable or the event is paused. A stock-out banner says **Challenges open • Prize spins unavailable**.

### 4.2 Registration and ready state — `/play/setup`

Use a centered panel, maximum 880 px wide: nickname entry, built-in touch keyboard or compatible OS keyboard, concise rules, public nickname notice, and **Ready to begin**. Nickname is 2–20 characters. Support generated aliases so personal information is unnecessary. Public leaderboard participation is an explicit choice; opting out does not affect score or prizes. Show the selected accessibility mode before starting.

The timer starts only after the backend creates the active round in response to Ready, not while reading rules. A brief “3, 2, 1” visual may appear before server start if the protocol schedules a future start timestamp; it must not silently consume play time. Default implementation omits this countdown.

### 4.3 Challenge — `/play/:sessionId/challenge/:position`

Use a roughly 65% task / 35% context split on landscape. Header shows **Challenge 1 of 3**, a server-synchronized timer, and score. Left: challenge title, one short instruction, and evidence canvas. Right: objective, selected-answer summary, hint, and feedback. Footer: three progress markers, **Skip**, and **Submit answer**. Submit remains disabled until the answer schema is complete; explanation is visible beside it.

Required interaction patterns:

| Pattern | Touch behavior | Non-drag alternative |
|---|---|---|
| Phishing Hunt | Tap suspicious email regions; numbered markers show selections | Focusable evidence list with toggles |
| Log/Packet Detective | Tap one or more readable rows; expand details | Selectable list and Details button |
| Decode the Flag | Choose tokens or enter a short decoded value | Text field plus on-screen character keys |
| SOC Triage | Move alert cards into labeled categories | Tap card, then tap destination |
| Firewall ordering | Reorder rule cards | Move up / Move down controls |

MVP requires the first three; the others are extension patterns. All technical content is simulated. Avoid terminal emulators, real targets, tiny packet dumps, or interactions requiring a physical keyboard.

Correct: green icon and **Challenge solved**, point change, concise explanation, **Continue**. Incorrect: **Not quite — review the highlighted clue** without revealing the answer; two attempts maximum. After exhaustion or skip, show the learning explanation and Continue. Hints require a clear **Use hint (−25 possible points)** action; charge once. Feedback time remains part of the round and is visible in the timer. At 30 seconds add warning icon/text; at 10 seconds change emphasis without flashing.

### 4.4 Final flag capture — `/play/:sessionId/flag`

Center a framed vault/flag motif, three challenge-status indicators, and earned flag fragments. After at least two solves, offer **Assemble flag** to populate the session-specific `PSM{…}` value, followed by a large **Capture flag** button. Manual input is optional; touch-only completion must work. The backend still validates both the flag and solve prerequisites.

Show **FLAG CAPTURED** with a brief shield/flag animation, final score breakdown, and **View results** after acknowledgement. Timeout freezes inputs and transitions to results; a client-side animation can never override server expiry. Players with fewer than two solves bypass capture and receive a supportive completion summary.

### 4.5 Results — `/play/:sessionId/results`

Display nickname, score, challenges solved, capture status, elapsed time, and leaderboard rank where publication was chosen. Show base points, hint/attempt deductions, capture bonus, and time bonus as separate rows. Qualified users see **Prize spin unlocked** and **Spin for a prize**. Others see **Thanks for defending the network** and **Finish**. Stock-out or event policy changes must produce truthful messages and preserve any pending entitlement.

No score or award is presented as final before the server confirms it. Finish clears kiosk-local player state and returns home. Displayed rank may change as new players finish.

### 4.6 Prize wheel — `/play/:sessionId/prize`

Preserve the CyberSpin visual character: a large segmented neon wheel, luminous double rim, fixed top pointer, alternating cyan/magenta/violet/dark wedges, bold prize labels, a central **SPIN** hub, and celebratory result card. Proposed landscape layout is 62% wheel / 38% prize/status panel. Wheel diameter is `min(64vh, 760px)` subject to available width; reserve room for the fixed pointer above the rim. Use bundled prize icons/images with short labels and a matching text legend.

Use 4–12 visible segments where possible. Each eligible prize has a stable segment ID. Equal-angle wedges are allowed even when probabilities differ, but always show **Segment size does not represent odds. Odds depend on prize weights and remaining stock.** Provide an accessible odds/details panel. If fewer than four prizes remain, use honest repeated segments mapped to the same prize ID and aggregate odds in the legend; never invent available prizes. If none remain, disable Spin. More than 12 active prize types must be rejected by the event configuration validator for this layout.

The spin API returns a committed award and the corresponding immutable wheel snapshot. Only then does the client animate to the assigned segment, with 4–6 full rotations and a 4–6 second ease-out. The pointer remains fixed. Disable further input while submitting/animating. Never calculate the winning prize in the browser or make animation timing determine the award. On uncertain network outcome show **Checking your spin…** and retrieve the existing result. On reload, restore the committed award and skip/replay only its animation.

Winner presentation: **You won [prize]**, prize image, claim code, **Show this code to booth staff**, and **Done**. Confetti lasts at most two seconds and stays behind content. Sound is opt-in. Reduced motion replaces rotation with a brief highlight and direct result. Claim confirmation is staff-only; Done does not mean redeemed. An unclaimed award remains stored after kiosk reset.

### 4.7 Leaderboard — `/leaderboard`

Show event name, explicit ruleset/accessibility-mode filter, top three podium cards, then ranks 4–10 in a clean table. Columns: rank, nickname, score, solved count, elapsed time. Highlight the current player's row even outside the top ten with an appended **Your result** card. Ties follow the PRD. Do not show claim codes, private identifiers, or exact personal details.

Refresh every 10 seconds without moving keyboard focus. Display last updated and stale/offline status. Handle empty state (**Be the first to capture a flag**) and event pause. Public view returns home after 30 seconds of inactivity, with a warning in the last 10 seconds.

### 4.8 Admin — `/admin`

Use the same colors and brand with restrained glow, denser spacing, and conventional forms. Separate login route and protected navigation. Desktop layout: 240 px sidebar, top status bar, content area. Sidebar: Overview, Challenges, Prizes & Odds, Sessions, Claims, Leaderboard, Event Settings, Users & Audit. Collapse into an accessible drawer on narrower screens.

Overview includes active kiosks, completed rounds, qualification rate, outstanding claims, low stock, and service status. Challenge editor provides schema-aware inputs, local media upload, preview, validation, draft/publish/archive. Prizes show image, available/reserved/redeemed stock, weight, current probability, active toggle, and reorder control. Clearly distinguish display order from probability weight.

Claims: large claim-code field, prize/session summary, single **Confirm handover** action, and unmistakable redeemed/already-redeemed states. Inventory adjustments require a reason. Event settings preview qualification, duration, and scoring before publishing a new ruleset. Destructive actions name their scope, require confirmation and appropriate role, and create an audit record. **Reset kiosk** clears one live experience; it never deletes configuration, scores, claims, or inventory.

### 4.9 Shared states

Every data screen defines loading (stable skeleton + text), empty, retryable error, unavailable, stale, and permission-denied states. Dialogs trap focus, support Escape where safe, and restore focus on close. Failed submissions preserve entered answers. Session expiry clears sensitive local state and returns to a friendly home notice. Reconnection retrieves authoritative state before re-enabling actions.

## 5. Components and interaction contract

| Component | Required states / behavior |
|---|---|
| Action button | Default, pressed, focused, loading, disabled; loading retains label/width |
| Challenge card | Available, current, solved, failed, skipped; text plus icon |
| Timer | Normal, 30-second warning, 10-second urgent, expired; accessible announcements at thresholds only |
| Score counter | Static authoritative total; optional brief delta animation |
| Evidence selection | Unselected, selected, focused, locked; selection is reversible before submission |
| Hint panel | Available, confirmation, revealed; penalty visible before use |
| Touch keyboard | Letters/numbers/backspace/space/done; flag mode adds braces/underscore |
| Status banner | Persistent connectivity or maintenance information; never hides controls |
| Toast | Noncritical confirmation only; important failures stay inline |
| Modal | Named heading, clear action/cancel, focus management, scrollable body |
| Prize card | Available, reserved/won, redeemed, unavailable |

Use pointer events; trigger activation on release, not pointer-down. Ignore duplicate taps through pending states and backend idempotency. Do not require hover, long-press, pinch, precise swipes, or drag-only gestures. Transitions normally take 150–250 ms. No flashing above three times per second; no continuous shake effects.

## 6. Touch, responsive, and accessibility requirements

- Public interactive targets: at least 56 × 56 CSS px, preferably 64 px high for primary actions, with at least 12 px separation. Admin targets: at least 44 × 44 px.
- Use WCAG 2.2 AA as the acceptance target: normal text contrast at least 4.5:1; large text and essential control boundaries at least 3:1. Test rendered states, not just token swatches.
- Support keyboard-only operation, semantic controls, visible focus, screen-reader labels, and logical DOM order. Announce validation and score results without repeatedly announcing the timer.
- From 1024 px wide, retain two columns if evidence stays readable. From 768–1023 px, collapse context beneath the task. Below 768 px, use one column with a compact sticky timer and primary action; do not cover content with the action bar.
- Support 200% text zoom, portrait tablets, and a 390 px wide narrow fallback. Gameplay is optimized for landscape, but rotation cannot discard progress or produce a blocking “rotate device” wall.
- Account for safe-area insets and dynamic viewport height. On-screen keyboard must leave the focused field and confirmation button visible. Avoid competing custom and OS keyboards.
- Offer reduced motion, sound toggle, and an extended-time ruleset before the round. Extended-time scores appear in their own leaderboard; qualification remains available.
- Timed rounds expire according to game rules. Registration/results use a 60-second inactivity reset with a 10-second warning and **Keep playing/viewing**. Pending prize requests are recovered before clearing the display. Admin login expires separately under the PRD.

## 7. Assets and implementation handoff

React/Vite components should share centralized CSS tokens and reusable shell, cards, buttons, timer, evidence controls, wheel, and modal primitives. Prefer SVG for crisp wheel geometry and icons, with accessible HTML equivalents. Preload local fonts and essential assets. No runtime CDN fonts, external analytics, or network-dependent decorative media.

Store approved brand/prize media with versioned identifiers and alt text. Optimize large backgrounds for the target device; do not embed readable instructions in images. Use an explicit asset manifest recording source, license, and approved variant. UI display values come from the active server ruleset; never hard-code conflicting durations or prize odds.

## 8. Design acceptance checklist

1. All screens above exist with happy, loading, error, and recovery states.
2. A player completes the entire round and claim-code presentation using touch only.
3. At 1920×1080, 1366×768, and 1280×720, timer and primary action remain readable and reachable; at 390 px and 200% zoom no essential information is clipped.
4. Contrast, keyboard navigation, focus order, reduced motion, and screen-reader status messages are checked manually as well as with automated tooling.
5. Timer, score, qualification, wheel segment, and displayed award match backend state through retries and reloads.
6. Public screens reveal neither answers before submission nor admin controls, private player data, or infrastructure details.
7. The approved screenshots are compared side-by-side before visual sign-off; any differences are recorded. This reference-image check is outstanding because the source images were unavailable.

Accessibility reference: [W3C WCAG 2.2](https://www.w3.org/TR/WCAG22/). Operational and behavioral acceptance criteria are in the companion PRD.
