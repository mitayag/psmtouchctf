/* Touch-scroll repro/verify harness.
 * Usage: node scripts/touch-scroll-check.mjs <label> [--record]
 * Emulates an Android-like viewport (hasTouch/isMobile) and dispatches
 * real CDP touch swipes. Emulation only — not a physical device.
 */
import { chromium, devices } from 'playwright';
import { mkdirSync } from 'node:fs';

const label = process.argv[2] || 'run';
const record = process.argv.includes('--record');
const BASE = process.env.BASE_URL || 'http://localhost:5199';
const OUT = `screenshots/${label}`;
mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { name: 'landscape-1280x720', width: 1280, height: 720 },
  { name: 'landscape-1280x600', width: 1280, height: 600 },
];

async function measure(page) {
  return page.evaluate(() => {
    const body = getComputedStyle(document.body);
    const html = getComputedStyle(document.documentElement);
    const shell = document.querySelector('.shell');
    const main = document.querySelector('.shell-main');
    const doc = document.scrollingElement;
    return {
      cssViewport: { w: window.innerWidth, h: window.innerHeight },
      visualViewport: window.visualViewport
        ? { w: Math.round(window.visualViewport.width), h: Math.round(window.visualViewport.height), scale: window.visualViewport.scale }
        : null,
      dpr: window.devicePixelRatio,
      htmlOverflow: html.overflow + '/' + html.overflowY,
      bodyOverflow: body.overflow + '/' + body.overflowY,
      scrollY: window.scrollY,
      docScrollH: doc ? doc.scrollHeight : null,
      docClientH: doc ? doc.clientHeight : null,
      shellH: shell ? Math.round(shell.getBoundingClientRect().height) : null,
      shellScrollable: shell ? shell.scrollHeight > shell.clientHeight + 1 : null,
      mainClientH: main ? main.clientHeight : null,
      mainScrollH: main ? main.scrollHeight : null,
      mainScrollable: main ? main.scrollHeight > main.clientHeight + 1 : null,
      buttonsReachable: (() => {
        const b = [...document.querySelectorAll('button, a')]
          .find((el) => /start challenge|leaderboard/i.test(el.textContent || ''));
        if (!b) return null;
        const r = b.getBoundingClientRect();
        return { text: b.textContent.trim().slice(0, 30), top: Math.round(r.top), inViewport: r.top >= 0 && r.bottom <= window.innerHeight };
      })(),
    };
  });
}

async function touchSwipeUp(page) {
  // Dispatch CDP touch events (finger starts low, moves up = scroll-down gesture).
  const cdp = await page.context().newCDPSession(page);
  const vw = await page.evaluate(() => window.innerWidth);
  const vh = await page.evaluate(() => window.innerHeight);
  const x = Math.round(vw / 2);
  const yStart = Math.round(vh * 0.8);
  const yEnd = Math.round(vh * 0.3);
  const steps = 12;
  const touch = (type, points) =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: points,
      modifiers: 8, // touch
    });
  await touch('touchStart', [{ x, y: yStart, id: 1 }]);
  for (let i = 1; i <= steps; i++) {
    const y = Math.round(yStart + ((yEnd - yStart) * i) / steps);
    await touch('touchMove', [{ x, y, id: 1 }]);
    await page.waitForTimeout(16);
  }
  await touch('touchEnd', []);
  await cdp.detach();
  await page.waitForTimeout(400);
}

async function main() {
  for (const vp of VIEWPORTS) {
    const browser = await chromium.launch();
    const ctx = await browser.newContext({
      ...(record
        ? {
            recordVideo: { dir: OUT, size: { width: vp.width, height: vp.height } },
          }
        : {}),
      ...devices['Pixel 7'],
      // override to exact viewport under test (device base is 412x915 dpr 2.625)
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 1,
      isMobile: true,
      hasTouch: true,
      baseURL: BASE,
    });
    const page = await ctx.newPage();
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.waitForSelector('.home-layout, .shell', { timeout: 15000 });
    await page.waitForTimeout(600);

    const before = await measure(page);
    await page.screenshot({ path: `${OUT}/${vp.name}-initial.png` });

    await touchSwipeUp(page);
    const afterSwipe = await measure(page);
    await page.screenshot({ path: `${OUT}/${vp.name}-after-swipe.png` });

    // Try scrolling shell-main directly (nested scroller probe)
    const mainScrollAttempt = await page.evaluate(() => {
      const m = document.querySelector('.shell-main');
      if (!m) return null;
      const before = m.scrollTop;
      m.scrollTop = 9999;
      return { before, after: m.scrollTop, clientH: m.clientHeight, scrollH: m.scrollHeight };
    });

    // Horizontal overflow probe
    const horizontal = await page.evaluate(() => ({
      docScrollW: document.scrollingElement.scrollWidth,
      docClientW: document.scrollingElement.clientWidth,
    }));

    console.log(JSON.stringify({ viewport: vp.name, label, before, afterSwipe, mainScrollAttempt, horizontal }, null, 2));
    const videoPath = await page.video()?.path().catch(() => null);
    await ctx.close();
    await browser.close();
    if (record && videoPath) {
      const { renameSync, existsSync } = await import('node:fs');
      const target = `${OUT}/${vp.name}-swipe.webm`;
      if (existsSync(videoPath)) renameSync(videoPath, target);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
