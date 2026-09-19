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
  ['/areas/ponta_delgada_acores', 'azores municipality'],
  ['/areas/achada_nordeste_acores', 'azores locality'],
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
  page.on('requestfailed', (r) => {
    // The basemap is a third-party tile service. A tile that does not exist at
    // a given zoom is normal tile-server behaviour, and whether openfreemap.org
    // is reachable is not a property of this build — failing the site's own
    // verification on it would make the gate flaky for reasons outside the
    // repo. Everything served from this origin is still fatal.
    if (/openfreemap\.org|openstreetmap\.org/.test(r.url())) return;
    problems.push(`request failed: ${r.url().slice(0, 160)}`);
  });

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

  // Moving the base must rescale the lines, not crop the window to it. An
  // earlier version drew only from the base month onward, which is the thing
  // dimi reported. Every line still has to start at the left edge.
  const starts = await page.locator('.ge-line').evaluateAll((els) =>
    els.map((e) => Number((e.getAttribute('d') ?? 'M999').slice(1).split(',')[0]))
  );
  if (!starts.length || starts.some((v) => !Number.isFinite(v) || v > 1)) {
    fail(
      where,
      `lines do not start at the axis origin (x = ${starts.join(', ')}) - the window was cropped instead of rebased`
    );
  }

  await ctx.close();
}

/** Tabs must switch panels, and an island inside a tab must still hydrate -
 * a `client:visible` island in a hidden panel never intersects the viewport,
 * so the risk is a table that renders but never becomes interactive. */
async function checkTabs(browser) {
  const where = 'areas tabs [wide]';
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`http://127.0.0.1:${PORT}${BASE}/areas`, {
    waitUntil: 'networkidle',
    timeout: 45000,
  });

  const ids = ['regions', 'municipalities', 'localities'];
  const tabCount = await page.locator('[role="tab"]').count();
  if (tabCount !== ids.length) {
    fail(where, `expected ${ids.length} tabs, found ${tabCount}`);
    await ctx.close();
    return;
  }
  if (!(await page.locator('.tabs.is-enhanced').count())) {
    fail(where, 'the tab strip never enhanced - panels are still stacked');
  }

  for (const id of ids) {
    await page.locator(`#areas-tab-${id}`).click();
    await page.waitForTimeout(400);

    const panel = page.locator(`#areas-panel-${id}`);
    if (!(await panel.isVisible())) fail(where, `panel ${id} did not open`);

    for (const o of ids.filter((x) => x !== id)) {
      if (await page.locator(`#areas-panel-${o}`).isVisible()) {
        fail(where, `panel ${o} stayed open while ${id} was selected`);
      }
    }

    // Hydration: type in the search box and watch the row count fall.
    const search = panel.locator('.at-search input');
    await search.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
    const before = await panel.locator('.at-table tbody tr').count();
    await search.fill('zzzznotanarea');
    await page.waitForTimeout(300);
    const after = await panel.locator('.at-table tbody tr').count();
    if (!(before > 0 && after < before)) {
      fail(
        where,
        `table in ${id} did not hydrate (rows ${before} -> ${after} on a search matching nothing)`
      );
    }
    await search.fill('');
  }

  // Keyboard, per the ARIA tab pattern.
  await page.locator('#areas-tab-regions').focus();
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(200);
  const focused = await page.evaluate(() => document.activeElement?.id ?? '');
  if (focused !== 'areas-tab-municipalities') {
    fail(where, `ArrowRight did not move to the next tab (focus is "${focused}")`);
  }

  await ctx.close();
}

/** The room-size bars, and the readout on each segment.
 *
 * Two things have gone wrong here before and neither shows up in a build: the
 * national distribution exported empty, leaving a heading with nothing under
 * it, and the bar clipped its own tooltips so no segment label ever appeared.
 */
async function checkRoomMix(browser) {
  const where = 'room mix [wide]';
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();

  for (const route of ['/', '/areas/faro']) {
    await page.goto(`http://127.0.0.1:${PORT}${BASE}${route}`, {
      waitUntil: 'networkidle',
      timeout: 45000,
    });
    const segs = page.locator('.rm-seg');
    const count = await segs.count();
    if (count === 0) {
      fail(where, `${route} has no room-size bars — the payload is empty`);
      continue;
    }
    const seg = segs.nth(Math.min(2, count - 1));
    await seg.scrollIntoViewIfNeeded();
    await seg.hover();
    await page.waitForTimeout(250);

    const tip = await seg.evaluate((el) => {
      const cs = getComputedStyle(el, '::after');
      const bar = el.closest('.rm-bar');
      return {
        display: cs.display,
        clipped: bar ? getComputedStyle(bar).overflow : 'none',
      };
    });
    if (tip.display === 'none') fail(where, `${route}: the segment readout never appears on hover`);
    if (tip.clipped.includes('hidden')) {
      fail(where, `${route}: .rm-bar has overflow:${tip.clipped}, which clips the readout away`);
    }
  }

  await ctx.close();
}

/** An area with no time series must show no chart at all, and must say why.
 *
 * The failure this guards against is silent and plausible-looking: an empty
 * series rendered as a flat line at zero, which claims the register has been
 * empty there since 2012. A blank chart and a missing chart are impossible to
 * tell apart in a screenshot, so this asserts on the DOM.
 */
async function checkUntimedArea(browser) {
  const where = 'azores area page [wide]';
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`http://127.0.0.1:${PORT}${BASE}/areas/ponta_delgada_acores`, {
    waitUntil: 'networkidle',
    timeout: 45000,
  });
  await scrollThrough(page);

  for (const sel of ['.ts-svg', '.ge-svg', '.sm-svg']) {
    const n = await page.locator(sel).count();
    if (n > 0) fail(where, `${n} ${sel} chart(s) drawn for an area with no time series`);
  }
  if (!(await page.locator('.fn-note').count())) {
    fail(where, 'no explanation of why there is no chart');
  }
  const body = await page.evaluate(() => document.body.innerText);
  if (!/separate register/i.test(body)) {
    fail(where, 'the page never says the Azores keep a separate register');
  }
  // The count itself must still be there and must be a real number.
  const headline = await page.locator('.metric-value').first().innerText();
  if (!/^[0-9][0-9,]*$/.test(headline.trim())) {
    fail(where, `headline count is "${headline.trim()}", not a number`);
  }

  // And the national pages must still draw their charts — a guard against
  // "fixing" this by turning the charts off everywhere.
  await page.goto(`http://127.0.0.1:${PORT}${BASE}/areas/faro`, {
    waitUntil: 'networkidle',
    timeout: 45000,
  });
  await scrollThrough(page);
  if ((await page.locator('.ts-svg').count()) === 0) {
    fail(where, 'a national area page lost its time-series chart');
  }

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
  await checkTabs(browser);
  await checkRoomMix(browser);
  await checkUntimedArea(browser);
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
  `verify ok — ${ROUTES.length} routes × ${THEMES.length} themes × ${VIEWPORTS.length} viewports, plus the slider, the tabs, the room mix and the untimed areas`
);
