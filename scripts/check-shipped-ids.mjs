#!/usr/bin/env node
// Shipped-id gate (HYG-124, ADR-1538).
//
// docs/BUILD-BACKLOG.json is the only record of what is done (ADR-1043). Every guard that proves
// that claim iterates THE ROWS: `check:backlog` runs each row's probe against the tree, in both
// directions, and `check:id-collisions` fails a row id two open PRs claim at once. Neither can see
// an id that was never added. On 2026-09-28 a scan read every id out of every merged commit
// subject on `main` and asked the one list about each: TWO had shipped with no row at all —
// `HYG-125` (#2911, 51 scripts could silently skip their own main()) and `LIVE-475` (#2878, the
// visual suite stops photographing a page it never proved had settled). Both changes were in the
// tree, both ids were cited by name from live probes and source comments, and every gate was
// green, because an id that is not a row is nothing to iterate.
//
// This gate counts from the other end. It reads the SUBJECT of every commit merged to the base
// branch since the one list was seeded, pulls out every token shaped like a row id, and fails
// when one of them is not a row in the checkout's docs/BUILD-BACKLOG.json. The fix for a failure
// is the row: `done`, with the consequence probe the shipped change already satisfies.
//
// ── WHAT COUNTS AS AN ID, and why the window starts where it does ─────────────────────────────
// A token is an id when its PREFIX is one some row already uses (`LIVE`, `HYG`, `SCAN`, `OWN`,
// `PROG`, `DEF`, ... read from the JSON itself, never a second list here) followed by `-` and an
// upper-case alphanumeric suffix. Subjects BEFORE the seed commit (ADR-1043, #2142, 2026-08-17)
// name ids from the five retired planning systems the one list absorbed — BUG-4, SEC-9, PERF-3,
// ADMIN-04 — and those were never rows and never will be, so the window opens at the seed rather
// than carrying forty-odd permanent exemptions. Subjects only: bodies discuss ids in prose.
//
// ── EXCEPTIONS ARE STATED, ONE REASON EACH, AND THEY ROT LOUDLY ───────────────────────────────
// An id in a merged subject that deliberately has no row goes in EXCEPTIONS with the reason. An
// entry whose id later GAINS a row fails the gate, so the list cannot outlive its reason.
//
// ── HOW IT READS HISTORY, and how it degrades ─────────────────────────────────────────────────
// SOURCE-only: `git log` plus the JSON, no network. On a pull_request run the ref is
// `origin/<GITHUB_BASE_REF>` (merged commits, not this PR's own); otherwise HEAD. The rows that
// answer for those commits are the rows AT THAT REF (`git show <ref>:docs/BUILD-BACKLOG.json`)
// united with the checkout's own: a merged subject is the base's claim, so the base's list must
// carry the row, and a pull request that is a few commits behind main is not blamed for a row
// main added after it branched (measured 2026-09-28: #2957 merged six rows while three stacked
// PRs were in flight, and a gate reading only each PR's tree named two of them as missing). The
// checkout's rows are added so a PR that ADDS the row for an already-shipped id passes on its own
// tree. Locally with HEAD the two sets are the same file. The runner's
// checkout is depth-1, so `.github/workflows/ci.yml` deepens the base branch with
// `--filter=tree:0 --shallow-since=<the seed>` (commit objects only: 725 commits in ~1s). When the
// seed commit is reachable the window is exact (`<seed>..<ref>`). When it is not, the gate reads
// what `--since` can reach and says PARTIAL; on GitHub Actions that is exit 1, because the fetch
// step that arms this gate is missing and a gate that could not look must not say clean. Locally
// a partial read is a loud note, not a failure — the same contract as check:id-collisions.
//
// Usage: `node scripts/check-shipped-ids.mjs` (or `pnpm check:shipped-ids`).
//   --ref <ref>       history to read (default: origin/$GITHUB_BASE_REF on a PR run, else HEAD)
//   --backlog <path>  the one list to check against (default: docs/BUILD-BACKLOG.json)
//   --seed <sha>      the commit the window opens after (default: SEED_COMMIT)
//   --since <date>    the fallback lower bound when the seed is unreachable (default: SEED_DATE)
// Exits 1 on an id with no row, a stale exception, or a read this gate could not complete in CI.

import { execFileSync } from 'node:child_process'
import { invokedDirectly } from './lib/invoked-directly.mjs'
import { ROWS_DIR, fragmentIdsFromPaths, readBacklogView } from './lib/ledger.mjs'

export const BACKLOG = 'docs/BUILD-BACKLOG.json'

/** "There is one list now, and a machine keeps its status honest (ADR-1043) (#2142)". The first
 *  commit whose subject can be held to the one list, because it is the commit that created it. */
export const SEED_COMMIT = 'e74af47e58b0329ea187097702a3b77a2d42a055'
/** The seed's committer date, for the `--since` fallback and the workflow's `--shallow-since`. */
export const SEED_DATE = '2026-08-17'

/** Floors under which the gate refuses to call a window clean: a read that reached this few
 *  commits or this few ids did not look at the base branch, whatever it was pointed at. */
export const MIN_COMMITS = 20
export const MIN_IDS = 10

/** Ids in merged subjects that have no row ON PURPOSE. One reason each; the gate fails the day an
 *  entry's id gains a row, so nothing here can outlive what it says. Shrink this; never grow it
 *  without the reason.
 *  @type {Record<string, string>} */
export const EXCEPTIONS = {
  'LIVE-044':
    'Retracted, not shipped. #2154 (de76c12a2, 2026-08-18) is titled "Retract LIVE-044: the 45-file ' +
    'label claim was false"; the row was withdrawn the day it was minted and LIVE-046 carries what ' +
    'survived, quoting the retraction in its own detail. A retracted id has no row by design.',
  'LIVE-113':
    'A phantom. #2269 (8e13b75dc, 2026-08-25) names LIVE-113 beside PROG-P6 and ADR-1122, but no row ' +
    'ever existed under it: HYG-047 found the id sequenced in meta.slate.waves with no entry behind ' +
    'it and removed it on 2026-09-03. The work that commit shipped is PROG-P6.',
}

// ── PURE ──────────────────────────────────────────────────────────────────────────────────────

/** Every row id in a BUILD-BACKLOG.json text. Throws on a file that does not parse: a broken
 *  list is not a list with no rows, and check:backlog will say the rest. */
export function rowIds(text) {
  const doc = JSON.parse(text)
  const entries = Array.isArray(doc?.entries) ? doc.entries : []
  return new Set(entries.map((e) => e?.id).filter((id) => typeof id === 'string'))
}

/** The prefixes the rows themselves use: `LIVE-532` contributes `LIVE`. A token whose prefix no
 *  row uses (BUILD-SEQUENCE, SHA-256, ADR-1043) is not an id here. */
export function rowPrefixes(ids) {
  const out = new Set()
  for (const id of ids) {
    const m = /^([A-Z]+)-/.exec(id)
    if (m) out.add(m[1])
  }
  return out
}

/** A regex matching every id-shaped token for the given prefixes, whole-word. */
export function idPattern(prefixes) {
  const alt = [...prefixes].sort().join('|')
  return new RegExp(`\\b(?:${alt})-[A-Z0-9]+\\b`, 'g')
}

/** The ids one subject names, in order, deduplicated. */
export function idsInSubject(subject, pattern) {
  const out = []
  for (const m of subject.matchAll(pattern)) if (!out.includes(m[0])) out.push(m[0])
  return out
}

/** Parse `git log --format=%H%x1f%cs%x1f%s` output into { sha, date, subject } records. */
export function parseLog(text) {
  return text
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => {
      const [sha, date, ...rest] = line.split('\x1f')
      return { sha, date, subject: rest.join('\x1f') }
    })
}

/** THE COMPARISON. `commits` is the window; `rows` the id set of the checkout's one list;
 *  `exceptions` the stated map. Returns every id that is neither a row nor excepted, with the
 *  first commit that named it, plus every exception that has rotted (its id is a row now), plus
 *  the counts a caller needs to refuse a vacuous window. Pure, so it is mutation-tested.
 *  @param {{ commits: { sha: string, date: string, subject: string }[], rows: Set<string>, exceptions?: Record<string, string> }} input */
export function findUnlisted({ commits, rows, exceptions = EXCEPTIONS }) {
  const pattern = idPattern(rowPrefixes(rows))
  const seen = new Map() // id -> first commit naming it (log order is newest first, so keep the oldest)
  for (const c of commits) {
    for (const id of idsInSubject(c.subject, pattern)) seen.set(id, c)
  }
  const missing = []
  for (const [id, c] of seen) {
    if (rows.has(id) || Object.hasOwn(exceptions, id)) continue
    missing.push({ id, sha: c.sha, date: c.date, subject: c.subject })
  }
  missing.sort((a, b) => a.id.localeCompare(b.id))
  const staleExceptions = Object.keys(exceptions).filter((id) => rows.has(id)).sort()
  return { missing, staleExceptions, commitCount: commits.length, idCount: seen.size }
}

// ── GIT ───────────────────────────────────────────────────────────────────────────────────────

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] })
}

function hasCommit(sha, cwd) {
  try {
    git(['cat-file', '-e', `${sha}^{commit}`], cwd)
    return true
  } catch {
    return false
  }
}

function hasRef(ref, cwd) {
  try {
    git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], cwd)
    return true
  } catch {
    return false
  }
}

/** The subjects to check: exact (`seed..ref`) when the seed commit is on hand, else everything
 *  `--since` can reach with `partial: true`. */
export function readCommits({ ref, seed = SEED_COMMIT, since = SEED_DATE, cwd = process.cwd() }) {
  const format = '--format=%H%x1f%cs%x1f%s'
  if (hasCommit(seed, cwd)) {
    return { commits: parseLog(git(['log', format, `${seed}..${ref}`], cwd)), partial: false }
  }
  return { commits: parseLog(git(['log', format, `--since=${since}`, ref], cwd)), partial: true }
}

/** Which ref to read. A pull_request run reads the BASE branch (what merged), never the PR's own
 *  commits; anything else reads HEAD, which on a push to main IS the base.
 *  @param {Record<string, string | undefined>} env */
export function chooseRef(env = process.env, cwd = process.cwd()) {
  const base = env.GITHUB_BASE_REF
  if (base) {
    const ref = `origin/${base}`
    if (hasRef(ref, cwd)) return { ref, why: `origin/${base}, the base branch of this pull request` }
    return { ref: null, why: `origin/${base} is not fetched on this runner` }
  }
  return { ref: 'HEAD', why: 'HEAD (no GITHUB_BASE_REF, so this checkout is the branch being judged)' }
}

/** The row ids in the one list AS COMMITTED at `ref` (`git show <ref>:<path>`), the rows that
 *  answer for the commits merged there. Throws when the file is not at that ref. */
export function rowsAtRef({ ref, backlogPath = BACKLOG, cwd = process.cwd() }) {
  const rows = rowIds(git(['show', `${ref}:${backlogPath}`], cwd))
  // Plus the rows that ref carries as ledger fragments (HYG-145, ADR-1635): a fragment's id is its
  // file name, so the tree listing is enough.
  let listed = ''
  try {
    listed = git(['ls-tree', '-r', '--name-only', ref, '--', ROWS_DIR], cwd)
  } catch {
    listed = ''
  }
  for (const id of fragmentIdsFromPaths(listed.split('\n').filter(Boolean)).rows) rows.add(id)
  return rows
}

// ── CLI ───────────────────────────────────────────────────────────────────────────────────────

const red = (s) => `\x1b[31m${s}\x1b[0m`
const green = (s) => `\x1b[32m${s}\x1b[0m`
const dim = (s) => `\x1b[2m${s}\x1b[0m`

function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === '--ref' || a === '--backlog' || a === '--seed' || a === '--since') out[a.slice(2)] = argv[++i]
  }
  return out
}

/** Exit 0 or 1. Exported so the test can drive the whole CLI against a fixture repository.
 *  @param {string[]} argv
 *  @param {Record<string, string | undefined>} env */
export function main(argv = process.argv.slice(2), env = process.env, cwd = process.cwd()) {
  const args = parseArgs(argv)
  const inCi = env.GITHUB_ACTIONS === 'true'
  const backlogPath = args.backlog ?? BACKLOG

  let rows
  try {
    // The merged view: the base file plus docs/ledger/rows fragments (HYG-145, ADR-1635).
    const view = readBacklogView({ root: cwd, backlog: backlogPath })
    rows = new Set((view.doc.entries ?? []).map((e) => e?.id).filter((id) => typeof id === 'string'))
  } catch (err) {
    console.error(red(`✗ check:shipped-ids — could not read ${backlogPath}: ${err.message}`))
    return 1
  }

  let ref = args.ref
  let why = `--ref ${args.ref}`
  if (!ref) {
    const chosen = chooseRef(env, cwd)
    ref = chosen.ref
    why = chosen.why
  }
  if (!ref) {
    console.error(red(`✗ check:shipped-ids — no history to read: ${why}. The workflow step that fetches the base branch is missing.`))
    return 1
  }

  let read
  try {
    read = readCommits({ ref, seed: args.seed, since: args.since, cwd })
  } catch (err) {
    console.error(red(`✗ check:shipped-ids — git could not read ${ref}: ${String(err.stderr ?? err.message).trim()}`))
    return 1
  }

  // The rows at the ref whose commits are being read, united with the checkout's. See the header.
  let atRef = 0
  if (ref !== 'HEAD') {
    let refRows
    try {
      refRows = rowsAtRef({ ref, backlogPath, cwd })
    } catch (err) {
      console.error(red(`✗ check:shipped-ids — could not read ${backlogPath} at ${ref}: ${String(err.stderr ?? err.message).trim()}. The rows that answer for ${ref}'s commits live there.`))
      return 1
    }
    for (const id of refRows) if (!rows.has(id)) { rows.add(id); atRef += 1 }
  }

  const { missing, staleExceptions, commitCount, idCount } = findUnlisted({ commits: read.commits, rows })
  const window = read.partial
    ? `${commitCount} commit(s) reachable from ${ref} since ${args.since ?? SEED_DATE} (PARTIAL: the seed commit ${(args.seed ?? SEED_COMMIT).slice(0, 9)} is not in this clone, so the window may be short)`
    : `${commitCount} commit(s) on ${ref} since the one list was seeded (${(args.seed ?? SEED_COMMIT).slice(0, 9)})`
  console.log(`check:shipped-ids — reading ${why}: ${window}; ${idCount} distinct id(s) named in subjects, ${rows.size} rows${atRef ? ` (${atRef} of them only at ${ref}, added after this checkout branched)` : ''}.`)

  const problems = []
  if (read.partial && inCi) {
    problems.push(
      'the seed commit is not reachable on this runner, so the window is PARTIAL. On GitHub Actions that\n' +
        '   means the "Fetch base history for check:shipped-ids" step in .github/workflows/ci.yml did not\n' +
        '   run or did not reach the seed; a gate that could not look must not say clean.',
    )
  }
  if (commitCount < MIN_COMMITS || idCount < MIN_IDS) {
    problems.push(
      `only ${commitCount} commit(s) and ${idCount} id(s) were read, under the floors of ${MIN_COMMITS} and ${MIN_IDS}.\n` +
        '   A window this small did not look at the base branch, whatever it was pointed at (ADR-962: a\n' +
        '   ✓ over nothing is the one thing a gate must never print).',
    )
  }
  for (const s of staleExceptions) {
    problems.push(`EXCEPTIONS still names ${s}, and ${s} is a row now. Remove the entry: an exemption that\n   outlives its reason is how the one list drifted five times before.`)
  }
  if (missing.length) {
    problems.push(
      `${missing.length} id(s) shipped in a merged commit subject and sit on NO row of ${backlogPath}:\n` +
        missing.map((m) => `   · ${m.id}  ${m.sha.slice(0, 9)}  ${m.date}  ${m.subject}`).join('\n') +
        '\n   check:backlog cannot see this, because it iterates the ROWS and an id that was never added is\n' +
        '   not a row. Add the row as `done` with the consequence probe the shipped change already\n' +
        '   satisfies, or, if the id is deliberately not a row, add it to EXCEPTIONS with the reason.',
    )
  }

  if (problems.length) {
    console.error(red(`\n✗ check:shipped-ids — ${problems.length} problem(s):\n`))
    for (const p of problems) console.error(`${red('•')} ${p}\n`)
    return 1
  }
  const note = read.partial ? dim(' (partial window: not proved for commits older than this clone reaches)') : ''
  console.log(green(`✓ check:shipped-ids — every id a merged subject names is a row (${Object.keys(EXCEPTIONS).length} stated exception(s)).`) + note)
  return 0
}

if (invokedDirectly(import.meta.url)) process.exit(main())
