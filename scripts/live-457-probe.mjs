#!/usr/bin/env node
// LIVE-457 probe — "The member shell photographed a rail of live lists" (ADR-1522).
//
// Measures the CONSEQUENCE in the committed artifact: in the visual baselines, the member shell's
// rail column is ONE mask box on the surfaces that drifted, and /feed still photographs its rail.
//
// The shell the baselines depict is read OFF THE PNGs, not off the source, because the pixels are
// what pr-compare holds every pull request to:
//
//   DAWN       one rail, the w-72 <aside> in components/layout/app-shell.tsx, a 280-330 px mask box
//              at the right edge. That box must be >= 99.9 percent mask colour below the header on
//              app-settings, app-nearby and app-space-console.
//   FREQUENCY  two rails, the sticky .fqm-rail-l / .fqm-rail-r asides in
//              components/frequency/members/shell/rail-layout.tsx (220-320 px wide, 248 by default,
//              668 px tall at the desktop viewport). Both boxes must be >= 99.9 percent mask colour
//              on app-settings and app-nearby. The Space console is SKIPPED: under Frequency it is an
//              edge route with no rails, so there is no rail column to measure.
//
// In both, /feed's rail column must NOT be masked (<= 95 percent): its rail did not drift, so it
// keeps its picture. And the shell the PNGs depict must still stamp `data-rail-column` (on its one
// rail, or on both), because that attribute is what the mask selector matches: a revert alone fails
// that arm before any recapture can fail the pixel arm.
//
// Pure node. Exit 0 = done, 1 = not done, 79 = could not look.

import { existsSync, readFileSync } from 'node:fs'

// LIVE457_DIR points the probe at another PNG set, for mutation tests only.
const DIR = process.env.LIVE457_DIR || 'test/e2e/__screenshots__/visual.spec.ts/'
const MODE = 'dawn-light-desktop' // the attribute cannot be present in one mode and absent in the other
const ROW = 200 // inside the rail box in both shells, below every header
const fail = (why) => {
  console.error(`LIVE-457: ${why}`)
  process.exit(1)
}
const png = (slug) => `${DIR}${slug}--${MODE}.png`

for (const slug of ['app-settings', 'app-nearby', 'app-feed']) {
  if (!existsSync(png(slug))) {
    console.error(`LIVE-457: could not look, ${png(slug)} is missing`)
    process.exit(79)
  }
}

const { decodePng } = await import('./visual-diff-bands.mjs')
const load = (slug) => decodePng(readFileSync(png(slug)))
const isMask = (img, x, y) => {
  const i = (y * img.width + x) * 4
  return img.data[i] === 255 && img.data[i + 1] === 0 && img.data[i + 2] === 255
}
const coverage = (img, box) => {
  let total = 0
  let masked = 0
  for (let y = box.y0; y <= Math.min(box.y1, img.height - 1); y += 1) {
    for (let x = box.x0; x <= box.x1; x += 1) {
      total += 1
      if (isMask(img, x, y)) masked += 1
    }
  }
  return total === 0 ? 0 : masked / total
}
/** Every horizontal run of mask colour on one row. */
const runsAt = (img, y) => {
  const runs = []
  let start = -1
  for (let x = 0; x <= img.width; x += 1) {
    const on = x < img.width && isMask(img, x, y)
    if (on && start < 0) start = x
    if (!on && start >= 0) {
      runs.push({ x0: start, x1: x - 1, width: x - start })
      start = -1
    }
  }
  return runs
}
const pct = (v) => (100 * v).toFixed(2)

const settings = load('app-settings')
const runs = runsAt(settings, ROW)
const leftRail = runs.find((r) => r.x0 < 160 && r.width >= 200 && r.width <= 340)
const rightEdge = runs.filter((r) => r.x1 >= settings.width - 120).at(-1)
const design = leftRail ? 'frequency' : 'dawn'

if (design === 'dawn') {
  const shell = readFileSync('components/layout/app-shell.tsx', 'utf8')
  if (!/<aside data-rail-column/.test(shell)) {
    fail('components/layout/app-shell.tsx no longer stamps data-rail-column on the rail aside, so the mask selector matches nothing and the member surfaces go straight back to photographing a list whose length changes between two honest captures')
  }
  // The DAWN box: the rightmost mask run on the row, rail-sized, at the right edge (a scrollbar gutter
  // to the left of the viewport edge since LIVE-479).
  if (!rightEdge || rightEdge.x1 < 1180 || rightEdge.width < 280 || rightEdge.width > 330) {
    fail(`app-settings shows neither Frequency's two rail boxes nor DAWN's one rail-sized mask box at the right edge (mask runs at row ${ROW}: ${runs.map((r) => `${r.x0}-${r.x1}`).join(' ') || 'none'}), so the rail column cannot be located. A capture taken before both rails carried data-rail-column reads this way; recapture`)
  }
  const box = { x0: rightEdge.x0, x1: rightEdge.x1, y0: 60, y1: Number.MAX_SAFE_INTEGER }
  for (const slug of ['app-settings', 'app-nearby', 'app-space-console']) {
    if (!existsSync(png(slug))) fail(`${png(slug)} is missing`)
    const cov = coverage(load(slug), box)
    if (cov < 0.999) fail(`${slug} photographs its right rail again: only ${pct(cov)} percent of the rail column (x ${box.x0} to ${box.x1}, below the header) is mask colour`)
  }
  const feed = coverage(load('app-feed'), box)
  if (feed > 0.95) fail(`/feed lost its rail picture too (${pct(feed)} percent masked). This mask is per-surface and measured: /feed did not drift and still photographs its rail head`)
  console.log(`LIVE-457 ok (DAWN baselines): the rail column x ${box.x0}-${box.x1} is one masked box on settings, nearby and the Space console, and /feed still photographs its rail`)
  process.exit(0)
}

// ── Frequency ─────────────────────────────────────────────────────────────────────────────────────
const layout = readFileSync('components/frequency/members/shell/rail-layout.tsx', 'utf8')
const hooks = layout.match(/<aside data-rail-column\b[^>]*fqm-rail-(l|r)\b/g) ?? []
if (!hooks.some((h) => /fqm-rail-l/.test(h)) || !hooks.some((h) => /fqm-rail-r/.test(h))) {
  fail('components/frequency/members/shell/rail-layout.tsx must stamp data-rail-column on BOTH rail asides (.fqm-rail-l and .fqm-rail-r); a rail without it is photographed with whatever its live lists held that day')
}
const rightRail = runs.find((r) => r !== leftRail && r.x1 >= settings.width - 120 && r.width >= 200 && r.width <= 340)
if (!rightRail) {
  fail(`app-settings masks the left rail but shows no rail-sized mask box at the right (mask runs at row ${ROW}: ${runs.map((r) => `${r.x0}-${r.x1}`).join(' ')}); the right rail's live lists are photographed again`)
}
/** A rail's box: its columns from the row scan, its rows the contiguous run through ROW of rows that
 *  are mask colour ACROSS the rail's whole width. The sticky rail is a fixed-height box, so a masked
 *  rail is one tall magenta rectangle; panel-only masks leave full-width gaps between panels and read
 *  as a short box. (The rail's panels also carry their own `rail-panel` masks, and a mask paints an
 *  element's whole bounding box even where the rail's scroller clips it, so the centre COLUMN can
 *  stay magenta well below the rail; a full-width row cannot be faked that way by gappy panels.) */
const railBox = (img, run) => {
  const fullRow = (y) => {
    for (let x = run.x0; x <= run.x1; x += 1) if (!isMask(img, x, y)) return false
    return true
  }
  if (!fullRow(ROW)) return null
  let y0 = ROW
  while (y0 > 0 && fullRow(y0 - 1)) y0 -= 1
  let y1 = ROW
  while (y1 < img.height - 1 && fullRow(y1 + 1)) y1 += 1
  return { x0: run.x0, x1: run.x1, y0, y1 }
}
const boxes = { left: railBox(settings, leftRail), right: railBox(settings, rightRail) }
for (const slug of ['app-settings', 'app-nearby']) {
  const img = slug === 'app-settings' ? settings : load(slug)
  for (const [side, run] of [['left', leftRail], ['right', rightRail]]) {
    const box = railBox(img, run)
    if (!box || box.y1 - box.y0 + 1 < 400) {
      fail(`${slug} has no rail-height mask box over its ${side} rail (x ${run.x0} to ${run.x1}${box ? `, rows ${box.y0} to ${box.y1}` : ''}); the sticky rail is at least 420 px tall, so its live lists are photographed again`)
    }
    const cov = coverage(img, box)
    if (cov < 0.999) fail(`${slug} photographs its ${side} rail again: only ${pct(cov)} percent of the rail box (x ${box.x0}-${box.x1}, rows ${box.y0}-${box.y1}) is mask colour`)
  }
}
const feed = load('app-feed')
for (const [side, box] of Object.entries(boxes)) {
  const cov = coverage(feed, box)
  if (cov > 0.95) fail(`/feed lost its ${side} rail picture too (${pct(cov)} percent masked). The rail mask is per-surface and measured: /feed did not drift and keeps its rails`)
}
console.log(`LIVE-457 ok (Frequency baselines): both rails (x ${boxes.left.x0}-${boxes.left.x1} and ${boxes.right.x0}-${boxes.right.x1}, rows ${boxes.left.y0}-${boxes.left.y1}) are one masked box each on settings and nearby, the Space console has no rails to mask, and /feed still photographs its rails`)
process.exit(0)
