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

/** The same routes in Portuguese. Overflow, covered controls and console
 * errors are all language-dependent: Portuguese runs longer than English by a
 * fifth or so, which is exactly how a control that fitted at 360px stops
 * fitting. */
const PT_ROUTES = ROUTES.map(([r, label]) => [`/pt${r === '/' ? '' : r}`, `pt ${label}`]);
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

/** Policy marks: one per law, none on top of another, each explained.
 *
 * Overlap is width-dependent — at 1280px the six marks sit comfortably apart
 * and at 360px four of them land within 13 pixels of each other, so a check at
 * one width proves nothing about the other. This measures both.
 */
async function checkPolicyMarks(browser) {
  const where = 'policy marks';
  for (const vp of [
    { name: 'narrow', width: 360, height: 900 },
    { name: 'wide', width: 1280, height: 900 },
  ]) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await ctx.newPage();
    await page.goto(`http://127.0.0.1:${PORT}${BASE}/`, {
      waitUntil: 'networkidle',
      timeout: 45000,
    });
    await scrollThrough(page);

    const boxes = await page.locator('.ts-event-dot').evaluateAll((els) =>
      els.map((e) => {
        const r = e.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height };
      })
    );
    if (boxes.length < 4) {
      fail(`${where} [${vp.name}]`, `only ${boxes.length} marks drawn; expected the changes to the law`);
      await ctx.close();
      continue;
    }

    // Every pair must be separated on one axis or the other.
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        const overlaps =
          a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
        if (overlaps) {
          fail(
            `${where} [${vp.name}]`,
            `marks ${i + 1} and ${j + 1} overlap (${Math.round(a.x)},${Math.round(a.y)} vs ${Math.round(b.x)},${Math.round(b.y)})`
          );
        }
      }
    }

    // Every mark must have an entry in the key, or the number means nothing.
    const keyed = await page.locator('.evk-list li').count();
    if (keyed < boxes.length) {
      fail(`${where} [${vp.name}]`, `${boxes.length} marks drawn but only ${keyed} explained`);
    }

    // The key starts collapsed and must open. Collapsed is the point — six
    // paragraphs of legislative history between the chart and the next section
    // pushed the page below the fold — but a disclosure that will not disclose
    // is worse than no disclosure.
    const details = page.locator('details.evk').first();
    if (await details.evaluate((e) => e.open)) {
      fail(`${where} [${vp.name}]`, 'the key is open by default');
    }
    await details.locator('summary').click();
    await page.waitForTimeout(150);
    const text = await page.locator('.evk-list').first().innerText();
    if (!/Mais Habita/i.test(text) || text.length < 300) {
      fail(`${where} [${vp.name}]`, 'opening the key does not reveal the descriptions');
    }

    await ctx.close();
  }
}

/** The Portuguese site must be Portuguese all the way down.
 *
 * Two failures this catches, both of which look fine on a screenshot:
 * a string that was never put in the dictionary and renders in English on a
 * Portuguese page, and a link that drops the reader back into English
 * halfway through a session because an island was handed the unprefixed base.
 */
async function checkLanguages(browser) {
  const where = 'i18n';
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();

  // Strings that must never appear on a Portuguese page. Each is a label the
  // site renders itself, not a proper noun — "Alojamento Local" and area names
  // are Portuguese in both languages and are deliberately absent from this list.
  const ENGLISH_LEAKS = [
    'Registered short-lets',
    'Inhabitants per AL',
    'Rank change',
    'no change',
    'Show all',
    'Where it ranks',
    'How concentrated',
    'Licences leaving',
    'The dashed marks',
    'Skip to content',
  ];

  for (const route of ['/pt', '/pt/areas', '/pt/areas/lisboa', '/pt/method', '/pt/map']) {
    await page.goto(`http://127.0.0.1:${PORT}${BASE}${route}`, {
      waitUntil: 'networkidle',
      timeout: 45000,
    });
    await scrollThrough(page);

    const lang = await page.evaluate(() => document.documentElement.lang);
    if (lang !== 'pt-PT') fail(`${where} ${route}`, `<html lang> is "${lang}", not pt-PT`);

    const body = await page.evaluate(() => document.body.innerText);
    for (const leak of ENGLISH_LEAKS) {
      if (body.includes(leak)) fail(`${where} ${route}`, `untranslated string "${leak}"`);
    }

    // Every internal link must stay inside /pt.
    const strays = await page.evaluate((base) => {
      const out = [];
      for (const a of document.querySelectorAll('a[href]')) {
        const href = a.getAttribute('href') ?? '';
        if (!href.startsWith(base)) continue;
        const rest = href.slice(base.length);
        // Assets and the language switcher's English link are allowed out.
        if (rest.startsWith('/geo/') || rest.startsWith('/favicon')) continue;
        if (a.closest('.lang-toggle')) continue;
        if (!rest.startsWith('/pt')) out.push(href);
      }
      return out.slice(0, 5);
    }, BASE);
    if (strays.length) {
      fail(`${where} ${route}`, `links leave Portuguese: ${strays.join(', ')}`);
    }

    // hreflang must name both languages and point somewhere real.
    const alts = await page.evaluate(() =>
      [...document.querySelectorAll('link[rel="alternate"]')].map((l) => [
        l.getAttribute('hreflang'),
        l.getAttribute('href'),
      ])
    );
    const tags = alts.map((a) => a[0]);
    for (const want of ['en-GB', 'pt-PT', 'x-default']) {
      if (!tags.includes(want)) fail(`${where} ${route}`, `no hreflang="${want}"`);
    }
  }

  // The switcher must land on the *same* page, not the front page.
  await page.goto(`http://127.0.0.1:${PORT}${BASE}/areas/lisboa`, {
    waitUntil: 'networkidle',
    timeout: 45000,
  });
  await page.locator('.lang-toggle a').nth(1).click();
  await page.waitForLoadState('networkidle');
  const url = page.url();
  if (!url.endsWith('/pt/areas/lisboa') && !url.endsWith('/pt/areas/lisboa/')) {
    fail(where, `the switcher went to ${url}, not the same area in Portuguese`);
  }
  const h1 = await page.locator('h1').first().innerText();
  if (!/Lisboa/.test(h1)) fail(where, `after switching, the page is "${h1}"`);

  // And Portuguese numbers must be Portuguese: comma decimal, and the group
  // separator is a non-breaking space rather than a comma.
  const nums = await page.evaluate(() =>
    [...document.querySelectorAll('.metric-value')].map((e) => e.textContent?.trim() ?? '')
  );
  if (nums.some((n) => /\d,\d{3}\b/.test(n))) {
    fail(where, `English thousands separator on a Portuguese page: ${nums.join(' | ')}`);
  }

  await ctx.close();
}

/** The combined timeline: one figure carrying both directions of the flow.
 *
 * Three things to hold, each of which has been wrong at some point in this
 * chart's life: the downward bars must exist and must stay inside the drawing;
 * the two directions must share a scale, since separate scales would make a
 * small outflow look like a large one; and hovering a policy mark must give
 * its description without the month readout fighting it for the same corner.
 */
async function checkCombinedTimeline(browser) {
  const where = 'combined timeline';
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`http://127.0.0.1:${PORT}${BASE}/`, {
    waitUntil: 'networkidle',
    timeout: 45000,
  });
  // The drawn map above the chart arrives late and is 560px tall, so anything
  // measured before it lands is measured against a page that is about to move.
  // Wait for it where there is one, then scroll.
  await page
    .waitForSelector('.aart-canvas.is-drawn', { timeout: 20000 })
    .catch(() => {});
  await page.locator('svg.ts-svg').first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);

  // There should now be exactly one timeline on the overview, not two.
  const charts = await page.locator('svg.ts-svg').count();
  if (charts !== 1) fail(where, `${charts} timelines on the overview; expected 1`);

  const geom = await page.evaluate(() => {
    const svg = document.querySelector('svg.ts-svg');
    if (!svg) return null;
    const h = Number(svg.getAttribute('viewBox').split(' ')[3]);
    const rects = (sel) =>
      [...svg.querySelectorAll(sel)].map((r) => ({
        y: Number(r.getAttribute('y')),
        h: Number(r.getAttribute('height')),
      }));
    return { h, pos: rects('.ts-bar'), neg: rects('.ts-bar-neg') };
  });
  if (!geom) {
    fail(where, 'no timeline found');
    await ctx.close();
    return;
  }
  if (geom.neg.length === 0) fail(where, 'no downward bars drawn');

  // Nothing may leave the drawing. The inner group is translated down by the
  // top padding, so compare against the viewBox height with that added.
  const PAD_TOP = 14;
  const worst = Math.max(...[...geom.pos, ...geom.neg].map((r) => r.y + r.h)) + PAD_TOP;
  if (worst > geom.h + 0.5) {
    fail(where, `bars overflow the chart: reach ${worst.toFixed(1)} of ${geom.h}`);
  }

  // Hovering a mark must produce its description, and must not leave two
  // readouts on screen at once.
  //
  // Any mark, not a particular one: four of the six fall within fourteen
  // months of each other and their targets overlap, so which of them a given
  // coordinate belongs to is a property of the stacking, not of the feature
  // being tested. The pointer also approaches from elsewhere on the chart in
  // steps — jumping it straight onto a target from its initial (0,0) does not
  // reliably produce the pointerover transition that `enter` is built from.
  // Re-scroll and re-measure here: everything above ran evaluates and waits,
  // and a coordinate measured before them is a coordinate against a page that
  // may have moved since.
  //
  // Wait for the drawing above the chart first. It is a canvas sized in an
  // effect after mount, and the place names on it fade in after that; until
  // both have happened the chart is still moving down the page, and a target
  // measured in the middle of it is a target the pointer misses. This is the
  // second time this check has been fixed for taking a coordinate too early.
  await page.waitForSelector('.aart-canvas.is-drawn', { timeout: 25000 }).catch(() => {});
  await page.waitForTimeout(700);
  await page.locator('svg.ts-svg').first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(250);
  const svg = await page.locator('svg.ts-svg').first().boundingBox();
  const park = async () => {
    if (!svg) return;
    await page.mouse.move(svg.x + 40, svg.y + svg.height - 30);
    await page.waitForTimeout(120);
  };

  const marks = await page.locator('.ts-event-hit').count();
  if (marks === 0) {
    fail(where, 'no policy marks to hover');
  } else {
    let answered = false;
    for (let i = 0; i < marks && !answered; i++) {
      const bb = await page.locator('.ts-event-hit').nth(i).boundingBox();
      if (!bb) continue;
      await park();
      await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2, { steps: 6 });
      await page.waitForTimeout(250);
      if ((await page.locator('.ts-readout.is-event').count()) !== 1) continue;

      answered = true;
      const txt = await page.locator('.ts-readout.is-event').innerText();
      if (txt.length < 60) fail(where, `the mark readout is only "${txt}"`);
      if ((await page.locator('.ts-readout:not(.is-event)').count()) !== 0) {
        fail(where, 'the month readout is still up while a mark is hovered');
      }

      // And moving off must hand back to the month readout.
      await park();
      if ((await page.locator('.ts-readout.is-event').count()) !== 0) {
        fail(where, 'the mark description is stuck after moving away');
      }
    }
    if (!answered) {
      // Say what was actually under the pointer. A bare "it did not respond"
      // sent me hunting through the component twice for a fault that was in
      // the approach the test made.
      const bb = await page.locator('.ts-event-hit').first().boundingBox();
      const under = bb
        ? await page.evaluate(
            ([x, y]) => {
              const el = document.elementFromPoint(x, y);
              return el ? `${el.tagName}.${el.getAttribute('class') ?? ''}` : 'nothing';
            },
            [bb.x + bb.width / 2, bb.y + bb.height / 2]
          )
        : 'no target';
      fail(
        where,
        `none of the ${marks} policy marks showed a description; at the first one the page has ${under}`
      );
    }
  }

  await ctx.close();
}

/** The drawn area maps.
 *
 * They are decorative *and* navigational now, which is exactly why they need
 * checking: nothing else on the page fails if they stop drawing. Past failures
 * were a brush name that does not exist in the shipped build, a canvas cleared
 * to opaque white (invisible on a light page, a white slab on a dark one), a
 * square viewport that rendered a wide district at a quarter size, and overlays
 * positioned against the wrong box so every place name sat outside the map.
 */
async function checkAreaArt(browser) {
  const where = 'area art';

  /** Fraction of the canvas that is not its background colour. */
  const inkShare = (page) =>
    page.evaluate(() => {
      const c = document.querySelector('.aart-canvas');
      if (!c) return null;
      const tmp = document.createElement('canvas');
      tmp.width = c.width;
      tmp.height = c.height;
      const ctx = tmp.getContext('2d');
      ctx.drawImage(c, 0, 0);
      const d = ctx.getImageData(0, 0, tmp.width, tmp.height).data;
      const bg = [d[0], d[1], d[2]];
      let drawn = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (
          Math.abs(d[i] - bg[0]) > 10 ||
          Math.abs(d[i + 1] - bg[1]) > 10 ||
          Math.abs(d[i + 2] - bg[2]) > 10
        ) {
          drawn++;
        }
      }
      return { bg, share: drawn / (d.length / 4) };
    });

  // One of every level, because each takes a different path through the
  // component: the country has insets, a locality shares its municipality's
  // file and has no children to colour.
  const ROUTES = [
    ['/', 'country'],
    ['/areas/faro', 'region'],
    ['/areas/albufeira_faro', 'municipality'],
    ['/areas/carregueira_chamusca_santarem', 'locality'],
  ];

  for (const [route, level] of ROUTES) {
    for (const theme of level === 'region' ? ['light', 'dark'] : ['light']) {
      const ctx = await browser.newContext({ viewport: { width: 1180, height: 1000 } });
      const page = await ctx.newPage();
      const errors = [];
      page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 180)));

      await page.goto(`http://127.0.0.1:${PORT}${BASE}${route}`, {
        waitUntil: 'networkidle',
        timeout: 45000,
      });
      await page.evaluate((t) => {
        localStorage.setItem('al-theme', t);
        document.documentElement.setAttribute('data-theme', t);
      }, theme);
      await page.reload({ waitUntil: 'networkidle', timeout: 45000 });

      const label = `${where} ${level}/${theme}`;
      try {
        await page.waitForSelector('.aart-canvas.is-drawn', { timeout: 25000 });
      } catch {
        fail(label, `never drew${errors.length ? ': ' + errors[0] : ''}`);
        await ctx.close();
        continue;
      }

      const ink = await inkShare(page);
      if (!ink || ink.share < 0.05) {
        fail(label, `only ${((ink?.share ?? 0) * 100).toFixed(1)}% of the canvas is drawn on`);
      } else {
        const pageBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
        const want = (pageBg.match(/\d+/g) ?? []).slice(0, 3).map(Number);
        if (Math.max(...want.map((v, i) => Math.abs(v - ink.bg[i]))) > 12) {
          fail(label, `canvas background rgb(${ink.bg}) but the page is ${pageBg}`);
        }
      }

      // The subject must fill a decent share of the frame. A square viewport
      // put a wide district at a quarter of the width, which no other
      // assertion here would have noticed.
      const box = await page.locator('.aart-canvas').boundingBox();
      if (box && box.width < 180) fail(label, `canvas is only ${Math.round(box.width)}px wide`);

      // Place names must land on the map, not beside it.
      const stray = await page.evaluate(() => {
        const stage = document.querySelector('.aart-stage');
        if (!stage) return 'no stage';
        const s = stage.getBoundingClientRect();
        for (const el of document.querySelectorAll('.aart-place')) {
          const r = el.getBoundingClientRect();
          const mx = r.left + r.width / 2;
          const my = r.top + r.height / 2;
          if (mx < s.left - 4 || mx > s.right + 4 || my < s.top - 4 || my > s.bottom + 4) {
            return el.textContent;
          }
        }
        return null;
      });
      if (stray) fail(label, `place name "${stray}" is outside the drawing`);

      if (errors.length) fail(label, `console error: ${errors[0]}`);
      await ctx.close();
    }
  }

  // Hovering an area must name it, and clicking must open it.
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 1000 } });
  const page = await ctx.newPage();
  await page.goto(`http://127.0.0.1:${PORT}${BASE}/areas/faro`, {
    waitUntil: 'networkidle',
    timeout: 45000,
  });
  await page.waitForSelector('.aart-canvas.is-drawn', { timeout: 25000 });
  const c = await page.locator('.aart-canvas').boundingBox();

  let found = false;
  for (const [fx, fy] of [[0.5, 0.5], [0.45, 0.55], [0.6, 0.45], [0.55, 0.6]]) {
    await page.mouse.move(c.x + c.width * fx, c.y + c.height * fy);
    await page.waitForTimeout(160);
    if (await page.locator('.aart-readout').count()) {
      found = true;
      const txt = await page.locator('.aart-readout').innerText();
      if (!/\d/.test(txt)) fail(where, `the readout "${txt}" carries no count`);
      await page.mouse.click(c.x + c.width * fx, c.y + c.height * fy);
      await page.waitForLoadState('networkidle');
      if (!/\/areas\//.test(page.url())) {
        fail(where, `clicking an area went to ${page.url()}`);
      }
      break;
    }
  }
  if (!found) fail(where, 'hovering the drawing named nothing');
  await ctx.close();
}

const { srv, root } = serve();
await new Promise((r) => setTimeout(r, 1200));

let browser;
try {
  browser = await chromium.launch();
  for (const [route, label] of [...ROUTES, ...PT_ROUTES]) {
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
  await checkPolicyMarks(browser);
  await checkLanguages(browser);
  await checkCombinedTimeline(browser);
  await checkAreaArt(browser);
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
  `verify ok — ${ROUTES.length + PT_ROUTES.length} routes × ${THEMES.length} themes × ${VIEWPORTS.length} viewports, plus the slider, the tabs, the room mix, the untimed areas, the policy marks, both languages, the combined timeline and the area maps`
);
