/** A drawn portrait of a district.
 *
 * Not a map. There is nothing to click, nothing to zoom and no data encoded in
 * it — the district's shape, its municipalities' borders, and nothing else. It
 * is there because a page about Faro should show you Faro, and because a
 * silhouette is recognised faster than a name is read.
 *
 * Drawn with p5.brush's standalone build, which is the whole library without
 * p5 itself: 29 kB gzipped against p5's ~350 kB. It still costs a WebGL2
 * context and a second or so of drawing, which is why it is `client:only` and
 * only ever appears on the twenty district pages.
 *
 * Three rules it follows:
 *
 * - **It is decorative, so it is invisible to assistive technology.** The
 *   shape carries no information the page does not already state in words.
 *   Marking it up as an image with a description would make a screen reader
 *   announce a picture of something it has already said.
 * - **It is deterministic.** The brushes are stochastic by design; seeded from
 *   the district's own slug, so Faro looks like Faro on every visit. A data
 *   site whose illustrations reshuffle on reload feels unreliable even when
 *   the numbers are right.
 * - **It follows the theme**, by reading the same custom properties everything
 *   else on the page is painted with, and redrawing when they change.
 */
import { useEffect, useRef, useState } from 'react';
import './DistrictArt.css';

export interface Props {
  /** Where to fetch this district's geometry from. */
  url: string;
  /** Only used to seed the brushes, so the drawing is stable per district. */
  slug: string;
}

interface Art {
  name: string;
  w: number;
  h: number;
  outline: number[][];
  parts: { rings: number[][] }[];
}

/** Small seeded PRNG. The drawing needs its own randomness — separate from
 * the brushes' — to wobble the outline, and it has to be reproducible or the
 * district reshapes itself on every visit. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable 32-bit hash, so the same district always seeds the same drawing. */
function seedOf(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) % 100000;
}

/** Resolve a CSS custom property to a plain `rgb()` string.
 *
 * Read directly, a token can come back as anything the stylesheet wrote —
 * `color-mix(...)`, a bare hex, a name. Letting the browser compute `color`
 * for a throwaway element normalises all of it to something p5.brush accepts.
 */
function readColour(token: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const probe = document.createElement('span');
  probe.style.cssText = `color: var(${token}); position:absolute; visibility:hidden`;
  document.body.appendChild(probe);
  const value = getComputedStyle(probe).color;
  probe.remove();
  return value || fallback;
}

/** Flat `[x0,y0,x1,y1,…]` to the pairs p5.brush wants, scaled and centred.
 *
 * The standalone build puts the origin at the canvas centre, so everything is
 * drawn through one offset rather than each call remembering to.
 */
function toPoints(
  flat: number[],
  scale: number,
  offX: number,
  offY: number,
  wobble = 0,
  rnd?: () => number
): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i < flat.length; i += 2) {
    let x = flat[i]! * scale + offX;
    let y = flat[i + 1]! * scale + offY;
    if (wobble && rnd) {
      // A fraction of a millimetre at print size — enough that no two borders
      // meeting at a point meet exactly, which is what a drawn line does and
      // a traced one never does.
      x += (rnd() - 0.5) * wobble;
      y += (rnd() - 0.5) * wobble;
    }
    pts.push([x, y]);
  }
  return pts;
}

export default function DistrictArt({ url, slug }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  /** p5.brush creates and appends its own canvas, so React does not own this
   * node — it is removed by hand before each redraw. */
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [art, setArt] = useState<Art | null>(null);
  const [failed, setFailed] = useState(false);
  const [drawn, setDrawn] = useState(false);
  /** Bumped to force a redraw; the theme and the width both do it. */
  const [epoch, setEpoch] = useState(0);

  useEffect(() => {
    let live = true;
    fetch(url)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: Art) => live && setArt(d))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [url]);

  /* Redraw when the palette changes. Both paths matter: the toggle sets an
   * attribute, and "Auto" follows the system, which can change underneath a
   * page that is already open. */
  useEffect(() => {
    const bump = () => setEpoch((e) => e + 1);
    const mo = new MutationObserver(bump);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', bump);
    return () => {
      mo.disconnect();
      mq.removeEventListener('change', bump);
    };
  }, []);

  /* And when the column width changes enough to matter. Redrawing on every
   * pixel of a window drag would be a second of work per frame, so this only
   * fires when the canvas would actually be a different size. */
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let last = host.clientWidth;
    let timer: number | undefined;
    const ro = new ResizeObserver(() => {
      const now = host.clientWidth;
      if (Math.abs(now - last) < 24) return;
      last = now;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setEpoch((e) => e + 1), 220);
    });
    ro.observe(host);
    return () => {
      ro.disconnect();
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !art) return;

    let cancelled = false;
    (async () => {
      const brush = await import('p5.brush/standalone');
      if (cancelled) return;

      // Fit to the column, but never taller than this. Districts are all
      // sorts of shapes — Faro is three times as wide as it is tall, Lisboa is
      // square — and without a cap the square ones fill the whole viewport and
      // push the numbers the page is actually about below the fold.
      const MAX_H = 400;
      let cssW = Math.max(240, Math.min(host.clientWidth, 820));
      let cssH = Math.round((cssW * art.h) / art.w);
      if (cssH > MAX_H) {
        cssH = MAX_H;
        cssW = Math.round((MAX_H * art.w) / art.h);
      }

      canvasRef.current?.remove();
      const canvas = brush.createCanvas(cssW, cssH, {
        parent: host,
        // Two is enough for a brush texture and halves the fill cost against
        // a 3x screen; the grain hides the difference.
        pixelDensity: Math.min(window.devicePixelRatio || 1, 2),
      });
      canvasRef.current = canvas;
      canvas.className = 'dart-canvas';
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;

      brush.seed(seedOf(slug));
      brush.noiseSeed(seedOf(slug));
      brush.angleMode(brush.DEGREES);

      // Brush sizes are absolute, so they have to track the canvas or a small
      // drawing comes out as a thick scribble. p5.brush suggests 3 for a
      // 600px canvas; this is the same ratio.
      // p5.brush suggests 3 for a 600px canvas. Going higher does not make a
      // bolder line, it spreads the bristles until the stroke breaks into
      // speckle — which is what the first attempt at this looked like.
      brush.scaleBrushes(Math.max(1, cssW / 380));

      // The coastline is ink, not the accent colour: the washes carry the
      // hue, and a drawing where the line and the paint are the same colour
      // reads as a diagram. `--s-ink` also inverts with the theme for free.
      const ink = readColour('--s-ink', 'rgb(20,20,24)');
      const tint = readColour('--m-primary-soft', 'rgb(147,197,253)');
      const pencil = readColour('--s-ink-soft', 'rgb(110,110,120)');

      // A margin, so the shape sits on the page rather than against its edges.
      const pad = cssW * 0.07;
      const scale = (cssW - pad * 2) / art.w;
      const offX = -cssW / 2 + pad;
      const offY = -cssH / 2 + pad + (cssH - pad * 2 - art.h * scale) / 2;

      const rnd = mulberry32(seedOf(slug));
      const wob = Math.max(0.6, cssW / 700);
      const ring = (flat: number[], w = 0) => toPoints(flat, scale, offX, offY, w, rnd);

      // Cleared to the page's own background, not to nothing. `clear()` with
      // no argument leaves an opaque white buffer, which is invisible on a
      // light page and a white slab on a dark one — the drawing looked fine
      // until the theme was switched.
      brush.clear(readColour('--s-bg', 'rgb(250,250,250)'));
      brush.push();

      // 1. Every municipality gets its own watercolour wash. This is the thing
      //    p5.brush exists for, and the reason to accept a WebGL context on a
      //    page that otherwise needs none.
      //
      //    The washes vary in *opacity only*, never in hue. The map on this
      //    site uses a colour ramp to encode a number, so a district drawn in
      //    sixteen colours would read as sixteen values — a chart, made of
      //    nothing. Varying the strength alone gives the pooling and unevenness
      //    of paint without asserting anything.
      brush.noStroke();
      brush.fillTexture(0.6, 0.45);
      for (const part of art.parts) {
        brush.fillBleed(0.08 + rnd() * 0.1, 'out');
        brush.fill(tint, 92 + rnd() * 52);
        for (const r of part.rings) brush.polygon(ring(r, wob));
      }
      brush.noFill();

      // 2. The borders between them, in pencil, over the wet edges.
      brush.set('cpencil', pencil, 0.75);
      for (const part of art.parts) {
        for (const r of part.rings) brush.polygon(ring(r, wob));
      }

      // 3. The coastline last and heaviest — the one line meant to be read as
      //    a line. Drawn as a spline rather than a polygon: the geometry is
      //    simplified hard on purpose, and a curve through those points is
      //    what turns a 231-sided polygon back into a coast.
      // `rotring` rather than a pencil: this is the one deliberate, confident
      // line in the drawing, and a soft graphite brush renders it as grain.
      brush.set('rotring', ink, 1.5);
      for (const r of art.outline) {
        const pts = ring(r, wob * 0.6);
        brush.beginShape(0.22);
        for (const [x, y] of pts) brush.vertex(x, y);
        brush.endShape(true);
      }

      brush.pop();
      brush.render();
      if (cancelled) {
        canvas.remove();
        return;
      }
      canvas.classList.add('is-drawn');
      setDrawn(true);
    })().catch((err) => {
      // Loud in the console, silent on the page. A decorative drawing that
      // fails should cost the reader nothing, but swallowing the reason
      // entirely turned a one-line API mistake into a long hunt.
      console.error('[district art] could not draw', err);
      if (!cancelled) setFailed(true);
    });

    return () => {
      cancelled = true;
    };
  }, [art, slug, epoch]);

  // Nothing is worth saying to a reader whose browser could not draw it: the
  // page has already told them everything the picture would have.
  if (failed) return null;

  return <div className={`dart${drawn ? ' is-drawn' : ''}`} ref={hostRef} aria-hidden="true" />;
}
