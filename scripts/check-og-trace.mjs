#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// THE GUARD ON THE BIGGEST LINE IN THE BUILD'S DISK BUDGET (ADR-1002).
//
// `sharp` is a native package: 17.7MB of libvips plus a 405KB .node binary, and `next/og` loads it
// internally to re-encode a card. Only routes that RASTERISE need it. Everything else that carries
// it is dead weight copied once per serverless function.
//
// On 2026-08-11 that weight stopped production dead. `app/opengraph-image.tsx` was the ROOT
// metadata image, so Next inherited the module into EVERY page's metadata module and all ~403
// functions carried libvips — 6.9GB of one file, and `Deploying outputs` died with ENOSPC about
// nineteen minutes in. The Studio wizards could not reach production for a day. The card is now a
// static file (app/opengraph-image.jpg) and the total dropped from 16.7GB to 9.8GB.
//
// Two failure modes, and BOTH are silent — neither shows up in a green build or a passing test:
//
//   * sharp spreads again      -> a new `opengraph-image.tsx` high in the tree puts the rasteriser
//                                 back into every page beneath it. Nothing errors; the deploy just
//                                 gets GBs heavier until one day it does not fit.
//   * an OG route loses sharp  -> `deliverCard` is deliberately fail-safe, so it swallows the
//                                 failed import and serves the raw PNG. Every card silently goes
//                                 from ~151KB to ~1.7MB. Nothing errors at all.
//
// Run AFTER `pnpm build` — it reads the trace files that build just wrote.
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync, existsSync, globSync } from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const SERVER_DIR = path.join(ROOT, '.next', 'server')

// ── THE BASELINE ────────────────────────────────────────────────────────────────────────────
// Zero is not reachable, and pretending otherwise would make this check unrunnable. A segment that
// renders its OWN card (an event, a Space, a claim link) legitimately hands the rasteriser to the
// pages in that segment — that is the same inheritance, one level down, and those cards are per
// entity so they cannot become static files. What must never happen again is a metadata image near
// the ROOT of the tree, which is what turns "a few dozen" into "all of them".
//
// Lower this number when a segment's card is retired. Raising it is a real decision: it means a
// new share card was added high in the tree, and it costs ~18MB x every page beneath it.
const MAX_INCIDENTAL = 70

if (!existsSync(SERVER_DIR)) {
  console.error('check:og-trace — no .next/server. Run `pnpm build` first.')
  process.exit(1)
}

/** Trace files for the metadata-image ROUTES themselves.
 *
 *  ⚠️ MATCH THE ROUTE PATH, NOT THE FILENAME. A card route is a DIRECTORY —
 *  `app/discover/circles/[id]/opengraph-image/route.js.nft.json` — so anchoring this to the end of
 *  the filename matches nothing at all, and the "an OG route lost sharp" half of this check then
 *  passes vacuously forever while silently serving 1.7MB PNGs. It did exactly that once.
 *
 *  A `.jpg`/`.png` trace is a static file being served, not a card being drawn: it needs no
 *  rasteriser and must not be asked for one. */
const RASTERISING = /(opengraph-image|twitter-image)/
const STATIC_IMAGE = /\.(jpg|jpeg|png|gif|webp|avif)\//
const LIBVIPS = /libvips-cpp\.so/

const traces = globSync('**/*.nft.json', { cwd: SERVER_DIR })
if (traces.length === 0) {
  console.error('check:og-trace — .next/server holds no trace files. Did the build finish?')
  process.exit(1)
}

const carrying = new Set()
for (const rel of traces) {
  let files
  try {
    files = JSON.parse(readFileSync(path.join(SERVER_DIR, rel), 'utf8')).files
  } catch {
    continue // a trace we cannot read is not evidence of a violation
  }
  if (Array.isArray(files) && files.some((f) => LIBVIPS.test(f))) carrying.add(rel)
}

const isRasteriser = (rel) => RASTERISING.test(rel) && !STATIC_IMAGE.test(rel)
const route = (rel) => '/' + rel.replace(/\.js\.nft\.json$/, '').replace(/\/route$/, '')
const gb = (n) => (n * 17.7 >= 1024 ? `${((n * 17.7) / 1024).toFixed(1)}GB` : `${(n * 17.7).toFixed(0)}MB`)

const rasterisers = traces.filter(isRasteriser)
const starved = rasterisers.filter((rel) => !carrying.has(rel))
const incidental = [...carrying].filter((rel) => !isRasteriser(rel))

let failed = false

if (starved.length > 0) {
  failed = true
  console.error(
    `\n🔴 ${starved.length} card-rasterising route(s) ship WITHOUT sharp.\n` +
      `   They will not error. deliverCard catches the failed import and serves the raw PNG, so\n` +
      `   every card silently becomes ~1.7MB instead of ~151KB — including the claim card that\n` +
      `   exists specifically to stop Apple Mail timing out.\n`,
  )
  for (const rel of starved) console.error(`     ${route(rel)}`)
}

if (incidental.length > MAX_INCIDENTAL) {
  failed = true
  console.error(
    `\n🔴 sharp reached ${incidental.length} function(s) that never rasterise a card ` +
      `(budget ${MAX_INCIDENTAL}).\n` +
      `   That is ~${gb(incidental.length)} of libvips copies in the deploy.\n\n` +
      `   This is almost always a NEW metadata image added high in the route tree. An\n` +
      `   \`opengraph-image.tsx\` is inherited by every page below it, and it imports next/og,\n` +
      `   which loads sharp. Put the card at the narrowest segment that needs it — or, if it\n` +
      `   renders the same bytes every time, ship it as a static file the way the root card does\n` +
      `   (app/opengraph-image.jpg, generated by app/dev/og-root-card).\n`,
  )
  const bySegment = new Map()
  for (const rel of incidental) {
    const seg = route(rel).split('/').slice(0, 3).join('/')
    bySegment.set(seg, (bySegment.get(seg) ?? 0) + 1)
  }
  for (const [seg, n] of [...bySegment].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
    console.error(`     ${String(n).padStart(4)} function(s) under ${seg}`)
  }
}

if (failed) process.exit(1)

console.log(
  `✅ check:og-trace — sharp ships to all ${rasterisers.length} rasterising route(s), and to ` +
    `${incidental.length} other function(s) by segment inheritance (budget ${MAX_INCIDENTAL}). ` +
    `${traces.length - carrying.size} functions carry none of it.`,
)
