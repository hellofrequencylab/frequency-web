// SCAN-1279: the anon-callable SECURITY DEFINER review names every function it claims to cover.
//
// The SCAN-1224 probe only asks that docs/security/definer-rpc-review.md exists, so the review went
// stale the day a new public definer function shipped (public_circles_page, 2026-11-16) and stayed
// green. This check reconciles the two sources CI can read:
//   - scripts/function-grants.txt: every function whose verdict is `public` (anon may EXECUTE);
//   - supabase/migrations: the LAST definition of that function, and whether it is SECURITY DEFINER.
// Each such function must be named in backticks in the review. CI has no catalog, so a function
// made by hand in the database is out of reach here; the review's own "Live catalog check" section
// carries the query that finds those.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const DIR = join('supabase', 'migrations')
const review = readFileSync(join('docs', 'security', 'definer-rpc-review.md'), 'utf8')
const anonNames = readFileSync(join('scripts', 'function-grants.txt'), 'utf8')
  .split('\n')
  .map((l) => l.replace(/#.*/, '').trim().split(/\s+/))
  .filter((p) => p.length === 2 && p[1] === 'public')
  .map((p) => p[0])

const files = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort()
if (files.length < 400) {
  console.error(`definer review: read ${files.length} migrations, expected at least 400. A broken read, not a pass.`)
  process.exit(1)
}

/** name -> true when its last definition (or a later ALTER) makes it SECURITY DEFINER. */
const definer = new Map()
const wanted = new Set(anonNames)
const CREATE = /create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?"?([a-z0-9_]+)"?\s*\(/gi
const ALTER = /alter\s+function\s+(?:public\.)?"?([a-z0-9_]+)"?[^;]*?\bsecurity\s+(definer|invoker)/gi
for (const f of files) {
  const sql = readFileSync(join(DIR, f), 'utf8').replace(/--[^\n]*/g, '')
  const events = []
  for (const m of sql.matchAll(CREATE)) {
    const name = m[1].toLowerCase()
    if (!wanted.has(name)) continue
    // The attributes sit before the body and after it: cut the dollar-quoted body out, then read to the `;`.
    const rest = sql.slice(m.index)
    const open = rest.match(/\$[a-z0-9_]*\$/i)
    let attrs
    if (open) {
      const bodyStart = open.index + open[0].length
      const close = rest.indexOf(open[0], bodyStart)
      const tail = close < 0 ? '' : rest.slice(close + open[0].length)
      attrs = rest.slice(0, open.index) + ' ' + tail.slice(0, Math.max(0, tail.indexOf(';')))
    } else {
      attrs = rest.slice(0, Math.max(0, rest.indexOf(';')))
    }
    events.push({ at: m.index, name, on: /\bsecurity\s+definer\b/i.test(attrs) })
  }
  for (const m of sql.matchAll(ALTER)) {
    const name = m[1].toLowerCase()
    if (wanted.has(name)) events.push({ at: m.index, name, on: m[2].toLowerCase() === 'definer' })
  }
  for (const e of events.sort((a, b) => a.at - b.at)) definer.set(e.name, e.on)
}

const covered = anonNames.filter((n) => definer.get(n))
const missing = covered.filter((n) => !review.includes('`' + n + '`') && !review.includes('`' + n + '('))
if (covered.length < 15) {
  console.error(`definer review: only ${covered.length} anon-callable definer functions found in the migrations. A broken parse, not a pass.`)
  process.exit(1)
}
if (missing.length) {
  console.error(`definer review: ${missing.length} anon-callable SECURITY DEFINER function(s) are not in docs/security/definer-rpc-review.md:`)
  for (const n of missing) console.error(`  ${n}`)
  process.exit(1)
}
console.log(`ok: all ${covered.length} anon-callable SECURITY DEFINER functions are named in the review`)
