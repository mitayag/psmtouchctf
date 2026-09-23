/* Reproduce the "Ready to begin" startup failure against the deployed app.
 * Usage: node scripts/repro-startup.mjs [baseUrl] [label]
 * Captures: console, page errors, all network requests/responses, click dispatch.
 */
import { chromium, devices } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = process.argv[2] || 'http://localhost:8080';
const label = process.argv[3] || 'repro';
const OUT = `screenshots/${label}`;
mkdirSync(OUT, { recursive: true });

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

  const consoleLogs = [];
  const pageErrors = [];
  const requests = [];
  const responses = [];

  page.on('console', (msg) => {
    consoleLogs.push({ type: msg.type(), text: msg.text(), location: msg.location() });
  });
  page.on('pageerror', (err) => {
    pageErrors.push({ message: err.message, stack: err.stack });
  });
  page.on('request', (req) => {
    requests.push({
      method: req.method(),
      url: req.url(),
      postData: req.postData()?.slice(0, 500),
      headers: Object.fromEntries(Object.entries(req.headers()).filter(([k]) => ['content-type', 'kiosk-credential', 'x-request-id'].includes(k))),
      resourceType: req.resourceType(),
      time: Date.now(),
    });
  });
  page.on('response', async (res) => {
    const req = res.request();
    let bodySnippet = null;
    try {
      if (res.url().includes('/api/')) bodySnippet = (await res.text()).slice(0, 500);
    } catch { /* ignore */ }
    responses.push({
      status: res.status(),
      method: req.method(),
      url: res.url(),
      body: bodySnippet,
      time: Date.now(),
    });
  });
  page.on('requestfailed', (req) => {
    requests.push({ method: req.method(), url: req.url(), failed: req.failure()?.errorText, resourceType: req.resourceType(), time: Date.now() });
  });

  // 1. Land on register
  await page.goto('/play/setup', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/1-register-initial.png` });

  // Environment probe (secure context, APIs)
  const env = await page.evaluate(() => ({
    href: location.href,
    isSecureContext: window.isSecureContext,
    origin: location.origin,
    hasRandomUUID: typeof crypto.randomUUID === 'function',
    hasCrypto: typeof crypto === 'object',
    hasGetRandomValues: typeof crypto.getRandomValues === 'function',
    localStorageAvailable: (() => { try { localStorage.setItem('t', '1'); localStorage.removeItem('t'); return true; } catch { return false; } })(),
    userAgent: navigator.userAgent,
    online: navigator.onLine,
  }));

  // 2. Disable sound first (sound disabled scenario): toggle SoundActivator if present
  const soundBtn = page.locator('.sound-activator-btn').first();
  const soundVisible = await soundBtn.isVisible().catch(() => false);
  if (soundVisible) {
    // Ensure muted: check current label
    const label1 = await soundBtn.textContent();
    // Click until muted — compact shows "Enable sound & test" when off
    if (/enable/i.test(label1 || '')) {
      // already off
    } else {
      // sound on → mute via the mute button if present
      const muteBtn = page.locator('.sound-activator-btn[aria-label="Mute sound"]');
      if (await muteBtn.count()) await muteBtn.click();
    }
  }
  const soundState = await page.evaluate(() => ({
    audioEnabled: (() => { try { return localStorage.getItem('psm-audio-muted'); } catch { return null; } })(),
    buttons: [...document.querySelectorAll('.sound-activator-btn')].map((b) => (b.textContent || '').trim()),
  }));

  // 3. Enter nickname "Skee" via on-screen keyboard (input is readOnly)
  const input = page.locator('#alias');
  await input.click();
  await page.waitForTimeout(300);
  for (const ch of ['S', 'K', 'E', 'E']) {
    const key = page.locator('.touch-key', { hasText: new RegExp(`^${ch}$`, 'i') }).first();
    if (await key.count()) await key.click();
    else await page.keyboard.press(ch);
    await page.waitForTimeout(80);
  }
  const nickname = await input.inputValue();
  await page.screenshot({ path: `${OUT}/2-nickname-entered.png` });

  // 4. Probe button state before click
  const btn = page.locator('[data-testid="ready-button"]');
  const btnBefore = await btn.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      text: (el.textContent || '').trim(),
      disabled: el.disabled,
      rect: { top: Math.round(r.top), left: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height) },
      display: cs.display,
      visibility: cs.visibility,
      pointerEvents: cs.pointerEvents,
      elementAtCenter: (() => {
        const c = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return c ? (c.tagName + '.' + c.className).slice(0, 120) : null;
      })(),
    };
  });

  // 5. Attach a direct click listener probe + tap via touchscreen
  await page.evaluate(() => {
    (window).__clickProbe = { fired: 0, timestamp: null };
    const b = document.querySelector('[data-testid="ready-button"]');
    b.addEventListener('click', () => {
      (window).__clickProbe.fired += 1;
      (window).__clickProbe.timestamp = Date.now();
    }, { once: false });
  });

  const t0 = Date.now();
  const box = await btn.boundingBox();
  // Use touchscreen tap (real touch path)
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);

  // 6. Watch what happens for up to 15s
  const observations = [];
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(500);
    const snap = await page.evaluate(() => ({
      path: location.pathname,
      btnText: (document.querySelector('[data-testid="ready-button"]')?.textContent || '').trim() || null,
      btnDisabled: document.querySelector('[data-testid="ready-button"]')?.disabled ?? null,
      errorText: (document.querySelector('.register-error')?.textContent || '').trim() || null,
      clickFired: (window).__clickProbe?.fired ?? null,
      startingVisible: !!document.querySelector('.ready-spinner'),
      title: document.title,
    }));
    observations.push({ t: Date.now() - t0, ...snap });
    if (i === 2) await page.screenshot({ path: `${OUT}/3-just-after-tap.png` });
    if (snap.path !== '/play/setup') break;
  }
  await page.screenshot({ path: `${OUT}/4-final-state.png` });

  // If we reached /ready, keep watching through countdown to challenge
  const pathNow = new URL(page.url()).pathname;
  let countdownSnapshots = [];
  if (pathNow.includes('/ready')) {
    for (let i = 0; i < 30; i++) {
      await page.waitForTimeout(500);
      const s = await page.evaluate(() => ({
        path: location.pathname,
        text: (document.querySelector('.ready-card')?.innerText || '').replace(/\n+/g, ' | ').slice(0, 200),
      }));
      countdownSnapshots.push(s);
      if (s.path.includes('/challenge')) break;
    }
    await page.screenshot({ path: `${OUT}/5-after-countdown.png` });
  }

  const report = {
    base: BASE,
    env,
    soundState,
    nickname,
    btnBefore,
    finalPath: new URL(page.url()).pathname,
    observations,
    countdownSnapshots,
    pageErrors,
    consoleErrors: consoleLogs.filter((l) => l.type === 'error' || l.type === 'warning'),
    consoleAll: consoleLogs,
    apiRequests: requests.filter((r) => r.url.includes('/api/')),
    apiResponses: responses.filter((r) => r.url.includes('/api/')),
    allRequestsCount: requests.length,
  };
  writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));

  await ctx.close();
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
