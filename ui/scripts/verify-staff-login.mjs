/* Verify staff/admin login surfaces readable errors (never [object Object])
 * and successful login works, against the deployed UI.
 * Usage: node scripts/verify-staff-login.mjs [baseUrl]
 * Emulation note: Playwright (headless chromium) — login is not touch-specific.
 */
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://localhost:8080';
const results = [];

function record(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

const browser = await chromium.launch();
const page = await browser.newPage();
const pageErrors = [];
page.on('pageerror', (err) => pageErrors.push(String(err)));

try {
  // ── Staff screen: empty submit stays client-side with a readable message ──
  await page.goto(`${BASE}/staff`, { waitUntil: 'networkidle' });
  const loginBtn = page.locator('button', { hasText: 'Login' }).first();
  let posts = 0;
  page.on('request', (req) => {
    if (req.method() === 'POST' && req.url().includes('/staff/login')) posts += 1;
  });
  await loginBtn.click();
  await page.waitForTimeout(300);
  const errEl = page.locator('[role="alert"]').first();
  const emptyMsg = await errEl.textContent().catch(() => null);
  record(
    'staff empty submit: readable client validation',
    !!emptyMsg && !emptyMsg.includes('[object Object]') && emptyMsg.includes('username and password'),
    JSON.stringify(emptyMsg),
  );
  record('staff empty submit: no network POST', posts === 0, `posts=${posts}`);

  // ── Wrong password: server 401 shown readably ──
  await page.fill('input[type="text"]', 'admin');
  await page.fill('input[type="password"]', 'definitely-wrong-password');
  await loginBtn.click();
  await page.waitForTimeout(800);
  const wrongMsg = await errEl.textContent().catch(() => null);
  record(
    'staff wrong password: readable 401 detail',
    !!wrongMsg && !wrongMsg.includes('[object Object]') && wrongMsg.includes('Invalid credentials'),
    JSON.stringify(wrongMsg),
  );

  // ── Correct password: login succeeds ──
  await page.fill('input[type="password"]', 'AdminPass123!');
  await loginBtn.click();
  await page.waitForTimeout(1000);
  const bodyText = await page.locator('body').textContent();
  const loggedIn = bodyText.includes('Logged in as') || bodyText.includes('Claim Lookup');
  record('staff correct password: successful login', loggedIn, loggedIn ? 'portal visible' : bodyText.slice(0, 120));

  // ── Admin console: empty submit readable ──
  await page.goto(`${BASE}/admin`, { waitUntil: 'networkidle' });
  const adminBtn = page.locator('button', { hasText: 'Login' }).first();
  let adminPosts = 0;
  page.on('request', (req) => {
    if (req.method() === 'POST' && req.url().includes('/staff/login')) adminPosts += 1;
  });
  await adminBtn.click();
  await page.waitForTimeout(300);
  const adminErr = await page.locator('[role="alert"]').first().textContent().catch(() => null);
  record(
    'admin empty submit: readable client validation',
    !!adminErr && !adminErr.includes('[object Object]') && adminErr.includes('username and password'),
    JSON.stringify(adminErr),
  );
  record('admin empty submit: no network POST', adminPosts === 0, `posts=${adminPosts}`);

  record('no uncaught page errors', pageErrors.length === 0, pageErrors.join('; ') || 'none');
} catch (e) {
  record('script completed', false, String(e));
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
process.exit(failed.length ? 1 : 0);
