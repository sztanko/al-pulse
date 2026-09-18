/** Verify the built site, not the edit.
 *
 * Checks, per page × theme × viewport:
 *   - console errors, page errors, failed requests   → fail on any
 *   - horizontal overflow (scrollWidth vs clientWidth)
 *   - interactive controls covered by the sticky header
 *   - the growth slider actually redraws the chart (the interaction dimi
 *     specifically asked to survive the rewrite)
 *
 * The whole page is scrolled before anything is asserted: lazily hydrated
 * islands never initialise otherwise, and a hydration failure can sit in
 * production indefinitely behind a clean build and a clean screenshot.
 *
 * Exit code, not string matching: `grep -c error` returns 0 when the command
 * itself failed to run, and "no console errors" contains the word "error".
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdtempSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const DIST = resolve(process.cwd(), 'dist');
const BASE = '/al-pulse';
const PORT = Number(process.env.VERIFY_PORT ?? 8799);

const ROUTES = [
  ['/', 'index'],
  ['/map', 'map'],
  ['/areas', 'areas index'],
  ['/method', 'method'],
  ['/areas/faro', 'region'],
  ['/areas/albufeira_faro', 'municipality'],
  ['/areas/carregueira_chamusca_santarem', 'locality'],
];
const THEMES = ['light', 'dark'];
const VIEWPORTS = [
  { name: 'narrow', width: 360, height: 720 },
  { name: 'wide', width: 1280, height: 900 },
];

const failures = [];
const fail = (where, msg) => failures.push(`${where}: ${msg}`);

/** Serve dist under its real base path — the built URLs bake it in. */
function serve() {
  const root = mkdtempSync(join(tmpdir(), 'alp-verify-'));
  symlinkSync(DIST, join(root, 'al-pulse'));
  const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], {
    cwd: root,
    stdio: 'ignore',
  });
  return { srv, root };
}

async function scrollThrough(page) {
  await page.evaluate(async () => {
    const step = Math.floor(window.innerHeight * 0.8);
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 90));
    }
    window.scrollTo(0, document.body.scrollHeight);
    await new Promise((r) => setTimeout(r, 350));
    window.scrollTo(0, 0);
    await new Promise((r) => setTimeout(r, 150));
  });
}

async function checkPage(browser, route, label, theme, vp) {
  const where = `${label} [${theme}/${vp.name}]`;
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    colorScheme: theme,
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();

  const problems = [];
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`console: ${m.text().slice(0, 200)}`);
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${String(e).slice(0, 200)}`));
  page.on('requestfailed', (r) =>
    problems.push(`request failed: ${r.url().slice(0, 160)}`)
  );

  const url = `http://127.0.0.1:${PORT}${BASE}${route}`;
  const resp = await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
  if (!resp || resp.status() >= 400) fail(where, `HTTP ${resp ? resp.status() : 'no response'}`);

  // Apply the explicit theme the way the toggle does, so the [data-theme] path
  // is exercised and not only the media query.
  await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);

  await scrollThrough(page);

  // 1. Horizontal overflow. A screenshot cannot show this.
  const overflow = await page.evaluate(() => {
    const d = document.documentElement;
    return { scroll: d.scrollWidth, client: d.clientWidth };
  });
  if (overflow.scroll > overflow.client + 1) {
    // Name the widest offender: "the page is too wide" is not actionable.
    const culprits = await page.evaluate(() => {
      const lim = document.documentElement.clientWidth;
      const out = [];
      for (const el of document.querySelectorAll('body *')) {
        const r = el.getBoundingClientRect();
        // Only the right edge matters in LTR: an element parked off-screen to
        // the left (the skip link) does not add to scrollWidth, and reporting
        // it buries the element that does.
        if (r.right > lim + 1) {
          const id = `${el.tagName.toLowerCase()}${
            el.className && typeof el.className === 'string'
              ? '.' + el.className.trim().split(/\s+/).join('.')
              : ''
          }`;
          out.push(`${id} [${Math.round(r.left)}..${Math.round(r.right)}]`);
        }
      }
      return [...new Set(out)].slice(0, 4);
    });
    fail(
      where,
      `scrolls sideways: scrollWidth ${overflow.scroll} > clientWidth ${overflow.client}` +
        (culprits.length ? ` — widest: ${culprits.join(' | ')}` : '')
    );
  }

  // 2. Covered controls. Focusing a control scrolls it into view, so the act of
  //    tapping one can be what hides it behind the sticky header.
  const covered = await page.evaluate(() => {
    const sel = 'a[href], button, input, select, [tabindex="0"]';
    const out = [];
    const els = [...document.querySelectorAll(sel)].slice(0, 120);
    for (const el of els) {
      const r0 = el.getBoundingClientRect();
      if (r0.width === 0 || r0.height === 0) continue;
      el.scrollIntoView({ block: 'start' });
      const r = el.getBoundingClientRect();
      const x = r.left + Math.min(r.width / 2, 20);
      const y = r.top + Math.min(r.height / 2, 10);
      if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) continue;
      const hit = document.elementFromPoint(x, y);
      if (hit && !el.contains(hit) && !hit.contains(el)) {
        out.push(
          `${el.tagName.toLowerCase()}${el.className ? '.' + String(el.className).split(' ')[0] : ''}` +
            ` covered by ${hit.tagName.toLowerCase()}${hit.className ? '.' + String(hit.className).split(' ')[0] : ''}`
        );
      }
    }
    return [...new Set(out)].slice(0, 5);
  });
  for (const c of covered) fail(where, `covered control — ${c}`);

  for (const p of [...new Set(problems)]) fail(where, p);

  await ctx.close();
}

/** The slider must actually move the marks, not just the label. */
async function checkSlider(browser) {
  const where = 'growth slider [wide]';
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`http://127.0.0.1:${PORT}${BASE}/areas/faro`, {
    waitUntil: 'networkidle',
    timeout: 45000,
  });
  await scrollThrough(page);

  const slider = page.locator('.ge-slider');
  if ((await slider.count()) === 0) {
    fail(where, 'no slider found on a region page');
    await ctx.close();
    return;
  }
  await slider.scrollIntoViewIfNeeded();

  const pathBefore = await page.locator('.ge-line').first().getAttribute('d');
  const labelBefore = await page.locator('.ge-slider-label strong').first().innerText();

  // Drive it as a user would, by keyboard — which also proves keyboard works.
  await slider.focus();
  for (let i = 0; i < 12; i++) await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(250);

  const pathAfter = await page.locator('.ge-line').first().getAttribute('d');
  const labelAfter = await page.locator('.ge-slider-label strong').first().innerText();

  if (labelBefore === labelAfter) fail(where, `base month label did not change (${labelBefore})`);
  if (pathBefore === pathAfter) fail(where, 'the chart path did not change when the base month moved');

  // And the rebase identity: at the base month every series reads 100%.
  const hasBaseline = await page.locator('.ge-base').count();
  if (hasBaseline < 2) fail(where, 'missing the 100% baseline / base-month rule');

  await ctx.close();
}

const { srv, root } = serve();
await new Promise((r) => setTimeout(r, 1200));

let browser;
try {
  browser = await chromium.launch();
  for (const [route, label] of ROUTES) {
    for (const theme of THEMES) {
      for (const vp of VIEWPORTS) {
        await checkPage(browser, route, label, theme, vp);
      }
    }
  }
  await checkSlider(browser);
} catch (e) {
  fail('harness', String(e).slice(0, 300));
} finally {
  if (browser) await browser.close();
  srv.kill();
  try { rmSync(root, { recursive: true, force: true }); } catch {}
}

if (failures.length) {
  console.error(`\nverify FAILED — ${failures.length} problem(s):`);
  for (const f of failures) console.error('  ✗ ' + f);
  process.exit(1);
}
console.log(
  `verify ok — ${ROUTES.length} routes × ${THEMES.length} themes × ${VIEWPORTS.length} viewports, plus the slider`
);
