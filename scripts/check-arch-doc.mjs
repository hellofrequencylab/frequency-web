#!/usr/bin/env node
// ARCHITECTURE.md ⇄ tree contract.
//
// WHY THIS EXISTS. On 2026-08-17 docs/ARCHITECTURE.md still documented two cron endpoints that
// had been deleted a month earlier (`coop-pulse`, `practice-streaks`, torn down with Rewards
// Economy v3 — ADR-305), a `lib/site.ts` fallback that no longer existed, a route that had been
// removed, a 19-cron count that was really 27, and a trigger column list naming two dropped
// columns. Nothing noticed, because nothing builds from docs/: the first reader to find out is
// whoever follows the claim — increasingly an AI session, which then reasons from a doc that
// describes a tree that is not there. This is the fifth instance in this repo of the same class
// (docs/DEPLOY-SAFETY.md, ADR-1011, the ci.yml `pr-compare` comment, the migration-count check).
//
// ── SCOPE, AND WHY IT IS EXACTLY ONE FILE ─────────────────────────────────────────────────────
//
// docs/ARCHITECTURE.md is the LIVE description of the tree: it exists to be true right now. That
// is what separates it from the rest of docs/, and it is why scripts/check-docs-links.mjs
// deliberately checks only markdown LINKS and states that "backticked code paths in prose are NOT
// checked (an ADR describing a file that later moved is history, not rot)". Correct for an ADR;
// wrong for this file. So this guard is narrow on purpose. Widening it to another doc means that
// doc has also signed up to be true, which is a real commitment — do not do it by accident.
//
// ── WHAT IT CHECKS ────────────────────────────────────────────────────────────────────────────
//
//   1. PATH CLAIMS  — every backticked repo path (`lib/auth.ts`, `app/api/cron`, `components/ui`)
//      must exist as a file or a directory. Brace sets expand (`lib/supabase/{server,admin}.ts`).
//   2. ROUTE CLAIMS — every backticked URL path (`/sign-in`, `/onboarding`) must resolve to a real
//      handler under app/, seeing through `(groups)` and `@slots` the way the router does.
//      ⚠️ LITERAL BY DEFAULT, and that is a deliberate correction. The first version consumed
//      `[dynamic]` segments too, "the way the router does" — and promptly declared `/ghost-route`
//      a real route, because some catch-all under app/ would indeed serve it. True, and useless:
//      it made the route check incapable of failing, which is worse than not having one. A doc
//      naming `/sign-in` means the literal page. To claim a dynamic route, write the segment out
//      (`/spaces/[slug]`) and the matching `[slug]` dir is then required to exist.
//   3. CRON CLAIMS  — inside the `## Cron` section, every backticked lowercase slug is read as a
//      job name and must appear BOTH in vercel.json's `crons` and as app/api/cron/<name>/route.ts.
//      Cron names are bare slugs in prose, which is exactly the form the 2026-08-17 drift took, so
//      a path-only check would have missed it entirely.
//   4. THE COUNT    — the doc must state "**N jobs as of <date>**" and N must equal the number of
//      entries in vercel.json. The stale doc said 19 while the real number was 27, and a count in
//      prose is the single easiest thing to check and the single most likely thing to rot.
//
// ── NEGATIVE CLAIMS ARE ASSERTIONS TOO ────────────────────────────────────────────────────────
//
// The doc names some things precisely because they must NOT exist ("do not rename proxy.ts to
// middleware.ts"; "the v2 crons are gone"). Those are not exemptions — they are claims in the
// other direction, and ABSENT below asserts them as such. If someone re-adds `middleware.ts` or
// resurrects `coop-pulse`, this guard fails and the doc's warning gets rewritten rather than
// quietly becoming a lie. Same contract as UNWIRED in scripts/guard-wiring.test.ts.
//
// ── IT CANNOT REPORT HEALTH ON A CORPUS OF ZERO ───────────────────────────────────────────────
//
// Every path here is read with node:fs. Nothing shells out to rg/grep/npx, and nothing catches an
// error into an empty result: a walk that finds nothing is a FLOOR VIOLATION, never a pass. This
// repo has been bitten three times by a probe that could not tell "I looked and found nothing"
// from "I could not look" (ADR-1011 is the write-up), so the exit code says which:
//
//   0   the doc's claims all hold.
//   1   DRIFT — the doc names something the tree does not have (or vice versa, for ABSENT).
//   79  NOT ESTABLISHED — a floor fired. The doc, vercel.json or app/ could not be read well
//       enough for the silence to mean anything. Never reported as health.
//
// Usage: `node scripts/check-arch-doc.mjs` (or `pnpm check:arch-doc`).
// Enforced by scripts/check-arch-doc.test.ts (declared in guard-wiring.test.ts's VITEST_ENFORCED),
// so it runs in the `test` job that branch protection already requires.

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

export const DOC = join('docs', 'ARCHITECTURE.md')
export const VERCEL = 'vercel.json'

/** Top-level directories a backticked token must start with to be read as a repo path. Anything
 *  else in backticks is prose, an identifier, a class name or a shell command — not a claim. */
const ROOTS = [
  'app/', 'lib/', 'components/', 'scripts/', 'supabase/', 'public/',
  'docs/', 'content/', 'test/', '.github/', 'design_handoff/',
]
/** Root-level files that are path claims despite having no directory prefix. */
const ROOT_FILES = new Set([
  'vercel.json', 'package.json', 'tsconfig.json', 'proxy.ts', 'next.config.ts',
  'eslint.config.mjs', 'vitest.config.ts', 'playwright.config.ts',
])

/** Claims the doc makes in the NEGATIVE: it names these to say they are gone or must never exist.
 *  The guard asserts their ABSENCE, so the warning cannot rot into a stale instruction.
 *  @type {Record<string, string>} — widened deliberately, so a test can pass `{}` to prove the
 *  POSITIVE pass would have caught these back when the doc claimed they were live. */
export const ABSENT = {
  'middleware.ts':
    'Next 16 renamed Middleware to Proxy; the doc tells you not to create this file.',
  'coop-pulse':
    'Rewards Economy v2 cron, deleted by the v3 teardown (ADR-305). The doc names it to say so.',
  'practice-streaks':
    'Rewards Economy v2 cron, deleted by the v3 teardown (ADR-305). The doc names it to say so.',
}

/** Inline `code` spans, outside fenced blocks. Fences hold shell commands and ASCII trees, which
 *  are illustration rather than claim — the claims live in backticked prose and table cells. */
export function codeSpans(text) {
  const spans = []
  let fenced = false
  for (const line of text.split('\n')) {
    if (/^\s*```/.test(line)) { fenced = !fenced; continue }
    if (fenced) continue
    for (const m of line.matchAll(/`([^`\n]+)`/g)) spans.push(m[1])
  }
  return spans
}

/** The `## Cron` section only: heading to the next `## ` heading. */
export function cronSection(text) {
  const lines = text.split('\n')
  const start = lines.findIndex((l) => /^##\s+Cron\s*$/.test(l))
  if (start === -1) return ''
  const rest = lines.slice(start + 1)
  const end = rest.findIndex((l) => /^##\s+\S/.test(l))
  return (end === -1 ? rest : rest.slice(0, end)).join('\n')
}

/** `lib/supabase/{server,admin}.ts` -> two paths. No braces -> the input, unchanged. */
export function expandBraces(token) {
  const m = /^(.*)\{([^{}]+)\}(.*)$/.exec(token)
  if (!m) return [token]
  return m[2].split(',').flatMap((alt) => expandBraces(`${m[1]}${alt.trim()}${m[3]}`))
}

/** Strip sentence punctuation that got inside the backticks, WITHOUT eating a route group's own
 *  closing paren. `app/(main)` must survive; `lib/auth.ts,` must not keep its comma. Drop a
 *  trailing `)` only when it is unbalanced — that one cost a false failure on all four groups. */
export function trimTrailing(t) {
  let s = t
  for (;;) {
    const last = s.at(-1)
    if (last === '.' || last === ',' || last === ';') { s = s.slice(0, -1); continue }
    if (last === ')' && (s.match(/\)/g) ?? []).length > (s.match(/\(/g) ?? []).length) {
      s = s.slice(0, -1); continue
    }
    return s
  }
}

const isPathish = (t) => ROOTS.some((r) => t.startsWith(r)) || ROOT_FILES.has(t)
const CLEAN = /^[\w./@()[\]{},-]+$/            // no spaces, no `:`, no `<`, no `=`
const ROUTE = /^\/[a-z0-9][a-z0-9/_.-]*$/       // a URL path, lowercase
const SLUG = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/    // a cron job name

/** The "**N jobs as of <date>**" sentence in the Cron section. `null` when the doc does not make
 *  the claim at all, which is itself a failure: an uncounted list cannot be checked. */
export function claimedCronCount(text) {
  const m = /\*\*(\d+)\s+jobs? as of/.exec(cronSection(text))
  return m ? Number(m[1]) : null
}

export function extractClaims(text, absent = ABSENT) {
  const cronText = cronSection(text)
  const cronSpans = new Set(codeSpans(cronText))

  const paths = new Set()
  const routes = new Set()
  const crons = new Set()

  for (const raw of codeSpans(text)) {
    const t = trimTrailing(raw.trim())
    if (!CLEAN.test(t)) continue
    if (isPathish(t)) { for (const p of expandBraces(t)) paths.add(p); continue }
    if (ROOT_FILES.has(t)) { paths.add(t); continue }
    if (ROUTE.test(t)) { routes.add(t); continue }
    if (SLUG.test(t) && cronSpans.has(raw)) crons.add(t)
  }
  // A negative claim is checked by the ABSENT pass, not by the positive one.
  for (const k of Object.keys(absent)) { paths.delete(k); crons.delete(k); routes.delete(k) }
  return { paths: [...paths].sort(), routes: [...routes].sort(), crons: [...crons].sort() }
}

/** Does `urlPath` resolve to a handler under app/?
 *
 *  `(groups)` and `@slots` are transparent (descend without consuming a segment), exactly as the
 *  router treats them. A `[dynamic]` dir is matched ONLY when the claim's own segment is written
 *  in brackets — see the header: matching every segment against every catch-all makes the check
 *  unable to fail. Pass `{ dynamic: true }` to get the permissive router-shaped behaviour. */
export function routeExists(urlPath, io, { dynamic = false } = {}) {
  const segs = urlPath.split('/').filter(Boolean)
  const ENDPOINTS = ['route.ts', 'route.tsx', 'route.js', 'page.tsx', 'page.ts', 'page.jsx']
  const walk = (dir, i, depth) => {
    if (depth > 12) return false
    if (i === segs.length) return ENDPOINTS.some((f) => io.exists(join(dir, f)))
    const kids = io.dirs(dir)
    if (kids.includes(segs[i]) && walk(join(dir, segs[i]), i + 1, depth + 1)) return true
    const claimIsDynamic = /^\[.+\]$/.test(segs[i])
    for (const k of kids) {
      if (/^\(.+\)$/.test(k) || k.startsWith('@')) {
        if (walk(join(dir, k), i, depth + 1)) return true
      } else if (/^\[.+\]$/.test(k) && (dynamic || claimIsDynamic)) {
        if (walk(join(dir, k), i + 1, depth + 1)) return true
      }
    }
    return false
  }
  return walk('app', 0, 0)
}

const realIo = {
  // A file that cannot be READ must reach the floors as an empty string, never as a stack trace:
  // a crash exits 1, which is the DRIFT code, and would report "the doc is wrong" when the truth
  // is "the doc could not be opened". Those are different answers and the exit code has to say so.
  read: (f) => { try { return readFileSync(f, 'utf8') } catch { return '' } },
  exists: (p) => existsSync(p),
  dirs: (p) => {
    try {
      return readdirSync(p, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name)
    } catch { return [] }
  },
}

/** `io` is the test seam: `{ read, exists, dirs }` override the reader, the file probe and the
 *  directory listing, so the whole gate can be exercised against a virtual tree. `io.absent`
 *  overrides the negative-claim set — emptying it is how a test proves the positive pass really
 *  would have caught a cron the doc names as live (which is how `coop-pulse` reached this doc). */
export function runCheck(io = {}) {
  const { absent = ABSENT, ...rest } = io
  const r = { ...realIo, ...rest }
  const text = r.read(DOC)

  let scheduled = []
  try {
    scheduled = (JSON.parse(r.read(VERCEL)).crons ?? []).map((c) =>
      String(c.path).replace(/^\/api\/cron\//, ''),
    )
  } catch { scheduled = [] }

  const { paths, routes, crons } = extractClaims(text, absent)
  const claimedCount = claimedCronCount(text)
  const drift = []

  if (claimedCount === null) {
    drift.push({
      kind: 'count',
      claim: '(none)',
      why: 'the Cron section states no "**N jobs as of <date>**" count, so nothing can check it',
    })
  } else if (claimedCount !== scheduled.length) {
    drift.push({
      kind: 'count',
      claim: `${claimedCount} jobs`,
      why: `vercel.json schedules ${scheduled.length}. Update the count and the date.`,
    })
  }

  for (const p of paths) {
    if (!r.exists(p)) drift.push({ kind: 'path', claim: p, why: 'no such file or directory' })
  }
  for (const u of routes) {
    if (!routeExists(u, r)) {
      drift.push({
        kind: 'route',
        claim: u,
        why: 'no LITERAL handler under app/ (a catch-all matching it does not count — see the header)',
      })
    }
  }
  for (const c of crons) {
    if (!scheduled.includes(c)) {
      drift.push({ kind: 'cron', claim: c, why: 'not scheduled in vercel.json' })
    } else if (!r.exists(join('app', 'api', 'cron', c, 'route.ts'))) {
      drift.push({ kind: 'cron', claim: c, why: 'scheduled, but app/api/cron/<name>/route.ts is missing' })
    }
  }
  for (const [claim, reason] of Object.entries(absent)) {
    const here =
      r.exists(claim) || r.exists(join('app', 'api', 'cron', claim)) || scheduled.includes(claim)
    if (here) {
      drift.push({
        kind: 'absent',
        claim,
        why: `the doc says this does NOT exist, but it does. ${reason} Rewrite the doc, then drop it from ABSENT.`,
      })
    }
  }

  return {
    docBytes: text.length, scheduled: scheduled.length, absent: Object.keys(absent).length,
    claimedCount, paths, routes, crons, drift,
  }
}

/* ── The floors ─────────────────────────────────────────────────────────────────────────────────
 *
 * Four ways this gate can scan nothing and report health, so four floors. Measured on 2026-08-17
 * against the corrected doc; each floor sits comfortably below the real number so ordinary editing
 * never trips one. Re-measure with `node scripts/check-arch-doc.mjs`, which prints all four live.
 * Lower a floor only alongside a deliberate deletion, and name the deletion. Never to go green. */
export const MIN_DOC_BYTES = 4000  // measured 20,201 — a truncated or unreadable doc
export const MIN_PATHS = 30        // measured 87 — the backtick scanner stopped matching
export const MIN_CRONS = 12        // measured 27 — the `## Cron` heading moved or got renamed
export const MIN_SCHEDULED = 15    // measured 27 — vercel.json unreadable, so every cron "passes"

export function floorViolation({ docBytes, paths, crons, scheduled }) {
  const cannotTell = (what) =>
    `✗ check:arch-doc NOT ESTABLISHED — ${what} Its silence about drift means nothing.`
  if (docBytes < MIN_DOC_BYTES) {
    return cannotTell(`read only ${docBytes} bytes of ${DOC}, expected at least ${MIN_DOC_BYTES}.`)
  }
  if (scheduled < MIN_SCHEDULED) {
    return cannotTell(
      `parsed only ${scheduled} cron(s) from ${VERCEL}, expected at least ${MIN_SCHEDULED}, ` +
        'so every cron name in the doc would have been checked against an empty schedule.',
    )
  }
  if (paths.length < MIN_PATHS) {
    return cannotTell(
      `extracted only ${paths.length} path claim(s), expected at least ${MIN_PATHS}. ` +
        'The backtick scanner matched nothing.',
    )
  }
  if (crons.length < MIN_CRONS) {
    return cannotTell(
      `extracted only ${crons.length} cron claim(s), expected at least ${MIN_CRONS}. ` +
        'The `## Cron` section was not found or no longer names its jobs in backticks.',
    )
  }
  return null
}

function main() {
  const r = runCheck()

  const floor = floorViolation(r)
  if (floor) {
    console.error(`\n${floor}\n`)
    process.exit(79)
  }

  if (r.drift.length === 0) {
    console.log(
      `✓ ${DOC}: ${r.paths.length} path, ${r.routes.length} route and ${r.crons.length} cron ` +
        `claim(s) all hold against the tree (${r.scheduled} crons scheduled; ` +
        `${r.absent} negative claim(s) still absent).`,
    )
    return
  }

  console.error(`\n✗ ${DOC} describes a tree that is not there:\n`)
  for (const d of r.drift) console.error(`  • [${d.kind}] ${d.claim} — ${d.why}`)
  console.error(
    '\nThe code wins: delete the claim, or correct it to what the tree actually does. If a\n' +
      'subsystem was REPLACED rather than removed, describe the replacement and link the doc\n' +
      'that owns it — do not just trim the sentence.\n',
  )
  process.exit(1)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main()
