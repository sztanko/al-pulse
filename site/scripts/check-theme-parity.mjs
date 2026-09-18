/** The dark palette is declared twice — once under `prefers-color-scheme` for
 * "follow the system", once under `[data-theme="dark"]` for an explicit choice
 * — because plain CSS cannot share one block between them.
 *
 * A token added to one and not the other yields a site that is correct until
 * someone touches the switch, then quietly wrong, with no page render that
 * would reveal it. Ten minutes of build check against an indefinite bug.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, '..', 'src', 'styles', 'tokens.css'), 'utf8');

/** Pull `--name: value;` pairs out of the block starting at `startIdx`. */
function blockAt(startIdx) {
  const open = css.indexOf('{', startIdx);
  if (open === -1) return null;
  let depth = 0;
  let i = open;
  for (; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}') {
      depth--;
      if (depth === 0) break;
    }
  }
  const body = css.slice(open + 1, i);
  const out = new Map();
  for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    out.set(m[1], m[2].trim());
  }
  return out;
}

function findBlock(marker, label) {
  const idx = css.indexOf(marker);
  if (idx === -1) {
    console.error(`check:theme FAIL — could not find the ${label} block (${marker})`);
    process.exit(1);
  }
  const b = blockAt(idx);
  if (!b || b.size === 0) {
    console.error(`check:theme FAIL — the ${label} block is empty`);
    process.exit(1);
  }
  return b;
}

const root = findBlock(':root {', 'base :root');
const mediaDark = findBlock(":root:not([data-theme='light'])", 'system-dark');
const attrDark = findBlock(":root[data-theme='dark']", 'explicit-dark');

let failed = false;

// 1. The two dark copies must carry exactly the same token names AND values.
const names = (m) => [...m.keys()].sort();
const onlyInMedia = names(mediaDark).filter((k) => !attrDark.has(k));
const onlyInAttr = names(attrDark).filter((k) => !mediaDark.has(k));

if (onlyInMedia.length || onlyInAttr.length) {
  failed = true;
  console.error('check:theme FAIL — the two dark palettes declare different tokens');
  if (onlyInMedia.length) console.error('  only under prefers-color-scheme:', onlyInMedia.join(', '));
  if (onlyInAttr.length) console.error('  only under [data-theme=dark]:', onlyInAttr.join(', '));
}

const differing = names(mediaDark)
  .filter((k) => attrDark.has(k) && attrDark.get(k) !== mediaDark.get(k))
  .map((k) => `${k} (${mediaDark.get(k)} vs ${attrDark.get(k)})`);
if (differing.length) {
  failed = true;
  console.error('check:theme FAIL — the two dark palettes disagree on values:');
  for (const d of differing) console.error('  ' + d);
}

// 2. No colour may exist only in a dark block: the light palette is the base,
//    and a token defined only in dark is undefined in light.
const missingInRoot = names(mediaDark).filter((k) => !root.has(k));
if (missingInRoot.length) {
  failed = true;
  console.error(
    'check:theme FAIL — defined only in dark, so undefined in light:',
    missingInRoot.join(', ')
  );
}

if (failed) process.exit(1);

console.log(
  `check:theme ok — ${root.size} tokens on :root, ${mediaDark.size} overridden in both dark blocks`
);
