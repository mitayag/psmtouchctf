/* Verify the Ready → prepare → countdown → activate → Challenge 1 startup flow
 * against the deployed app through the production reverse proxy.
 * Usage: node scripts/verify-startup.mjs [baseUrl]
 * Emulation note: Playwright touch (hasTouch/isMobile) — not a physical device.
 */
import { chromium, devices } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = process.argv[2] || 'http://localhost:8080';
const OUT = 'screenshots/startup-verify';
mkdirSync(OUT, { recursive: true });

const results = [];
const pageErrors = [];
const createBodies = [];
let createdSessionIds = [];

function record(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function api(method, path, body, headers = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'kiosk-credential': 'default-kiosk', ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* ignore */ }
  return { status: res.status, data };
}

async function typeNickname(page, text) {
  const input = page.locator('#alias');
  await input.click();
  await page.waitForTimeout(200);
  for (const ch of text.toUpperCase()) {
    const key = page.locator('.touch-key', { hasText: new RegExp(`^${ch}$`, 'i') }).first();
    if (await key.count()) await key.click();
    else await page.keyboard.press(ch);
    await page.waitForTimeout(40);
  }
  return input.inputValue();
}

async function tapReady(page) {
  const btn = page.locator('[data-testid="ready-button"]');
  await btn.scrollIntoViewIfNeeded();
  await page.waitForTimeout(150);
  const box = await btn.boundingBox();
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
}

async function waitPath(page, includes, timeoutMs = 20000) {
  await page.waitForFunction((needle) => location.pathname.includes(needle), includes, { timeout: timeoutMs });
  return new URL(page.url()).pathname;
}

async function readError(page) {
  return page.evaluate(() => ({
    text: (document.querySelector('.register-error')?.textContent || '').trim() || null,
    retryVisible: !!document.querySelector('[data-testid="start-retry-button"]'),
    btnText: (document.querySelector('[data-testid="ready-button"]')?.textContent || '').trim() || null,
    inputValue: document.querySelector('#alias')?.value ?? null,
  }));
}

async function runToChallenge(page, label) {
  const path = await waitPath(page, '/ready', 20000);
  const id = path.split('/')[2];
  createdSessionIds.push(id);
  const countdowns = [];
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(400);
    const snap = await page.evaluate(() => ({
      path: location.pathname,
      count: (document.querySelector('.ready-countdown-number')?.textContent || '').trim() || null,
      go: !!document.querySelector('.ready-go'),
      text: (document.querySelector('.ready-card')?.innerText || '').replace(/\n+/g, ' | ').slice(0, 160),
    }));
    countdowns.push(snap);
    if (snap.path.includes('/challenge')) break;
    if (snap.count) record(`${label}: countdown shows ${snap.count}`, true);
    if (snap.go) record(`${label}: countdown shows GO!`, true);
  }
  const finalPath = new URL(page.url()).pathname;
  const reached = finalPath.includes('/challenge/1');
  record(`${label}: reaches Challenge 1`, reached, finalPath);
  let timer = null;
  if (reached) {
    await page.waitForSelector('.ctf-timer-value', { timeout: 10000 });
    timer = (await page.locator('.ctf-timer-value').first().textContent())?.trim();
    await page.screenshot({ path: `${OUT}/${label}-challenge.png` });
  }
  return { path, id, timer, countdowns, finalPath, reached };
}

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    ...devices['Pixel 7'],
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
    baseURL: BASE,
    recordVideo: { dir: OUT, size: { width: 1280, height: 720 } },
  });
  const page = await ctx.newPage();
  page.on('pageerror', (err) => pageErrors.push(err.message));
  page.on('request', (req) => {
    if (req.method() === 'POST' && req.url().endsWith('/api/v1/sessions')) {
      try { createBodies.push({ t: Date.now(), body: JSON.parse(req.postData() || '{}') }); } catch { /* ignore */ }
    }
  });

  // ── S1: happy path, SKEE, standard, sound OFF (default), recorded ──
  await page.goto('/play/setup', { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.setItem('psm-sound-enabled', 'false'));
  const nick = await typeNickname(page, 'SKEE');
  record('S1: nickname typed', nick === 'SKEE', `value=${nick}`);
  const beforeCreates = createBodies.length;
  await tapReady(page);
  const s1 = await runToChallenge(page, 'S1-happy');
  const s1Creates = createBodies.slice(beforeCreates);
  record('S1: exactly one create POST', s1Creates.length === 1, `count=${s1Creates.length}`);
  record('S1: force_new true on first attempt', s1Creates[0]?.body?.force_new === true);
  record('S1: correct payload', s1Creates[0]?.body?.alias === 'SKEE' && s1Creates[0]?.body?.accessibility_mode === 'standard' && s1Creates[0]?.body?.publish_consent === true, JSON.stringify(s1Creates[0]?.body));
  const timerOk = s1.timer && ['03:00', '02:59', '02:58', '02:57'].includes(s1.timer);
  record('S1: standard timer ≈ 03:00', timerOk, `timer=${s1.timer}`);
  const nums = new Set(s1.countdowns.map((c) => c.count).filter(Boolean));
  record('S1: countdown ran 3-2-1', nums.has('3') && nums.has('2') && nums.has('1'), [...nums].join(','));

  // ── S2: validation error persists (no wipe), no Retry for validation ──
  await page.goto('/play/setup', { waitUntil: 'networkidle' });
  await typeNickname(page, 'x');
  await tapReady(page);
  await page.waitForSelector('.register-error', { timeout: 5000 });
  const e2a = await readError(page);
  await page.waitForTimeout(1500);
  const e2b = await readError(page);
  record('S2: validation message shown', (e2a.text || '').includes('2–20'), e2a.text);
  record('S2: error NOT wiped after 1.5s', !!e2b.text && e2b.text === e2a.text, e2b.text);
  record('S2: no Retry for validation errors', !e2b.retryVisible);
  record('S2: nickname preserved', (e2b.inputValue || '').toUpperCase() === 'X', `value=${e2b.inputValue}`);
  record('S2: still on register', new URL(page.url()).pathname === '/play/setup');
  await page.screenshot({ path: `${OUT}/S2-validation.png` });

  // ── S3: backend 500 → inline error + Retry → recovery ──
  await page.goto('/play/setup', { waitUntil: 'networkidle' });
  await typeNickname(page, 'SKEE');
  let failNext = true;
  await page.route('**/api/v1/sessions', async (route) => {
    if (failNext && route.request().method() === 'POST') {
      failNext = false;
      return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ detail: 'Internal server error', request_id: 'test-500' }) });
    }
    return route.continue();
  });
  const before3 = createBodies.length;
  await tapReady(page);
  await page.waitForSelector('[data-testid="start-retry-button"]', { timeout: 8000 });
  const e3 = await readError(page);
  record('S3: 500 shows friendly inline error', (e3.text || '').includes('Something went wrong'), e3.text);
  record('S3: Retry button visible', e3.retryVisible);
  record('S3: Ready button re-enabled', e3.btnText === 'Ready to begin', e3.btnText);
  await page.screenshot({ path: `${OUT}/S3-error-retry.png` });
  await page.locator('[data-testid="start-retry-button"]').scrollIntoViewIfNeeded();
  await page.locator('[data-testid="start-retry-button"]').click();
  const s3path = await waitPath(page, '/ready', 15000);
  createdSessionIds.push(s3path.split('/')[2]);
  record('S3: Retry recovers to /ready', s3path.includes('/ready'), s3path);
  const bodies3 = createBodies.slice(before3);
  record('S3: two attempts total', bodies3.length === 2, `count=${bodies3.length}`);
  record('S3: server-error retry uses force_new=true (fresh, not recovery)', bodies3[1]?.body?.force_new === true, JSON.stringify(bodies3[1]?.body));
  await page.unroute('**/api/v1/sessions');

  // ── S4: connection failure → recovery with force_new=false ──
  await page.goto('/play/setup', { waitUntil: 'networkidle' });
  await typeNickname(page, 'SKEE');
  let abortNext = true;
  await page.route('**/api/v1/sessions', async (route) => {
    if (abortNext && route.request().method() === 'POST') {
      abortNext = false;
      return route.abort('failed');
    }
    return route.continue();
  });
  const before4 = createBodies.length;
  await tapReady(page);
  await page.waitForSelector('[data-testid="start-retry-button"]', { timeout: 8000 });
  const e4 = await readError(page);
  record('S4: connection error copy shown', (e4.text || '').includes('Could not reach'), e4.text);
  record('S4: Retry visible after network failure', e4.retryVisible);
  await page.screenshot({ path: `${OUT}/S4-connection-retry.png` });
  await page.locator('[data-testid="start-retry-button"]').scrollIntoViewIfNeeded();
  await page.locator('[data-testid="start-retry-button"]').click();
  const s4path = await waitPath(page, '/ready', 15000);
  createdSessionIds.push(s4path.split('/')[2]);
  record('S4: Retry recovers to /ready', s4path.includes('/ready'), s4path);
  const bodies4 = createBodies.slice(before4);
  record('S4: recovery retry uses force_new=false', bodies4[1]?.body?.force_new === false, JSON.stringify(bodies4[1]?.body));
  await page.unroute('**/api/v1/sessions');

  // ── S5: empty nickname → generated alias, full flow ──
  await page.goto('/play/setup', { waitUntil: 'networkidle' });
  const before5 = createBodies.length;
  await tapReady(page);
  const s5 = await runToChallenge(page, 'S5-empty-nickname');
  const body5 = createBodies[before5]?.body;
  record('S5: generated alias sent', !!body5 && (!body5.alias || body5.alias.length >= 2), JSON.stringify(body5?.alias));
  record('S5: standard timer ≈ 03:00', ['03:00', '02:59', '02:58', '02:57'].includes(s5.timer), `timer=${s5.timer}`);

  // ── S6: extended time + sound ON ──
  await page.goto('/play/setup', { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.setItem('psm-sound-enabled', 'true'));
  await page.reload({ waitUntil: 'networkidle' });
  await typeNickname(page, 'EXTENDED');
  await page.locator('.register-checkbox input').nth(2).check(); // extended time
  const before6 = createBodies.length;
  await tapReady(page);
  const s6 = await runToChallenge(page, 'S6-extended-sound');
  const body6 = createBodies[before6]?.body;
  record('S6: extended mode payload', body6?.accessibility_mode === 'extended-time', body6?.accessibility_mode);
  record('S6: extended timer ≈ 05:00', ['05:00', '04:59', '04:58', '04:57'].includes(s6.timer), `timer=${s6.timer}`);
  record('S6: sound on did not block gameplay', s6.reached);

  // ── S7: double tap → one logical start ──
  await page.goto('/play/setup', { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.setItem('psm-sound-enabled', 'false'));
  await typeNickname(page, 'SKEE');
  const before7 = createBodies.length;
  await page.locator('[data-testid="ready-button"]').scrollIntoViewIfNeeded();
  await page.waitForTimeout(150);
  await page.evaluate(() => {
    const b = document.querySelector('[data-testid="ready-button"]');
    b.click();
    b.click();
  });
  const s7path = await waitPath(page, '/ready', 15000).catch(() => null);
  createdSessionIds.push((s7path || '').split('/')[2]);
  await page.waitForTimeout(600);
  const bodies7 = createBodies.slice(before7);
  record('S7: double tap → exactly one create POST', bodies7.length === 1, `count=${bodies7.length}`);
  record('S7: reached /ready', !!s7path && s7path.includes('/ready'), s7path);

  // ── S8: existing active session → force_new abandons, new round starts ──
  const stale = await api('POST', '/api/v1/sessions', { alias: 'StalePlayer', publish_consent: true, accessibility_mode: 'standard', kiosk_credential: 'default-kiosk', force_new: false });
  record('S8: pre-created session', stale.status === 200, `status=${stale.status}`);
  if (stale.status === 200) {
    createdSessionIds.push(stale.data.id);
    const begun = await api('POST', `/api/v1/sessions/${stale.data.id}/begin`, {});
    record('S8: stale session active', begun.status === 200 && begun.data.state === 'active', begun.data?.state);
    await page.goto('/play/setup', { waitUntil: 'networkidle' });
    await typeNickname(page, 'FRESH');
    const before8 = createBodies.length;
    await tapReady(page);
    const s8path = await waitPath(page, '/ready', 15000);
    createdSessionIds.push(s8path.split('/')[2]);
    record('S8: new round reached /ready', s8path.includes('/ready'), s8path);
    const newId = s8path.split('/')[2];
    record('S8: new session is not the stale one', newId !== stale.data.id, `${newId} vs ${stale.data.id}`);
    const staleAfter = await api('GET', `/api/v1/sessions/${stale.data.id}`, null);
    record('S8: stale session abandoned', staleAfter.data?.state === 'abandoned', staleAfter.data?.state);
    const body8 = createBodies[before8]?.body;
    record('S8: force_new=true used', body8?.force_new === true);
  }

  // ── Cleanup: abandon everything we created ──
  let abandoned = 0;
  for (const id of [...new Set(createdSessionIds.filter(Boolean))]) {
    try {
      const r = await api('POST', `/api/v1/sessions/${id}/abandon`, { idempotency_key: `verify-cleanup-${id}` });
      if (r.status === 200) abandoned += 1;
    } catch { /* ignore */ }
  }
  record('Cleanup: abandoned created sessions', true, `${abandoned}/${new Set(createdSessionIds.filter(Boolean)).size}`);

  // ── Global: no uncaught page errors ──
  record('Global: no uncaught page errors', pageErrors.length === 0, pageErrors.join(' | ').slice(0, 300));

  const report = {
    base: BASE,
    emulation: 'Playwright Chromium hasTouch/isMobile (NOT a physical Android device)',
    passed: results.filter((r) => r.pass).length,
    failed: results.filter((r) => !r.pass).length,
    results,
    pageErrors,
    createBodies,
    finishedAt: new Date().toISOString(),
  };
  writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
  console.log(`\n${report.passed} passed, ${report.failed} failed — report: ${OUT}/report.json`);
  if (report.failed > 0) process.exitCode = 1;

  await ctx.close();
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
