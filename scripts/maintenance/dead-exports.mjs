// Exact-identifier dead-export index for lib/** (SCAN-502, ADR-1145).
//
// Run it: `node scripts/maintenance/dead-exports.mjs`. It is a REPORT, not a gate — it exits 0 with
// a list, and deliberately fails ONLY when its own walk stops descending.
//
// 🔴 THE PITFALL THIS FILE EXISTS TO AVOID. SCAN-502's first pass read only .ts/.tsx and scored
// lib/help/drift.ts and lib/ai/autodoc.ts as FULLY DEAD. Both are LIVE, consumed by scripts/*.mts.
// A sweep run on that output deletes working code. CONSUMER_EXT below is therefore the load-bearing
// line: every extension that can reference a lib identifier has to be in it.
//
// ⚠️ AND A DEAD EXPORT IS NOT AUTOMATICALLY DEAD CODE. The 2026-08-25 classification found the 19
// unreferenced lib FUNCTIONS split three ways, and only one of the three is safe to delete blindly:
//   · BUILT BUT NEVER WIRED — runContestSweep documents itself "safe to run on a schedule" and none
//     of the 27 crons in vercel.json calls it. Deleting it removes a finished feature.
//   · GENUINELY RETIRED, WITH A STALE DOC — spaceTrailingProcessedCents still cites ADR-552 for the
//     "you'd have saved $X" nudge, which ADR-811 RETIRED. The code is dead; its comment advertises a
//     feature that no longer exists, which is how it reads as a gap when it is not.
//   · CONVENIENCE WRAPPERS — the majority. Dropping the `export` keyword is the whole change.
// So read the report, then read each function. The report ranks; it does not decide.
// 🔴 THE PITFALL SCAN-502 RECORDS: a scan that only reads .ts/.tsx scores lib/help/drift.ts and
// lib/ai/autodoc.ts as fully dead. They are LIVE, consumed by scripts/*.mts. Any consumer extension
// left out of this list turns a live module into a deletion.
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const SKIP = new Set(['node_modules', '.next', '.git', 'dist', 'build', '.vercel', 'coverage'])
const CONSUMER_EXT = /\.(ts|tsx|mts|cts|cjs|mjs|js|jsx|yml|yaml|json|md|sql)$/

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else out.push(p)
  }
  return out
}

const all = walk(ROOT)
if (all.length < 2000) { console.error(`only ${all.length} files walked — the walk is not descending`); process.exit(1) }
const consumers = all.filter((f) => CONSUMER_EXT.test(f))
const libFiles = all.filter((f) => /\/lib\/.*\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f))

// Exported value/type identifiers, per file.
const EXPORT_RE = /^export\s+(?:async\s+)?(?:function|const|let|var|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/gm
const declared = new Map() // ident -> [files]
const perFile = new Map()
for (const f of libFiles) {
  const src = readFileSync(f, 'utf8')
  const names = []
  for (const m of src.matchAll(EXPORT_RE)) names.push(m[1])
  if (names.length) { perFile.set(f, names); for (const n of names) { if (!declared.has(n)) declared.set(n, []); declared.get(n).push(f) } }
}

// One pass over every consumer file, counting exact-identifier occurrences.
const counts = new Map() // ident -> Map(file -> n)
const wanted = new Set(declared.keys())
for (const f of consumers) {
  let src
  try { src = readFileSync(f, 'utf8') } catch { continue }
  for (const m of src.matchAll(/[A-Za-z_$][\w$]*/g)) {
    const id = m[0]
    if (!wanted.has(id)) continue
    if (!counts.has(id)) counts.set(id, new Map())
    const c = counts.get(id)
    c.set(f, (c.get(f) ?? 0) + 1)
  }
}

const rows = []
for (const [ident, homes] of declared) {
  if (homes.length !== 1) continue           // ambiguous name — skip, cannot attribute safely
  const home = homes[0]
  const c = counts.get(ident) ?? new Map()
  let outside = 0, outsideFiles = []
  for (const [f, n] of c) {
    if (f === home) continue
    outside += n
    outsideFiles.push(path.relative(ROOT, f))
  }
  const inHome = c.get(home) ?? 0
  rows.push({ ident, home: path.relative(ROOT, home), outside, inHome, outsideFiles })
}

const dead = rows.filter((r) => r.outside === 0)
const declOnly = dead.filter((r) => r.inHome <= 1)   // 1 = the declaration itself
console.log(`walked ${all.length} files · ${consumers.length} consumers · ${libFiles.length} lib modules`)
console.log(`unique attributable exports: ${rows.length}`)
console.log(`dead outside their own file: ${dead.length}`)
console.log(`DECLARATION-ONLY (safe-delete candidates): ${declOnly.length}`)
console.log('')
for (const r of declOnly.sort((a, b) => a.home.localeCompare(b.home)).slice(0, 60)) {
  console.log(`  ${r.home}  ::  ${r.ident}`)
}
