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
// THIS GATE IS ABOUT PLACEMENT, NOT ABOUT DISK. It answers "how far up the tree did a card get
// attached", and that is the only question it is good at. The absolute cost of the artifact is
// enforced separately and directly by `check:build-budget` (13 GB across the real per-function
// output, same postbuild step, DEPLOY-SAFETY.md rule 1). Two gates, two questions: never reason
// about deploy size from this number, and never let a placement mistake through because the size
// gate is still green.
//
// ── 70 -> 100, 2026-08-12 (A-6). WHY. ────────────────────────────────────────────────────────
// MEASURED on the 2026-08-12 build: 67 incidental against a ceiling of 70. Three functions of
// headroom, on a number that moves by ONE every time anybody adds an ordinary page under a segment
// that owns a card. Four new pages under `/spaces/[slug]` — routine work, no card involved — would
// have failed a gate whose entire failure message talks about share cards, sending the next author
// hunting for an `opengraph-image.tsx` that does not exist. A gate that cries wolf gets its number
// bumped in a hurry by someone who has stopped reading it, which is how a real regression walks
// through. Headroom is what buys the message its credibility.
//
// Where the 67 sits, measured, and what growth actually looks like:
//     47  under app/(main)/spaces/[slug]   (the Space card; 50 routes in that segment)
//      6  under app/discover/<entity>/[slug] (per-entity detail cards)
//      5  under app/(main)/events/[slug]   (the event card)
//      4  under app/(help)                 (the help card)
//      3  the claim links, 1 spotlight, 1 the dev card generator
// Ordinary growth is +1 per page. 100 buys 33 of those — roughly a doubling of the Space
// settings/manage/CRM surface, which is the area under active construction (EDITOR-ARCHITECTURE
// E0-E10). That is real room, not a rounding-up.
//
// And it still fails loudly on the thing that actually broke production. Measured trace counts on
// the same build: a card at the ROOT reaches all 484 functions (403 carried libvips during
// ADR-1002); one at `app/(main)` reaches 303; one at `app/discover` reaches 28. The two placements
// that turn "a few dozen" into "all of them" overshoot 100 by 3x and 4x — this ceiling cannot
// launder either of them. What 100 does concede is a card placed on a segment of ~25 routes or
// fewer, which is the honest cost of any headroom at all: the gate cannot tell 22 new pages from
// one badly-placed card. That case is bounded at ~0.4 GB and lands in check:build-budget's lap,
// which is the correct division of labour.
//
// In disk terms this raise authorises at most 33 x 17.7MB = ~0.58 GB more than the old ceiling,
// against a 13 GB budget currently sitting at 9.80 GB. It is not where the danger is.
//
// Lower this number when a segment's card is retired. Raising it again is a real decision: it means
// a new share card was added high in the tree, and it costs ~18MB x every page beneath it. Raise it
// with a measurement and a paragraph, the way this one was, or not at all.
const MAX_INCIDENTAL = 100

/** How close to the ceiling counts as worth saying out loud on a PASSING run. The 70 -> 100 raise
 *  happened because nobody could see 67/70 coming until it failed; a gate that only speaks when it
 *  trips teaches you nothing about the run before. Advisory only — this never fails the build. */
const HEADROOM_WARN = 10

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
      `   (app/opengraph-image.jpg, generated by app/dev/og-root-card).\n\n` +
      `   ⚠️ IF NO CARD MOVED, THIS IS THE WRONG GATE TO READ. This one measures PLACEMENT — how\n` +
      `   far up the tree a rasteriser is attached — and ordinary pages accumulating under a\n` +
      `   segment that already owns a card trip the same wire, one function at a time. Check the\n` +
      `   breakdown below against the header's baseline first. The artifact's actual disk cost is\n` +
      `   enforced separately by check:build-budget; if that one is green, raising this ceiling\n` +
      `   with a measurement and a note in the header is the correct fix, not a workaround.\n`,
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

const headroom = MAX_INCIDENTAL - incidental.length
if (headroom <= HEADROOM_WARN) {
  console.log(
    `\n⚠️  check:og-trace — only ${headroom} function(s) of headroom left under the ${MAX_INCIDENTAL} ` +
      `budget.\n` +
      `   Read this BEFORE it fails, because the failure message assumes a misplaced share card and\n` +
      `   ordinary page growth trips the same wire. If no new opengraph-image.tsx went in, the cause\n` +
      `   is pages accumulating under a segment that already owns a card — see the header for how\n` +
      `   this number was set, and raise it with a measurement rather than a reflex.`,
  )
}
