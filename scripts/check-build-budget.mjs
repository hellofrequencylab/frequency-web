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
// Measured 2026-08-12, immediately after ADR-1002: 9.80 GB across 481 functions.
// The container died somewhere north of ~16.7 GB. 13 GB sits clear of today's number with room for
// ordinary growth, and well under the cliff. It is a RATCHET in spirit: it may fall, and raising it
// is a decision that needs a reason in the commit, not a reflex.
const BUDGET_GB = 13
// Print anything that costs more than this on its own, so a failure names its cause immediately.
const REPORT_OVER_MB = 100

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

console.log(
  `✅ check:build-budget — ${gb(total)} GB across ${traces.length} functions, under the ${BUDGET_GB} GB budget.`,
)
if (worst.length > 0) {
  const [f, count, size, cost] = worst[0]
  console.log(
    `   Largest single cost: ${(cost / MB).toFixed(0)} MB (${(size / MB).toFixed(1)} MB x ${count} fns) — ${f}`,
  )
}
