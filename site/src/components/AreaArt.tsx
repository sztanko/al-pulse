/** A drawn portrait of an area, at any level.
 *
 * The area itself in ink; the areas inside it washed in watercolour and
 * coloured by how many registrations they hold; the neighbours of the same
 * level fading away toward the edges; the three most populous places named.
 * On the country page the mainland is drawn large with Madeira and the Azores
 * as insets — a bounding box containing both Portugal and the Azores is
 * 2,000 km wide and puts the subject in a corner of it.
 *
 * Drawn with p5.brush's standalone build: the library without p5 itself,
 * 29 kB gzipped against ~350 kB. It needs a WebGL2 context and a few hundred
 * milliseconds, so it is `client:only` and the page is complete without it.
 *
 * **On colour.** An earlier version of this deliberately varied the washes by
 * opacity alone, on the grounds that a shape drawn in many colours reads as
 * encoding something. It now does encode something, so the rule flips: the
 * scale is diverging about the median of the siblings, it is the same in every
 * picture, and there is a key under the drawing. An encoding without a key is
 * worse than no encoding.
 *
 * **On access.** The canvas is hoverable and clickable, and it is still
 * `aria-hidden`. That is deliberate rather than an oversight: every area it
 * can navigate to is already a link in the table further down the same page,
 * with the same count beside it. The drawing is a faster route to what the
 * page already offers, not the only route — so it does not need to be a second
 * accessible copy of the table.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fmt } from '../lib/format';
import { type Lang } from '../lib/i18n';
import './AreaArt.css';

export interface Props {
  lang: Lang;
  /** The file to fetch. Shared between every focus it contains. */
  url: string;
  /** Which shape in that file is the subject. */
  focus: string;
  /** Language-rooted base for the links the drawing opens. */
  base: string;
}

interface Shape {
  slug?: string;
  name?: string;
  count?: number | null;
  pop?: number;
  r: number[][];
  lp?: number[];
}

interface ArtFile {
  o: [number, number];
  s: number;
  name?: string;
  focus?: number[][];
  subs?: Shape[];
  ctx?: { r: number[][] }[];
  insets?: ArtFile[];
  /** Locality pools: many possible foci, each also the others' context. */
  areas?: Shape[];
}

/** Must match ZOOM in scripts/export_area_art.py — that decides which
 * neighbours are in the file, this decides how much of them is shown. */
const ZOOM = 1.5;
/** Used instead where there are no neighbours to leave room for. The margin
 * ZOOM opens up is there so the ring of context shapes has somewhere to sit;
 * on the country page and on the two archipelagos nothing is drawn in it, and
 * for Madeira and the Azores in particular it is 50% more Atlantic around an
 * outline that is already mostly Atlantic.
 *
 * "No neighbours" has to mean no `ctx` *and* no pool. A locality file carries
 * neither a focus outline nor a ctx list — its neighbours are the pool it
 * shares with the rest of its municipality — so testing `ctx` alone framed
 * every locality tight to its own edge and left the canvas 4.9% drawn on. */
const ZOOM_ALONE = 1.06;

/** A name drawn over the canvas: a town on the map, or an inset's caption
 * sitting in the top-left of its frame (`box`). */
type PlaceLabel = { name: string; x: number; y: number; box?: boolean };
/** Only tall subjects ever reach this — a wide district's height is set by
 * its own proportions long before the cap. Portugal is twice as tall as it is
 * wide, so a low cap made the country map a postage stamp. */
const MAX_H = 560;
/* Portugal is twice as tall as it is wide, so the height cap -- not the page
 * width -- is what decides the size of the country drawing, and at 560 it left
 * the landing page's own picture occupying under half the column it sits in.
 * The country page gets a taller cap, and is the only page that needs one:
 * every area wide enough to be capped by width instead is already unaffected. */
const MAX_H_INSETS = 680;

type Pt = [number, number];

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedOf(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) % 100000;
}

function readColour(token: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const probe = document.createElement('span');
  probe.style.cssText = `color: var(${token}); position:absolute; visibility:hidden`;
  document.body.appendChild(probe);
  const value = getComputedStyle(probe).color;
  probe.remove();
  return value || fallback;
}

/** `rgb(r, g, b)` plus an alpha, for p5.brush's colour argument. */
function withAlpha(rgb: string, alpha: number): string {
  const n = (rgb.match(/[\d.]+/g) ?? ['0', '0', '0']).slice(0, 3);
  return `rgba(${n[0]}, ${n[1]}, ${n[2]}, ${alpha})`;
}

/** Ray casting. Rings are closed, so the wrap is implicit in the data. */
function inside(pt: Pt, rings: Pt[][]): boolean {
  let within = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i]!;
      const [xj, yj] = ring[j]!;
      if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) {
        within = !within;
      }
    }
  }
  return within;
}

interface Hit {
  slug: string;
  name: string;
  count: number | null;
  rings: Pt[][];
}

export default function AreaArt({ lang, url, focus, base }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  /** Projected, in canvas pixels, for hit-testing. Rebuilt on every draw. */
  const hitsRef = useRef<Hit[]>([]);
  const [art, setArt] = useState<ArtFile | null>(null);
  const [failed, setFailed] = useState(false);
  const [drawn, setDrawn] = useState(false);
  const [epoch, setEpoch] = useState(0);
  const [hover, setHover] = useState<{ hit: Hit; x: number; y: number } | null>(null);
  const f = fmt(lang);

  useEffect(() => {
    let live = true;
    fetch(url)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: ArtFile) => live && setArt(d))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [url]);

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

  /* ------------------------------------------------------------- drawing */
  useEffect(() => {
    const host = hostRef.current;
    if (!host || !art) return;

    let cancelled = false;
    (async () => {
      const brush = await import('p5.brush/standalone');
      if (cancelled) return;

      // The file's integers are degrees against its own origin.
      const un = (v: number[], i: number): Pt => [
        art.o[0] + v[i]! / art.s,
        art.o[1] + v[i + 1]! / art.s,
      ];
      const unpackRings = (rr: number[][]): Pt[][] =>
        rr.map((flat) => {
          const pts: Pt[] = [];
          for (let i = 0; i < flat.length; i += 2) pts.push(un(flat, i));
          return pts;
        });

      // Which shape is the subject, and what else is in the picture.
      const pool: Shape[] = art.areas ?? [];
      const focusShape: Shape | undefined =
        art.areas?.find((a) => a.slug === focus) ??
        (art.focus ? { slug: focus, name: art.name, r: art.focus } : undefined);
      if (!focusShape) {
        setFailed(true);
        return;
      }
      const focusRings = unpackRings(focusShape.r);

      // Subjects to colour: children where there are any, otherwise the
      // neighbours, so a locality is still read against something.

      // The viewport: the focus grown about its centre. Recomputed here rather
      // than stored, because one file serves many foci.
      const all = focusRings.flat();
      const minx = Math.min(...all.map((p) => p[0]));
      const maxx = Math.max(...all.map((p) => p[0]));
      const miny = Math.min(...all.map((p) => p[1]));
      const maxy = Math.max(...all.map((p) => p[1]));
      const cx = (minx + maxx) / 2;
      const cy = (miny + maxy) / 2;
      const k = Math.cos((cy * Math.PI) / 180);

      /* The viewport takes the focus's own proportions, not a square around
       * it. A square was the first attempt and it is wrong for anything that
       * is not roughly square: Faro is two and a half times wider than it is
       * tall, so a square viewport fitted to the frame was driven by the
       * width, and the district ended up a quarter of the frame with empty sky
       * above and below it. */
      const alone = (art.ctx?.length ?? 0) === 0 && (art.areas?.length ?? 0) === 0;
      const zoom = alone ? ZOOM_ALONE : ZOOM;
      const vpW = (maxx - minx) * k * zoom;
      const vpH = (maxy - miny) * zoom;
      const aspect = vpW / Math.max(vpH, 1e-9);

      const insets = art.insets ?? [];
      const avail = Math.max(240, Math.min(host.clientWidth, 820));
      const maxH = insets.length ? MAX_H_INSETS : MAX_H;
      // The islands stack down a column beside the mainland, in the ocean its
      // own bounding box leaves empty. That column is part of the width the
      // drawing has to fit into: sizing the mainland to the full width and
      // then adding a column beside it makes a canvas 1.66x the room there is,
      // and at 360px the city labels -- positioned in canvas pixels -- hang
      // off the side of the page and it scrolls sideways.
      // As wide as the mainland gets. Portugal is a narrow country and the
      // archipelagos are wide, scattered ones drawn at their true spacing, so
      // the column beside it is where the islands have any chance of being
      // legible — and the page has the width to give it.
      const insetShare = insets.length ? 0.95 : 0;
      const budget = Math.round(avail / (1 + insetShare));
      let mainW = budget;
      let cssH = Math.round(mainW / aspect);
      if (cssH > maxH) {
        cssH = maxH;
        mainW = Math.min(Math.round(maxH * aspect), budget);
      }
      if (cssH < 200) cssH = 200;
      const mainLeft = Math.round(mainW * insetShare);
      const cssW = mainW + mainLeft;

      /* The locality pool is a municipality's worth of shapes plus a margin,
       * which is far more than one locality's frame. The other levels arrive
       * pre-cut by the exporter; this one is cut here, because the frame
       * depends on which locality is the subject and the file serves them all.
       *
       * Distance from the subject also sets how strongly each is painted, so
       * the eye goes to the subject rather than to whichever neighbour happens
       * to hold the most registrations. */
      // Half-extents of the frame, in the file's own degrees.
      const halfX = vpW / (2 * k);
      const halfY = vpH / 2;
      const inFrame = (sh: Shape): boolean => {
        for (const flat of sh.r) {
          for (let i = 0; i < flat.length; i += 2) {
            const [x, y] = un(flat, i);
            if (Math.abs(x - cx) <= halfX && Math.abs(y - cy) <= halfY) return true;
          }
        }
        return false;
      };
      const distanceOf = (sh: Shape): number => {
        let best = Infinity;
        for (const flat of sh.r) {
          for (let i = 0; i < flat.length; i += 2) {
            const [x, y] = un(flat, i);
            best = Math.min(best, Math.hypot((x - cx) * k, y - cy));
          }
        }
        return best / Math.max(vpH / 2, 1e-9);
      };

      const tinted: Shape[] = art.subs?.length ? art.subs : pool.filter(inFrame);
      const contextOnly: Pt[][][] = art.subs?.length
        ? (art.ctx ?? []).map((c) => unpackRings(c.r))
        : [];

      const scale = Math.min(mainW / vpW, cssH / vpH);
      const project = (p: Pt): Pt => [
        mainLeft + mainW / 2 + (p[0] - cx) * k * scale - cssW / 2,
        cssH / 2 - (p[1] - cy) * scale - cssH / 2,
      ];

      canvasRef.current?.remove();
      const canvas = brush.createCanvas(cssW, cssH, {
        parent: stageRef.current ?? host,
        pixelDensity: Math.min(window.devicePixelRatio || 1, 2),
      });
      canvasRef.current = canvas;
      canvas.className = 'aart-canvas';
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
      if (stageRef.current) {
        stageRef.current.style.width = `${cssW}px`;
        stageRef.current.style.height = `${cssH}px`;
      }

      const rnd = mulberry32(seedOf(focus));
      brush.seed(seedOf(focus));
      brush.noiseSeed(seedOf(focus));
      brush.angleMode(brush.DEGREES);
      brush.scaleBrushes(Math.max(1, cssW / 380));

      const ink = readColour('--s-ink', 'rgb(20,20,24)');
      const pencil = readColour('--s-ink-soft', 'rgb(110,110,120)');
      const faintInk = readColour('--s-ink-faint', 'rgb(150,150,160)');
      const div = Array.from({ length: 7 }, (_, i) =>
        readColour(`--m-div-${i + 1}`, 'rgb(180,180,180)')
      );

      /* The scale: diverging about the median of whatever is being coloured,
       * so "typical for its neighbours" sits in the pale middle and both ends
       * read. A mean would be dragged by one Lisbon and put almost everything
       * on the same side of the midpoint. */
      // The insets are part of the same set of districts, so they belong in
      // the distribution that sets the bands. Leaving them out would have
      // coloured Madeira and the Azores against a median of the 18 mainland
      // districts while the key said twenty.
      const values = [...tinted, ...insets.flatMap((i) => i.subs ?? [])]
        .map((t) => t.count)
        .filter((v): v is number => typeof v === 'number')
        .sort((a, b) => a - b);
      const median = values.length ? values[Math.floor(values.length / 2)]! : 0;
      const below = values.filter((v) => v < median);
      const above = values.filter((v) => v > median);

      /* Diverging about the median, but by *rank* within each side rather
       * than by distance from it. These distributions are extremely skewed —
       * Faro holds 43,764 registrations and the median district holds under
       * 2,000 — so a linear scale puts all but two or three areas in the band
       * either side of the middle, and the picture comes out one colour. Rank
       * spreads them across the ramp, which is what the ramp is for. */
      const rank = (v: number, pool: number[]) =>
        pool.length < 2 ? 0.5 : pool.filter((p) => p < v).length / (pool.length - 1);
      const band = (count: number | null | undefined): string => {
        if (typeof count !== 'number') return div[3]!;
        if (count === median) return div[3]!;
        if (count < median) {
          const t = rank(count, below);
          return div[t < 0.34 ? 0 : t < 0.67 ? 1 : 2]!;
        }
        const t = rank(count, above);
        return div[t < 0.34 ? 4 : t < 0.67 ? 5 : 6]!;
      };

      const wob = Math.max(0.5, cssW / 800);
      const jitter = (pts: Pt[]): Pt[] =>
        pts.map(([x, y]) => [x + (rnd() - 0.5) * wob, y + (rnd() - 0.5) * wob]);

      brush.clear(readColour('--s-bg', 'rgb(250,250,250)'));
      brush.push();

      const hits: Hit[] = [];
      const cityLabels: PlaceLabel[] = [];
      const toScreen = (rings: Pt[][], proj: (p: Pt) => Pt) =>
        rings.map((r) => jitter(r.map(proj)));

      /** One area: wash, border, and its hit region. */
      const drawArea = (shape: Shape, proj: (p: Pt) => Pt, interactive: boolean) => {
        const rings = toScreen(unpackRings(shape.r), proj);
        // Where there are no children, the neighbours are the coloured
        // shapes, and they recede with distance so the subject still reads as
        // the subject. Where there are children they are all equally the
        // point, and nothing is faded.
        const dim =
          art.subs?.length || shape.slug === focus
            ? 1
            : Math.max(0.22, 1 - distanceOf(shape) * 0.85);
        brush.noStroke();
        // A flat base coat under the textured one. The watercolour alone
        // leaves half of each shape near-white, which is lovely and unreadable
        // once the colour has to carry a value; the wash sets the value and the
        // fill over it keeps the unevenness of paint.
        brush.wash(band(shape.count), 30 * dim);
        for (const r of rings) brush.polygon(r);
        brush.noWash();
        // Inward, not outward. An outward bleed is prettier in isolation and
        // wrong here: it pushes one area's colour across the border into its
        // neighbour, and the colour now means something, so that is a wash
        // reading as the wrong value.
        brush.fillBleed(0.06 + rnd() * 0.06, 'in');
        brush.fillTexture(0.55, 0.5);
        brush.fill(band(shape.count), (96 + rnd() * 40) * dim);
        for (const r of rings) brush.polygon(r);
        brush.noFill();
        brush.set('cpencil', withAlpha(pencil, 0.9 * dim), 0.55);
        for (const r of rings) brush.polygon(r);
        if (interactive && shape.slug && shape.name) {
          hits.push({
            slug: shape.slug,
            name: shape.name,
            count: typeof shape.count === 'number' ? shape.count : null,
            // Hit-testing wants canvas coordinates; the drawing works from the
            // centre, so shift back.
            rings: rings.map((r) => r.map(([x, y]) => [x + cssW / 2, y + cssH / 2] as Pt)),
          });
        }
      };

      /** Everything for one frame: context, areas, outline, labels. */
      const drawGroup = (
        file: ArtFile,
        proj: (p: Pt) => Pt,
        focusR: Pt[][],
        tintedShapes: Shape[],
        ctxRings: Pt[][][],
        labels: boolean
      ) => {
        // Context first and faintest. The list arrives nearest-first, so the
        // fade follows position in it — the ones at the edge are the palest.
        brush.noFill();
        ctxRings.forEach((rings, i) => {
          const t = ctxRings.length > 1 ? i / (ctxRings.length - 1) : 0;
          brush.set('cpencil', withAlpha(faintInk, 0.42 - t * 0.32), 0.5);
          for (const r of toScreen(rings, proj)) brush.polygon(r);
        });

        for (const shape of tintedShapes) drawArea(shape, proj, true);

        // The focus outline last, over everything: the one line in the drawing
        // meant to be read as a line.
        brush.noFill();
        brush.set('rotring', ink, 1.4);
        for (const r of toScreen(focusR, proj)) {
          brush.beginShape(0.2);
          for (const [x, y] of r) brush.vertex(x, y);
          brush.endShape(true);
        }

        if (!labels) return;
        // The three most populous places in the picture.
        const top = tintedShapes
          .filter((s) => s.pop && s.lp)
          .filter((s) => {
            const [lx, ly] = un(s.lp!, 0);
            return Math.abs(lx - cx) <= halfX * 0.92 && Math.abs(ly - cy) <= halfY * 0.92;
          })
          .sort((a, b) => (b.pop ?? 0) - (a.pop ?? 0))
          .slice(0, 3);
        for (const place of top) {
          const [x, y] = proj(un(place.lp!, 0));
          // Two neighbouring places can sit a few pixels apart and their names
          // then overprint each other into an unreadable smear. The smaller
          // one gives way — `top` is sorted by population, so the one already
          // placed is the larger.
          if (
            cityLabels.some(
              (l) => Math.abs(l.x - (x + cssW / 2)) < 96 && Math.abs(l.y - (y + cssH / 2)) < 18
            )
          ) {
            continue;
          }
          brush.noStroke();
          brush.fill(ink, 200);
          brush.polygon([
            [x - 2.4, y - 2.4],
            [x + 2.4, y - 2.4],
            [x + 2.4, y + 2.4],
            [x - 2.4, y + 2.4],
          ]);
          brush.noFill();
          cityLabels.push({ name: place.name ?? '', x: x + cssW / 2, y: y + cssH / 2 });
        }
      };


      drawGroup(
        art,
        project,
        focusRings,
        tinted,
        contextOnly,
        true
      );

      // Insets, each fitted to its own box in the left column.
      insets.forEach((inset, i) => {
        const ih = cssH / insets.length;
        const iTop = i * ih;
        const iun = (v: number[], j: number): Pt => [
          inset.o[0] + v[j]! / inset.s,
          inset.o[1] + v[j + 1]! / inset.s,
        ];
        const iRings = (rr: number[][]): Pt[][] =>
          rr.map((flat) => {
            const pts: Pt[] = [];
            for (let j = 0; j < flat.length; j += 2) pts.push(iun(flat, j));
            return pts;
          });
        const ifocus = iRings(inset.focus ?? []);
        // The extent comes from whatever is actually drawn. On the country
        // page an archipelago is a single district and carries no separate
        // focus outline, so measuring `focus` alone found nothing and the
        // inset was skipped entirely.
        const pts = ifocus.length
          ? ifocus.flat()
          : (inset.subs ?? []).flatMap((sh) => iRings(sh.r ?? []).flat());
        if (!pts.length) return;
        const ix0 = Math.min(...pts.map((p) => p[0]));
        const ix1 = Math.max(...pts.map((p) => p[0]));
        const iy0 = Math.min(...pts.map((p) => p[1]));
        const iy1 = Math.max(...pts.map((p) => p[1]));
        const icx = (ix0 + ix1) / 2;
        const icy = (iy0 + iy1) / 2;
        const ik = Math.cos((icy * Math.PI) / 180);
        // Fitted to the archipelago's own box, not to a square containing it.
        // Both are about twice as wide as they are tall once the ocean between
        // the islands is taken out, so a square box threw away half the room
        // and drew them at half the size they had space for.
        const iW = (ix1 - ix0) * ik;
        const iH = iy1 - iy0;
        const isc = Math.min((mainLeft * 0.88) / (iW * 1.1), (ih * 0.84) / (iH * 1.1));
        const iproj = (p: Pt): Pt => [
          mainLeft / 2 + (p[0] - icx) * ik * isc - cssW / 2,
          iTop + ih / 2 - (p[1] - icy) * isc - cssH / 2,
        ];

        /* A ruled box around each archipelago, captioned in its corner.
         * Without it the islands read as debris in the ocean west of Porto —
         * they are drawn at their true spacing but at a scale of their own,
         * and a frame is how a map says "this panel is somewhere else, at a
         * different size". Drawn with the same pencil as everything else so
         * it belongs to the picture rather than sitting on top of it. */
        // The frame hugs what is drawn, not the cell it was given. The Azores
        // are two and a third times wider than they are tall, so a frame the
        // shape of the cell was three-fifths empty sky and read as a mistake.
        const cxPix = mainLeft / 2 - cssW / 2;
        const cyPix = iTop + ih / 2 - cssH / 2;
        const padX = 14;
        const padTop = 26; // room for the caption on its own line
        const padBot = 14;
        const bx0 = cxPix - (iW / 2) * isc - padX;
        const bx1 = cxPix + (iW / 2) * isc + padX;
        const by0 = cyPix - (iH / 2) * isc - padTop;
        const by1 = cyPix + (iH / 2) * isc + padBot;
        brush.noFill();
        brush.set('cpencil', pencil, 0.5);
        brush.polygon(
          jitter([
            [bx0, by0],
            [bx1, by0],
            [bx1, by1],
            [bx0, by1],
          ])
        );
        cityLabels.push({
          name: inset.name ?? '',
          x: bx0 + cssW / 2 + 9,
          y: by0 + cssH / 2 + 7,
          box: true,
        });

        for (const shape of inset.subs ?? []) {
          const rings = (shape.r ?? []).map((flat) => {
            const q: Pt[] = [];
            for (let j = 0; j < flat.length; j += 2) q.push(iun(flat, j));
            return jitter(q.map(iproj));
          });
          brush.noStroke();
          brush.fillBleed(0.06, 'in');
          brush.fill(band(shape.count), 92);
          for (const r of rings) brush.polygon(r);
          brush.noFill();
          brush.set('cpencil', pencil, 0.45);
          for (const r of rings) brush.polygon(r);
          if (shape.slug && shape.name) {
            hits.push({
              slug: shape.slug,
              name: shape.name,
              count: typeof shape.count === 'number' ? shape.count : null,
              rings: rings.map((r) => r.map(([x, y]) => [x + cssW / 2, y + cssH / 2] as Pt)),
            });
          }
        }
        brush.noFill();
        brush.set('rotring', ink, 1);
        for (const r of ifocus) brush.polygon(jitter(r.map(iproj)));
      });

      brush.pop();
      brush.render();
      if (cancelled) {
        canvas.remove();
        return;
      }
      hitsRef.current = hits;
      setLabels(cityLabels);
      canvas.classList.add('is-drawn');
      setDrawn(true);
    })().catch((err) => {
      console.error('[area art] could not draw', err);
      if (!cancelled) setFailed(true);
    });

    return () => {
      cancelled = true;
    };
  }, [art, focus, epoch]);

  const [labels, setLabels] = useState<PlaceLabel[]>([]);

  /* ---------------------------------------------------------- interaction */
  const locate = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const r = canvas.getBoundingClientRect();
    const pt: Pt = [e.clientX - r.left, e.clientY - r.top];
    // Last drawn wins: a small area drawn over a large one is the one meant.
    for (let i = hitsRef.current.length - 1; i >= 0; i--) {
      const h = hitsRef.current[i]!;
      if (inside(pt, h.rings)) return { hit: h, x: pt[0], y: pt[1] };
    }
    return null;
  }, []);

  if (failed) return null;

  return (
    <div className={`aart${drawn ? ' is-drawn' : ''}`} ref={hostRef}>
      {/* The overlays are positioned in canvas coordinates, so they live in a
          box that *is* the canvas. Hanging them off the outer flex container
          put every place name a couple of hundred pixels to the left of the
          map, because the canvas is centred in a wider column. */}
      <div
        className={`aart-stage${hover ? ' is-over' : ''}`}
        ref={stageRef}
        onPointerMove={(e) => setHover(locate(e))}
        onPointerLeave={() => setHover(null)}
        onClick={() => {
          if (hover) window.location.href = `${base}/areas/${hover.hit.slug}`;
        }}
      >
        {labels.map((l) => (
          <span
            className={l.box ? 'aart-place aart-inset-name' : 'aart-place'}
            key={l.name}
            style={{ left: `${l.x}px`, top: `${l.y}px` }}
          >
            {l.name}
          </span>
        ))}
        {hover && (
          <div
            className="aart-readout"
            style={{ left: `${hover.x}px`, top: `${hover.y}px` }}
            role="status"
          >
            <b>{hover.hit.name}</b>
            <span className="num">{f.num0(hover.hit.count)}</span>
          </div>
        )}
      </div>
    </div>
  );
}
