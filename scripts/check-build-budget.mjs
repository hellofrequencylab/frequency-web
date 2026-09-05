#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// A CEILING ON WHAT THE DEPLOY WRITES TO DISK (ADR-1003).
//
// 🔴 THE INCIDENT THIS EXISTS FOR. On 2026-08-11 a merge to main compiled clean, passed 26 contract
// guards, passed 9,000+ tests, passed lint and typecheck — and then every production deploy died
// with ENOSPC about nineteen minutes into "Deploying outputs". Production served a week-old tree
// for a day and the Studio/Vera wizards could not ship. Six hours went into theories.
//
// Every gate in this repo measured the SOURCE. Not one measured the ARTIFACT. The build was ~1.5x
// over the container's disk budget for months and nothing said so, because nothing was looking.
// This is the thing that was looking away.
//
// WHAT IT MEASURES, and why it is not `du`. Vercel's builder copies each function's traced file set
// into that function's own directory, so a file reachable from 400 routes is written 400 times. The
// cost is therefore the PER-FUNCTION SUM, not the size of the unique file set — those two numbers
// differed by an order of magnitude in the incident (Vercel's own report said "873 MB output files"
// while the real write was 16.73 GB). `.next/server/**/*.nft.json` is exactly the per-function
// trace, so summing it is the honest number.
//
// HOW TO RESPOND WHEN THIS FAILS. Do not raise the budget as a first move. The failure prints the
// biggest costs by fan-out (size x number of functions carrying it); the fix is almost always to
// stop one heavy thing being reachable from every route, not to buy a bigger container. ADR-1002 is
// the worked example: one file at the root of app/ put a 17.7MB shared object into 403 functions.
//
// Runs as `postbuild`, so it runs on Vercel's real build. CI itself never builds (Vercel owns
// that), which is precisely why a source-only gate could not have caught this.
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync, statSync, existsSync, globSync } from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const SERVER_DIR = path.join(ROOT, '.next', 'server')

// ── THE BUDGET ──────────────────────────────────────────────────────────────────────────────
// It is a RATCHET in spirit: it may FALL, and raising it is a decision that needs a reason in the
// commit, not a reflex. It has now fallen once, and the reasoning is recorded here because the
// number matters far less than the next person understanding why it is what it is.
//
// The measured artifact, in order:
//   16.73 GB   before ADR-1002 — the container died somewhere north of this
//    9.80 GB   after the root share card went static (ADR-1002); the budget was set to 13 here
//    6.45 GB   after the icon and HEIC doors closed (ADR-1008)
//    5.59 GB   today, 485 functions, after the public/ glob closed (ADR-1010)
//
// 13 → 8 on 2026-08-12. Why 8, and not 7 and not 13:
//   · 13 was set against a 9.80 GB artifact. Against 5.59 GB it is a ceiling nothing can plausibly
//     reach by accident, which makes it decorative — and a gate that cannot fire is not a gate.
//   · 8 leaves ~2.4 GB of headroom over the measured number: room for ordinary feature growth
//     without a false alarm.
//   · It still fires long before disk does on the failure that actually happened. The measured
//     escalation ladder (ADR-1007): a share card at the ROOT reaches 484 functions, one at
//     app/(main) reaches 303. Either blows past 8 GB immediately.
//   · 7 would be tighter but is likelier to trip on a legitimate large feature and need raising
//     with a reason — and a budget that gets raised routinely stops being a budget.
//   · Headroom is real, not nominal: ADR-1008 records an irreducible vendor floor near 1.5 GB, and
//     the largest single remaining line is libvips-cpp.so at 1,440 MB (17.4 MB × 83
//     segment-inherited OG cards, 26% of the build). 8 GB is nowhere near that floor.
//
// This lowering was an agent's engineering call under a "do whatever is best practice" instruction,
// not an owner decision — recorded as such so nobody re-derives it as a requirement.
const BUDGET_GB = 8
// Print anything that costs more than this on its own, so a failure names its cause immediately.
const REPORT_OVER_MB = 100

// ── NON-TRIVIALITY FLOORS (scan2 L8-02, 2026-09-05) ──────────────────────────────────────────
// Measured on production e3cec7af2 (2026-08-25): 6.66 GB across 497 functions, and ADR-1008 records
// an irreducible vendor floor near 1.5 GB. Without these, a trace layout whose `files` paths no
// longer resolve (every stat fails, every size is 0) prints "0.00 GB across N functions, under the
// budget" and exits 0, which is the 2026-08-11 incident with a green light on it. A budget gate that
// reads zero has not measured the artifact. Exit 2 ("guard saw nothing") is distinct from a real
// breach (1) on purpose. Raise them only when the real numbers move, never to make a red build green.
const MIN_TRACES = 200
const MIN_TOTAL_GB = 1

if (!existsSync(SERVER_DIR)) {
  console.error('check:build-budget — no .next/server. This runs after a build.')
  process.exit(1)
}

const traces = globSync('**/*.nft.json', { cwd: SERVER_DIR })
if (traces.length === 0) {
  // Not a pass. A build that produced no traces is a build this gate cannot vouch for.
  console.error('check:build-budget — .next/server holds no trace files. Did the build finish?')
  process.exit(1)
}

const sizeCache = new Map()
function sizeOf(abs) {
  if (sizeCache.has(abs)) return sizeCache.get(abs)
  let s = 0
  try {
    const st = statSync(abs)
    s = st.isFile() ? st.size : 0
  } catch {
    s = 0 // a traced path we cannot stat contributes nothing rather than crashing the build
  }
  sizeCache.set(abs, s)
  return s
}

let total = 0
/** absolute file -> [how many functions carry it, its size] */
const fanout = new Map()

for (const rel of traces) {
  const traceFile = path.join(SERVER_DIR, rel)
  let files
  try {
    files = JSON.parse(readFileSync(traceFile, 'utf8')).files
  } catch {
    continue
  }
  if (!Array.isArray(files)) continue
  const base = path.dirname(traceFile)
  const seen = new Set()
  for (const f of files) {
    const abs = path.resolve(base, f)
    if (seen.has(abs)) continue // one function counts a file once, however often it is listed
    seen.add(abs)
    const s = sizeOf(abs)
    total += s
    const cur = fanout.get(abs)
    if (cur) cur[0] += 1
    else fanout.set(abs, [1, s])
  }
}

const GB = 1024 ** 3
const MB = 1024 ** 2
const gb = (b) => (b / GB).toFixed(2)
const budgetBytes = BUDGET_GB * GB

const worst = [...fanout.entries()]
  .map(([f, [count, size]]) => [path.relative(ROOT, f), count, size, count * size])
  .filter(([, , , cost]) => cost > REPORT_OVER_MB * MB)
  .sort((a, b) => b[3] - a[3])
  .slice(0, 12)

if (total > budgetBytes) {
  console.error(
    `\n🔴 check:build-budget — the deploy would write ${gb(total)} GB across ${traces.length} ` +
      `functions, over the ${BUDGET_GB} GB budget.\n\n` +
      `   This is the shape of the 2026-08-11 outage: the build compiles and every source-level\n` +
      `   gate passes, then "Deploying outputs" runs out of disk. Fix the fan-out below rather\n` +
      `   than raising the budget — the usual cause is one heavy module reachable from a shared\n` +
      `   layout or a ROOT metadata file, which multiplies it by every route. See ADR-1002.\n\n` +
      `   Biggest costs (size x functions carrying it):\n`,
  )
  for (const [f, count, size, cost] of worst) {
    console.error(
      `     ${(cost / MB).toFixed(0).padStart(6)} MB  = ${(size / MB).toFixed(1).padStart(6)} MB x ${String(count).padStart(4)} fns  ${f}`,
    )
  }
  console.error('')
  process.exit(1)
}

if (traces.length < MIN_TRACES || total < MIN_TOTAL_GB * GB) {
  console.error(
    `\n🔴 check:build-budget saw nothing it can vouch for: ${gb(total)} GB (floor ${MIN_TOTAL_GB} GB) across ` +
      `${traces.length} function(s) (floor ${MIN_TRACES}).\n` +
      `   A deploy this size does not exist; the vendor floor alone is ~1.5 GB (ADR-1008). Either the\n` +
      `   traced paths no longer resolve from their .nft.json, the trace layout under .next/server\n` +
      `   changed, or the build did not finish. A zero reading is not a pass.\n`,
  )
  process.exit(2)
}

console.log(
  `✅ check:build-budget — ${gb(total)} GB across ${traces.length} functions, under the ${BUDGET_GB} GB budget.`,
)
if (worst.length > 0) {
  const [f, count, size, cost] = worst[0]
  console.log(
    `   Largest single cost: ${(cost / MB).toFixed(0)} MB (${(size / MB).toFixed(1)} MB x ${count} fns) — ${f}`,
  )
}
