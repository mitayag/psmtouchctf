/* Multi-screen touch-scroll audit.
 * Usage: node scripts/touch-audit.mjs [label] [--record]
 * Emulation only (no physical device): CDP touch gestures on mobile-emulated Chromium.
 */
import { chromium, devices } from 'playwright';
import { mkdirSync } from 'node:fs';

const label = process.argv[2] || 'audit';
const record = process.argv.includes('--record');
const BASE = process.env.BASE_URL || 'http://localhost:5199';
const OUT = `screenshots/${label}`;
mkdirSync(OUT, { recursive: true });

const VIEWPORT = { width: 1280, height: 600 };
const ROUTES = [
  { name: 'home', path: '/' },
  { name: 'register', path: '/play/setup' },
  { name: 'leaderboard', path: '/leaderboard' },
  { name: 'staff', path: '/staff' },
  { name: 'ready-missing', path: '/play/nope/ready' },
  { name: 'flag-missing', path: '/play/nope/flag' },
  { name: 'results-missing', path: '/play/nope/results' },
  { name: 'prize-missing', path: '/play/nope/prize' },
  { name: 'claim-missing', path: '/play/nope/claim' },
  { name: 'admin', path: '/admin' },
  { name: 'dev-scenarios', path: '/dev-scenarios' },
  { name: 'dev-challenges', path: '/dev-challenges' },
];

async function measure(page) {
  return page.evaluate(() => {
    const doc = document.scrollingElement;
    const body = getComputedStyle(document.body);
    const candidates = [...document.querySelectorAll('*')].filter((el) => {
      const cs = getComputedStyle(el);
      if (cs.position !== 'fixed' && cs.position !== 'absolute') return false;
      const r = el.getBoundingClientRect();
      return r.width > window.innerWidth + 2;
    });
    return {
      bodyOverflow: body.overflowY,
      scrollY: Math.round(window.scrollY),
      scrollable: doc.scrollHeight > doc.clientHeight + 1,
      docScrollH: doc.scrollHeight,
      docClientH: doc.clientHeight,
      horizontalOverflow: doc.scrollWidth - doc.clientWidth,
      wideFixedCount: candidates.length,
    };
  });
}

async function touchSwipe(page) {
  const cdp = await page.context().newCDPSession(page);
  const vw = await page.evaluate(() => window.innerWidth);
  const vh = await page.evaluate(() => window.innerHeight);
  const x = Math.round(vw / 2);
  const yStart = Math.round(vh * 0.8);
  const yEnd = Math.round(vh * 0.25);
  const send = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points, modifiers: 8 });
  await send('touchStart', [{ x, y: yStart, id: 1 }]);
  for (let i = 1; i <= 14; i++) {
    await send('touchMove', [{ x, y: Math.round(yStart + ((yEnd - yStart) * i) / 14), id: 1 }]);
    await page.waitForTimeout(16);
  }
  await send('touchEnd', []);
  await cdp.detach();
  await page.waitForTimeout(350);
}

async function swipeToBottom(page) {
  for (let i = 0; i < 4; i++) {
    const { scrollY, scrollable } = await measure(page);
    if (!scrollable) break;
    const atEnd = scrollY >= (await page.evaluate(() => document.scrollingElement.scrollHeight - document.scrollingElement.clientHeight - 2));
    if (atEnd) break;
    await touchSwipe(page);
  }
}

async function auditPage(page, name) {
  const initial = await measure(page);
  await touchSwipe(page);
  const afterSwipe = await measure(page);
  await swipeToBottom(page);
  const atBottom = await measure(page);
  const reachedBottom = !initial.scrollable || atBottom.scrollY >= initial.docScrollH - initial.docClientH - 4;
  const pass =
    initial.bodyOverflow === 'visible' &&
    initial.horizontalOverflow <= 0 &&
    afterSwipe.scrollY >= (initial.scrollable ? 1 : 0) &&
    reachedBottom &&
    initial.wideFixedCount === 0;
  return { name, initial, afterSwipe, atBottom, reachedBottom, pass };
}

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    ...(record ? { recordVideo: { dir: OUT, size: { width: VIEWPORT.width, height: VIEWPORT.height } } } : {}),
    ...devices['Pixel 7'],
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
    baseURL: BASE,
  });
  const page = await ctx.newPage();
  const results = [];

  for (const route of ROUTES) {
    await page.goto(route.path, { waitUntil: 'networkidle' }).catch(() => {});
    await page.waitForTimeout(700);
    const r = await auditPage(page, route.name);
    results.push(r);
    await page.screenshot({ path: `${OUT}/${route.name}-bottom.png` });
    if (route.name === 'home' || route.name === 'register' || route.name === 'leaderboard') {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(200);
      await page.screenshot({ path: `${OUT}/${route.name}-top.png` });
    }
  }

  // Modal audits on register: open rules overlay, measure + screenshot.
  await page.goto('/play/setup', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  const rulesBtn = page.getByRole('button', { name: /how to play/i });
  if (await rulesBtn.count()) {
    await rulesBtn.click();
    await page.waitForTimeout(300);
    const modal = await page.evaluate(() => {
      const card = document.querySelector('.register-rules .ctf-card');
      const overlay = document.querySelector('.register-rules');
      if (!card) return null;
      const r = card.getBoundingClientRect();
      return {
        fitsViewport: r.height <= window.innerHeight,
        cardScrollable: card.scrollHeight > card.clientHeight + 1,
        overlayScrollable: overlay ? overlay.scrollHeight > overlay.clientHeight + 1 : null,
        cardH: Math.round(r.height),
        vh: window.innerHeight,
      };
    });
    // Try scrolling inside card if it overflows
    if (modal?.cardScrollable) {
      await page.evaluate(() => {
        const card = document.querySelector('.register-rules .ctf-card');
        card.scrollTop = 9999;
      });
      await page.waitForTimeout(200);
      modal.scrolledTo = await page.evaluate(() => document.querySelector('.register-rules .ctf-card').scrollTop);
    }
    await page.screenshot({ path: `${OUT}/modal-rules.png` });
    results.push({ name: 'modal-rules', modal, pass: !!modal && modal.fitsViewport && (!modal.cardScrollable || (modal.scrolledTo ?? 0) > 0) });
    await page.getByRole('button', { name: /got it/i }).click().catch(() => {});
    await page.waitForTimeout(200);
  }

  // HAUQR modal on home
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  const qrBtn = page.getByRole('button', { name: /qr/i });
  if (await qrBtn.count()) {
    await qrBtn.first().click();
    await page.waitForTimeout(500);
    const hauqr = await page.evaluate(() => {
      const dlg = document.querySelector('.hauqr-dialog');
      if (!dlg) return null;
      const r = dlg.getBoundingClientRect();
      const content = document.querySelector('.hauqr-content');
      return {
        fitsViewport: r.height <= window.innerHeight && r.top >= 0,
        dialogH: Math.round(r.height),
        vh: window.innerHeight,
        contentScrollable: content ? content.scrollHeight > content.clientHeight + 1 : null,
      };
    });
    if (hauqr?.contentScrollable) {
      await page.evaluate(() => {
        const c = document.querySelector('.hauqr-content');
        c.scrollTop = 9999;
      });
      await page.waitForTimeout(200);
      hauqr.scrolledTo = await page.evaluate(() => document.querySelector('.hauqr-content').scrollTop);
    }
    await page.screenshot({ path: `${OUT}/modal-hauqr.png` });
    results.push({ name: 'modal-hauqr', hauqr, pass: !!hauqr && hauqr.fitsViewport && (!hauqr.contentScrollable || (hauqr.scrolledTo ?? 0) > 0) });
    await page.keyboard.press('Escape').catch(() => {});
  }

  // Touch-target audit (player-facing controls ≥56 high) on home + register
  const collectTargets = async (path) => {
    await page.goto(path, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    return page.evaluate(() => {
      const els = [...document.querySelectorAll('button, a[href], input:not([type=range]):not([type=hidden]), select, textarea, .register-checkbox, .home-nickname-input-wrap, .touch-key')];
      return els
        .filter((el) => {
          const r = el.getBoundingClientRect();
          const cs = getComputedStyle(el);
          if (!(r.width > 0 && r.height > 0) || cs.visibility === 'hidden' || cs.display === 'none') return false;
          // A checkbox/radio nested in a label: the effective tap target is the label.
          if (el.tagName === 'INPUT') {
            const label = el.closest('label');
            if (label && label !== el && label.getBoundingClientRect().height >= 56) return false;
          }
          return true;
        })
        .map((el) => ({
          label: (el.getAttribute('aria-label') || el.textContent || el.className || '').trim().slice(0, 40),
          h: Math.round(el.getBoundingClientRect().height),
        }))
        .filter((t) => t.h < 56);
    });
  };
  const underHome = await collectTargets('/');
  const underRegister = await collectTargets('/play/setup');
  const targets = [...underHome.map((t) => ({ ...t, page: 'home' })), ...underRegister.map((t) => ({ ...t, page: 'register' }))];
  results.push({ name: 'touch-targets-under-56', targets, pass: targets.length === 0 });

  const failed = results.filter((r) => !r.pass);
  console.log(JSON.stringify({ label, viewport: `${VIEWPORT.width}x${VIEWPORT.height}`, emulation: 'chromium hasTouch/isMobile (NOT a physical device)', results, failedCount: failed.length, allPass: failed.length === 0 }, null, 2));
  await ctx.close();
  await browser.close();
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
