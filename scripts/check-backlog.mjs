#!/usr/bin/env node
// BACKLOG CONTRACT — the one list, and a machine that keeps its status honest.
//
// WHY THIS EXISTS. This repo has consolidated its work into "the one master list" FIVE times
// (MASTER-TODO, BUILD-LIST, MASTER-PLAN, BUILD-CATALOG, BUILD-SEQUENCE — each says so in its own
// header). Every one drifted and spawned a successor. The 2026-08-17 census found the reason, and
// it is not sloppiness: **a markdown checkbox has no relationship to the code, so nothing can ever
// verify it.** That census found 22 items that were DONE and still ticked open, three plan docs
// asking for work that had already shipped, and one row ("Programs is already built") that was
// stale in the direction that costs a session — it named a feature whose directory, route and
// tables had all been dropped.
//
// So this is not a sixth list. It is the `adoption-baselines.json` pattern applied to tasks: the
// repo's own canon already says "the machine-readable state beats prose", and 17 debt classes have
// not drifted once while the prose describing them was wrong in five places.
//
// THE RULE THIS ENFORCES, in both directions:
//
//   status: open  + probe says DONE      -> FAIL. Close the row; it is the 22-stale-items bug.
//   status: done  + probe says NOT DONE  -> FAIL. Something regressed, or the row was never true.
//
// Both arms matter. A gate that only catches un-closed work still lets a "done" row rot.
//
// ── WHAT A PROBE MAY AND MAY NOT BE ───────────────────────────────────────────────────────────
// A probe must measure the TREE, not a restatement of the row. `grep-present` for the very string
// the row's title contains is the shape-not-truth failure this repo names in four separate ADRs —
// it would pass by existing. Probe for the CONSEQUENCE: the import that must be gone, the export
// that must exist, the command that must exit 0.
//
// ── MANUAL ROWS ARE FIRST-CLASS, AND NEVER FAIL THE BUILD ─────────────────────────────────────
// "Upgrade Healthchecks.io" and "recruit five test users" cannot be probed from a repo, and
// ADR-970 is explicit that a gate which cannot fire honestly is worse than no gate: people route
// around it and then it reads as coverage. So a `manual` row carries `evidence` + `checked`, and
// the WORST this script does is print it as stale past MANUAL_STALE_DAYS. Never an exit 1.
//
// ── WHICH PROBES RUN, AND WHY THAT IS NOT THE SAME QUESTION AS WHICH ROWS ARE CHECKED ────────
//
// STRUCTURE IS ALWAYS CHECKED OVER EVERY ROW. Shape, priority, ownerAction, slate/wave coverage,
// id uniqueness, row-source paths, probe parseability — all of it, in both modes. Only the EXECUTION
// of `verify` probes is scoped, and the scope is printed on every run.
//
// The default is `--probes=open`. Measured 2026-09-28: 812 probes ran per invocation and 556 of
// them belonged to rows closed weeks ago, which is 20.2s wall / 66s CPU on a gate that bounds the
// whole `checks` job while every other guard in that array finishes in under ~8s.
//
// A row that regressed after being closed is a REAL finding — the `done + NOT DONE` arm above is
// half of why this file exists and it is not being retired. But that finding has no author on
// today's pull request: nobody on the PR can act on it, and a blocking gate nobody can act on is
// the advisory-forced-through-a-blocking-gate failure ADR-970 names. So it moves to the cadence
// that fits it: `--probes=all` runs weekly in .github/workflows/maintenance.yml, beside the
// design-debt ratchet, which is there for exactly this reason (HYG-070, ADR-1290).
//
// `open` scope = every open / blocked row, PLUS every `done` row closed within
// RECENTLY_CLOSED_DAYS. The recency window is what keeps the per-PR gate honest about the work a
// PR is actually near: a row closed this sprint is one someone in this stack of branches touched,
// and its regression IS theirs. LIVE-034's probe stays exactly as written — it measures the cause
// (no probe spawns a test runner) and is untouched by this; row-count growth was the other route
// to the same consequence, and this is what answers that one.
//
// `--only-static` runs only the in-process search kinds (grep-present / grep-absent) and skips
// every `cmd` probe. It exists for scripts/backlog-contract.test.ts, which runs this guard TWICE
// to prove a property of the SEARCH ENGINE — a claim no `cmd` probe participates in, and which
// was costing ~40s of doubled process spawning to assert.
//
// Usage:
//   node scripts/check-backlog.mjs                # probe open work + recently closed rows (default)
//   node scripts/check-backlog.mjs --probes=all   # the full sweep: every non-parked row's probe
//   node scripts/check-backlog.mjs --only-static  # search-kind probes only; no subprocess at all
//   node scripts/check-backlog.mjs --report  # print the working view (open + owner rows), exit 0
//   node scripts/check-backlog.mjs --lane owner   # filter the report to one lane

import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs'
import { spawn, spawnSync } from 'node:child_process'
import { availableParallelism } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { waveToken, SLATED_STATUSES } from './maintenance/fold-ledger-docs.mjs'

const FILE = 'docs/BUILD-BACKLOG.json'

/** A manual row's evidence goes stale; it does not go wrong. Warn, never fail. */
const MANUAL_STALE_DAYS = 120

/** The exit code a `cmd` probe uses to say "I could not look" — see runProbe(). The engine detects
 *  a probe killed by a signal on its own, but not one whose OWN child died: that surfaces as the
 *  probe process exiting non-zero, indistinguishable from a real verdict. A probe that spawns
 *  anything must therefore report indeterminacy itself, and this is the code it uses. 79 is outside
 *  every range a tool here returns meaningfully (0/1 verdicts, 2 for usage, 127 for not-found). */
const PROBE_INDETERMINATE = 79

const LANES = ['owner', 'live', 'program', 'deferred', 'hygiene']

/** What KIND of action an owner-lane row needs, in the order the report prints them:
 *  the things that unblock code first, the judgement calls next, and the rows that are
 *  merely WAITING last — those are not asks and re-raising them as questions is noise. */
const OWNER_ACTIONS = [
  ['account', 'ACCOUNT — a console action on a third-party account'],
  ['config', 'CONFIG — a value to set'],
  ['content', 'CONTENT — URLs or an export only you have'],
  ['ruling', 'RULING — a product decision only you can make'],
  ['waiting', 'WAITING — blocked on an outside party, not an ask'],
]
const OWNER_ACTION_KEYS = OWNER_ACTIONS.map(([k]) => k)

/** How URGENT a row is, independent of WHERE it sits in the build order (meta.slate.waves).
 *  The two axes are deliberately separate: a wave says what is built after what; a priority
 *  says what is costing something TODAY. Sequenced programme phases are P2 by construction;
 *  P0 is reserved for a production incident, a money/consent/permission answer that is
 *  currently wrong, or a crawl-facing defect. Required on every open/blocked row for the
 *  same reason `ownerAction` is: a field the guard does not demand is a field that decays
 *  back into "everything in W0 is equally urgent", which is how 46 undifferentiated rows
 *  came to sit under one "active now" heading (audit of 2026-09-06). */
const PRIORITIES = [
  ['P0', 'P0 — costing something today: incident, wrong money/consent answer, crawl-facing'],
  ['P1', 'P1 — ready repairs, instruments that keep a gate honest, rulings blocking shipped mechanism'],
  ['P2', 'P2 — the scheduled build-out in wave order'],
  ['P3', 'P3 — parked by name, the runway-closing waves, housekeeping with no member consequence'],
]
const PRIORITY_KEYS = PRIORITIES.map(([k]) => k)
const STATUSES = ['open', 'done', 'parked', 'blocked']
const SIZES = ['XS', 'S', 'M', 'L', 'XL', '—']
const PROBE_KINDS = ['grep-absent', 'grep-present', 'cmd', 'manual']

/** A repo backlog that drops to a handful of rows means the file was truncated or the scan is
 *  broken, and a ✓ over nothing is the one thing a gate must never print (ADR-962). */
const MIN_ENTRIES = 40

/** How recently a `done` row must have been closed to keep being probed on every run. A row closed
 *  inside this window is work the current stack of branches was near, so its regression still has
 *  an author; past it, the finding belongs to the weekly sweep. Rows with no `closed` date are
 *  outside the window by construction — `daysSince` returns Infinity for a date it cannot parse. */
const RECENTLY_CLOSED_DAYS = 30

const PROBE_SCOPES = ['open', 'all']

const args = process.argv.slice(2)
const REPORT = args.includes('--report')
const LANE = args.includes('--lane') ? args[args.indexOf('--lane') + 1] : null

/** `--flag value` and `--flag=value` both, because the first is what this file's own `--lane`
 *  already accepts and the second is what survives `pnpm check:backlog --probes=all` unambiguously. */
function flagValue(name, fallback) {
  const joined = args.find((a) => a.startsWith(`${name}=`))
  if (joined) return joined.slice(name.length + 1)
  const i = args.indexOf(name)
  if (i >= 0 && args[i + 1] && !args[i + 1].startsWith('-')) return args[i + 1]
  return fallback
}

const PROBE_SCOPE = flagValue('--probes', 'open')
const ONLY_STATIC = args.includes('--only-static')
if (!PROBE_SCOPES.includes(PROBE_SCOPE)) {
  console.error(`✗ --probes must be one of ${PROBE_SCOPES.join('|')} (got "${PROBE_SCOPE}")`)
  process.exit(2)
}

const red = (s) => `\x1b[31m${s}\x1b[0m`
const green = (s) => `\x1b[32m${s}\x1b[0m`
const yellow = (s) => `\x1b[33m${s}\x1b[0m`
const dim = (s) => `\x1b[2m${s}\x1b[0m`

function load() {
  if (!existsSync(FILE)) {
    console.error(red(`✗ ${FILE} is missing. It is the one list; nothing else may replace it.`))
    process.exit(1)
  }
  let doc
  try {
    doc = JSON.parse(readFileSync(FILE, 'utf8'))
  } catch (err) {
    console.error(red(`✗ ${FILE} is not valid JSON: ${err.message}`))
    process.exit(1)
  }
  if (!Array.isArray(doc.entries)) {
    console.error(red(`✗ ${FILE} has no "entries" array.`))
    process.exit(1)
  }
  return doc
}

/** Structural validation. A malformed row is a failure, not a skip — a row the script cannot read
 *  is a row nothing is checking, which is indistinguishable from the drift this file prevents. */
function validate(entries) {
  const problems = []
  const seen = new Set()

  if (entries.length < MIN_ENTRIES) {
    problems.push(`only ${entries.length} entries (floor ${MIN_ENTRIES}) — the file looks truncated`)
  }

  for (const e of entries) {
    const at = e.id ? `${e.id}` : `(row with no id: ${JSON.stringify(e).slice(0, 60)}…)`
    if (!e.id) problems.push(`${at}: missing id`)
    else if (seen.has(e.id)) problems.push(`${at}: duplicate id`)
    else seen.add(e.id)

    if (!e.title) problems.push(`${at}: missing title`)
    if (!STATUSES.includes(e.status)) problems.push(`${at}: status "${e.status}" not one of ${STATUSES.join('|')}`)
    if (!LANES.includes(e.lane)) problems.push(`${at}: lane "${e.lane}" not one of ${LANES.join('|')}`)
    if (e.size && !SIZES.includes(e.size)) problems.push(`${at}: size "${e.size}" not one of ${SIZES.join('|')}`)

    // The OWNER section is grouped by `ownerAction`, so an open owner row without one would
    // fall into "unclassified" and quietly undo the grouping. Enforced rather than trusted:
    // a section that degrades to a flat list the moment someone forgets a field is a
    // convention, not a contract.
    if (e.lane === 'owner' && (e.status === 'open' || e.status === 'blocked')) {
      if (!e.ownerAction) {
        problems.push(
          `${at}: open owner row has no ownerAction. Set one of ${OWNER_ACTION_KEYS.join('|')} — `
            + 'it says what KIND of action this needs, and `pnpm backlog` groups the OWNER section by it.',
        )
      } else if (!OWNER_ACTION_KEYS.includes(e.ownerAction)) {
        problems.push(`${at}: ownerAction "${e.ownerAction}" not one of ${OWNER_ACTION_KEYS.join('|')}`)
      }
    }
    // A non-owner row may ALSO carry ownerAction, meaning "code work that is gated on a ruling";
    // the report lists those beside the owner section so a ruling hiding in the live lane is not
    // invisible to the person who has to make it. The value is validated wherever it appears.
    if (e.lane !== 'owner' && e.ownerAction && !OWNER_ACTION_KEYS.includes(e.ownerAction)) {
      problems.push(`${at}: ownerAction "${e.ownerAction}" not one of ${OWNER_ACTION_KEYS.join('|')}`)
    }

    // Every open/blocked row says how urgent it is. Enforced for the same reason ownerAction is:
    // a working view where "active now" holds 46 rows with no ordering inside it is not a view.
    if (e.status === 'open' || e.status === 'blocked') {
      if (!e.priority) {
        problems.push(
          `${at}: open row has no priority. Set one of ${PRIORITY_KEYS.join('|')} — ` +
            'it says how urgent the row is, separately from where meta.slate sequences it.',
        )
      } else if (!PRIORITY_KEYS.includes(e.priority)) {
        problems.push(`${at}: priority "${e.priority}" not one of ${PRIORITY_KEYS.join('|')}`)
      }
    } else if (e.priority && !PRIORITY_KEYS.includes(e.priority)) {
      problems.push(`${at}: priority "${e.priority}" not one of ${PRIORITY_KEYS.join('|')}`)
    }

    const p = e.verify
    if (!p || typeof p !== 'object') {
      problems.push(`${at}: no verify block. Every row states how it will be proven, even if that is "manual".`)
      continue
    }
    if (!PROBE_KINDS.includes(p.kind)) {
      problems.push(`${at}: verify.kind "${p.kind}" not one of ${PROBE_KINDS.join('|')}`)
      continue
    }
    if (p.kind === 'manual') {
      if (!p.evidence) problems.push(`${at}: manual rows need "evidence" — what was checked, and how`)
      if (!p.checked) problems.push(`${at}: manual rows need "checked" (YYYY-MM-DD)`)
    } else if (p.kind === 'cmd') {
      if (!p.cmd) problems.push(`${at}: verify.kind "cmd" needs "cmd"`)
      // 🔴 A PROBE THAT CANNOT PARSE IS NOT A VERDICT, AND IT LOOKS EXACTLY LIKE A FAILING ONE.
      //
      // Every cmd probe here is a `node -e "…"` string handed to a shell. A double quote INSIDE
      // that body is eaten by the shell, so `['a','b']` written as ["a","b"] reaches node as
      // [a, b] and throws a SyntaxError. SyntaxError exits 1 — indistinguishable from an honest
      // "not done" — so an OPEN row's probe AGREES with it by failing to parse, forever, and the
      // row reads as measured when nothing ever measured it. LIVE-007 lived that way through six
      // enrolments; LIVE-090's probe was caught the same way the day before. The runProbe fence
      // above catches a probe that could not RUN (signal, missing binary, exit 79) and cannot
      // catch this one, because this one runs fine and the PROGRAM is what is broken.
      //
      // The rule is structural rather than a test-run, because running 76 probes to validate 76
      // probes is the re-entrancy LIVE-034 already paid for: outside the two delimiters that wrap
      // the body, a cmd probe carries no double quote. Use single quotes, or String.fromCharCode(39)
      // where a literal single quote is needed inside them.
      // A BACKSLASH-ESCAPED quote survives the shell and is fine; only a BARE one is eaten. So the
      // escaped pairs come out first, and what is left must be exactly the two delimiters.
      //
      // ⚠️ THE HAZARD IS WHICHEVER QUOTE OPENED THE BODY, not always the double quote. This check
      // used to count double quotes unconditionally, and so it FAILED THE VERY STYLE ITS OWN
      // MESSAGE RECOMMENDS: `node -e '…'` wrapped in single quotes may carry as many double quotes
      // inside as it likes — the shell passes a single-quoted word through untouched — and that is
      // the safer form, because it needs no backslashes at all. SCAN-509's probe was written that
      // way, ran clean, mutation-fired on all five arms, and was still rejected here. Derive the
      // delimiter from the `-e ` that opens the body and complain about THAT character only.
      // 🔴 A cmd PROBE MUST RUN UNDER node (HYG-062). Per-probe cost is reported by the probe itself
      // (scripts/backlog-probe-cpu.mjs, preloaded into every node the probe starts), which is what
      // lets the probes run in parallel without going blind on which one is expensive. A plain
      // grep pipeline reports nothing, so the per-probe ceiling could not see it — and the probes
      // most likely to be expensive are exactly the ones that shell out. Refused here rather than
      // tolerated at run time, for the same reason a probe that cannot parse is refused: a cost the
      // guard cannot attribute is a cost nobody watches (ADR-970, with the roles reversed).
      if (p.cmd && !/(?:^|[\s;&|(])node\s/.test(p.cmd)) {
        problems.push(
          `${at}: verify.cmd does not run under node, so its cost cannot be attributed. ` +
            'Write it as a `node -e` body (fs.readFileSync + includes/regex does what grep did).',
        )
      }
      if (p.cmd) {
        // 🔴 ASK THE SHELL, not a quote heuristic (2026-09-07). The rule below counts quotes, and
        // OWN-058 got past it with an unmatched BACKTICK: /bin/sh refused the probe with
        // "Syntax error: EOF in backquote substitution" and exited 2. Exit 127 (command not found)
        // and 79 (the probe said it could not look) are both read as indeterminate further down,
        // but 2 falls through to `status === 0` and becomes a VERDICT of "not done" — an answer
        // nothing computed, which the row would have reported forever. `sh -n` parses without
        // executing, so it catches every syntax error the heuristic enumerates plus the ones
        // nobody thought of. A sweep the day this landed found exactly one offender.
        const parse = spawnSync('sh', ['-n'], { input: p.cmd, encoding: 'utf8' })
        if (parse.status !== 0) {
          problems.push(
            `${at}: verify.cmd cannot be parsed by the shell (${(parse.stderr ?? '').trim().split('\n')[0]}). ` +
              `A probe that cannot RUN does not answer "not done" — it answers nothing, and the guard ` +
              `would read its exit code as a verdict. Fix the syntax; quote the body with single quotes ` +
              `and use String.fromCharCode(39) or \\x60 where a literal quote or backtick is needed.`,
          )
        }
        const opener = /(?:^|\s)-e\s+(['"])/.exec(p.cmd)
        // No `-e '…'`/`-e "…"` at all (a plain shell one-liner) — nothing to say about delimiters.
        if (opener) {
          const q = opener[1]
          const bare = (p.cmd.split('\\' + q).join('').match(new RegExp(q, 'g')) ?? []).length
          if (bare > 2) {
            const alt = q === '"' ? 'single' : 'double'
            problems.push(
              `${at}: verify.cmd opens its node -e body with ${q === '"' ? 'a double' : 'a single'} quote ` +
                `and then carries another one inside it. The shell ends the word there, so the probe throws a ` +
                `SyntaxError, exits 1, and reads as an honest "not done" forever. Wrap the body in ${alt} ` +
                `quotes instead, or use String.fromCharCode(${q === '"' ? 34 : 39}) where the literal is needed.`,
            )
          }
        }
      }
    } else {
      if (!p.pattern) problems.push(`${at}: verify.kind "${p.kind}" needs "pattern"`)
      if (!Array.isArray(p.paths) || p.paths.length === 0) problems.push(`${at}: verify.kind "${p.kind}" needs "paths"`)
    }

    // A source that no longer exists is how a row outlives the document that justified it. It has
    // to be a FILE rather than merely a path that resolves, and the difference is not academic:
    // `test/e2e/__screenshots__/visual.spec.ts` is a DIRECTORY wearing a .ts name (Playwright names
    // a snapshot folder after its spec), so an existsSync check accepted it while the suite's own
    // mirror of this rule -- statSync().isFile() in scripts/backlog-contract.test.ts, whose comment
    // claims "the guard enforces this" -- rejected it. The weaker check is the one a human runs by
    // hand, so the failure arrived in CI instead of locally. HYG-097.
    if (e.source?.file) {
      // No initialiser: both branches below assign, so a default here is a dead store. CodeQL
      // flagged exactly that on this change ("Useless assignment to local variable").
      let what
      try {
        what = statSync(e.source.file).isFile() ? 'file' : 'a directory, not a file'
      } catch {
        what = 'missing'
      }
      if (what !== 'file') {
        problems.push(`${at}: source file "${e.source.file}" is ${what}`)
      }
    }
  }
  return problems
}

const SKIP_DIRS = new Set(['node_modules', '.git', '.next', 'dist', 'coverage'])

/**
 * Every file under a path, following directories.
 *
 * The ONE statSync here is on the caller's own `target` — a path this module names, which may
 * legitimately be a file or a directory. Everything below it takes its type from the dirent that
 * produced the name, so no path is ever resolved twice (ADR-1185).
 */
function filesUnder(target, acc = []) {
  const st = statSync(target)
  if (st.isFile()) {
    acc.push(target)
    return acc
  }
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (SKIP_DIRS.has(entry.name)) continue
      const p = join(dir, entry.name)
      if (entry.isDirectory()) walk(p)
      else acc.push(p)
    }
  }
  walk(target)
  return acc
}

/** Search in PURE NODE. This deliberately does not shell out.
 *
 *  🔴 IT USED TO CALL RIPGREP, AND THAT SHIPPED A GATE THAT LIED. `rg` is on this repo's dev
 *  machines and NOT on the GitHub runner, and the implementation caught the spawn failure the same
 *  way it caught "no match" — so on CI every probe inverted at once: all six `grep-absent` rows
 *  reported DONE and both `grep-present` rows reported NOT DONE. Eight confident, wrong answers
 *  from one missing binary, and the local run was green the whole time.
 *
 *  That is this repo's named failure mode in its purest form: an instrument that cannot tell
 *  "I looked and found nothing" from "I could not look". The fix is not to detect ripgrep — it is
 *  to not need it, so the question cannot be asked again on some future runner image. */
function patternMatches(pattern, paths) {
  // `m` so ^ and $ anchor per line, which is what every probe in the file is written against.
  const re = new RegExp(pattern, 'm')
  for (const p of paths) {
    for (const file of filesUnder(p)) {
      let text
      try {
        text = readFileSync(file, 'utf8')
      } catch {
        continue // unreadable or binary — not a match, and not an error worth failing on
      }
      if (re.test(text)) return true
    }
  }
  return false
}

/** The self-report preload every cmd probe's node process carries (HYG-062, ADR-1226). */
const PROBE_CPU_PRELOAD = pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), 'backlog-probe-cpu.mjs')).href

/** The environment a cmd probe runs in: the caller's, plus the preload (`--import` takes a file
 *  URL, so the path survives whatever the checkout directory is called). Appended rather than
 *  replaced so a NODE_OPTIONS the runner already set keeps working. */
function probeEnv() {
  const inherited = process.env.NODE_OPTIONS ? `${process.env.NODE_OPTIONS} ` : ''
  return { ...process.env, NODE_OPTIONS: `${inherited}--import ${PROBE_CPU_PRELOAD}` }
}

/** The probe's own cost, summed from every `probe-cpu <ms>` line it (and any node it started that
 *  inherited fd 3) wrote to the report pipe. null when nothing reported — the process was killed
 *  before exit, or the command never reached node — which the caller records as unattributed
 *  rather than as zero. */
function parseProbeReport(text) {
  let total = null
  for (const m of String(text ?? '').matchAll(/^probe-cpu (\d+(?:\.\d+)?)$/gm)) {
    total = (total ?? 0) + Number(m[1])
  }
  return total
}

/** Per-probe CPU, for the summary line the contract test parses. Filled in entry order. */
const probeCosts = []
let unattributed = 0

/** Run one cmd probe. Resolves to its raw outcome; the verdict logic lives in runProbe(). Async so
 *  the pool below can hold several in flight — attribution no longer depends on being the only
 *  child, so nothing forces the probes to queue. */
function spawnProbe(cmd) {
  return new Promise((resolve) => {
    let child
    try {
      // fd 3 is the report pipe: stdout and stderr stay the probe's own, so a probe that prints its
      // reasoning cannot corrupt the cost line and the cost line cannot corrupt a probe's output.
      child = spawn(cmd, { shell: true, stdio: ['ignore', 'pipe', 'pipe', 'pipe'], env: probeEnv(), timeout: 120_000 })
    } catch (error) {
      resolve({ error })
      return
    }
    const report = []
    child.stdio[3].on('data', (c) => report.push(c))
    child.stdout.resume()
    child.stderr.resume()
    child.on('error', (error) => resolve({ error }))
    child.on('close', (status, signal) => resolve({ status, signal, cpuMs: parseProbeReport(Buffer.concat(report)) }))
  })
}

/** Run one probe. Resolves { result, cpuMs }: result true (DONE), false (NOT DONE), or null
 *  (cannot tell); cpuMs the probe's self-reported cost, or null for an in-process kind. */
async function runProbe(p) {
  if (p.kind === 'manual') return { result: null, cpuMs: null }

  if (p.kind === 'cmd') {
    // ⚠️ A `cmd` probe carries the same hazard the ripgrep bug above demonstrated: a pipeline whose
    // tool is missing can still exit 0 and read as DONE. Keep cmd probes to `node -e`, which is
    // guaranteed present wherever this guard runs at all — and which validate() now requires.
    //
    // 🔴 AND THE MIRROR OF IT. The first version wrapped this in try/catch and returned `false` for
    // everything that threw — which folded four different outcomes into one confident verdict. A
    // tsc probe that the OOM killer SIGKILLs, or that hits the timeout, or whose binary is absent
    // (shell exit 127), had NOT FAILED; it had not been ASKED. On a `done` row that reads as
    // "NOT DONE" and the guard fails the build accusing a healthy row of regressing. It is exactly
    // the ripgrep bug wearing different clothes, and it caught us once already: a probe killed by a
    // concurrent `next build` made this script's own parity test disagree with itself.
    //
    // So only a real exit code is a real answer. Death by signal, timeout, spawn failure and 127
    // are all "cannot tell", which the caller counts as unprovable and never converts to a verdict.
    const r = await spawnProbe(p.cmd)
    const cpuMs = r.cpuMs ?? null
    if (r.error || r.signal !== null || r.status === null) return { result: null, cpuMs } // killed, timed out, unspawnable
    if (r.status === 127) return { result: null, cpuMs } // the shell could not find the command — not an answer
    if (r.status === PROBE_INDETERMINATE) return { result: null, cpuMs } // the probe told us it could not look
    return { result: r.status === 0, cpuMs }
  }

  // Paths that do not exist count as "no match" — a deleted file cannot contain the thing.
  const paths = p.paths.filter((f) => existsSync(f))
  if (paths.length === 0) return { result: p.kind === 'grep-absent', cpuMs: null }

  let matched
  try {
    matched = patternMatches(p.pattern, paths)
  } catch {
    return { result: null, cpuMs: null } // a bad regex is "cannot tell", never a silent verdict
  }
  return { result: p.kind === 'grep-present' ? matched : !matched, cpuMs: null }
}

/** Run `tasks` (thunks returning promises) with at most `width` in flight, preserving nothing
 *  about order — callers index their results. Width is the runner's cores, capped: a probe is a
 *  node start plus a file read, so more than a core's worth each just contends. */
async function runPool(tasks, width) {
  let next = 0
  const lanes = Array.from({ length: Math.max(1, width) }, async () => {
    while (next < tasks.length) {
      const i = next++
      await tasks[i]()
    }
  })
  await Promise.all(lanes)
}

const PROBE_PARALLELISM = Math.min(4, availableParallelism())

function daysSince(iso) {
  const then = Date.parse(iso)
  if (Number.isNaN(then)) return Infinity
  return Math.floor((Date.now() - then) / 86_400_000)
}

/** The slate's waves are keyed by their token, and hold only sequenced work (HYG-134).
 *
 *  Two ways a wave list lies without HYG-047's probe noticing, both produced by a real fold on
 *  2026-09-29 (a pre-cull branch folded against main after #3024):
 *    - two waves share a token ("W4 · ..." twice), because the fold matched waves by their full
 *      prose name and main had reworded three of them;
 *    - a wave lists a PARKED id. HYG-047 counts only `done` as finished, so eleven ids main had
 *      parked and taken off the waves came back on them and every gate stayed green.
 *  A parked row carries its reason and date on the row and sits on no wave; only open or blocked
 *  rows are sequenced. waveToken and SLATED_STATUSES come from the fold itself, so the tool that
 *  writes the slate and the gate that reads it cannot disagree about what a wave is. */
function validateSlateWaves(doc) {
  const waves = doc.meta?.slate?.waves
  if (!Array.isArray(waves)) return []
  const problems = []
  const by = new Map((doc.entries ?? []).map((e) => [e.id, e]))
  const tokens = new Map()
  for (const w of waves) {
    const t = waveToken(w.name)
    tokens.set(t, (tokens.get(t) ?? 0) + 1)
    for (const id of w.ids ?? []) {
      const r = by.get(id)
      if (r && !SLATED_STATUSES.includes(r.status)) {
        problems.push(
          `meta.slate wave "${t}" lists ${id}, whose row is ${r.status}. Only ${SLATED_STATUSES.join('/')} rows sit on a wave; ` +
            'take it off (a parked row keeps its reason on the row). HYG-134',
        )
      }
    }
  }
  for (const [t, n] of tokens) {
    if (n > 1) problems.push(`meta.slate has ${n} waves with the token "${t}" — one wave, one token. HYG-134`)
  }
  return problems
}

/** Owner 2026-09-19: calendar C0–C5 is product next. LIVE-414 must list before
 *  other product-next ids while that row is open. Fixtures without
 *  meta.slate.metaScanCleanup are unchanged (backlog-contract ballast). */
function validateSlateCalendarFirst(doc) {
  const cleanup = doc.meta?.slate?.metaScanCleanup
  if (!cleanup) return []

  const problems = []
  const by = new Map((doc.entries ?? []).map((e) => [e.id, e]))
  const cal = ['LIVE-414', 'LIVE-415', 'LIVE-416', 'LIVE-417', 'LIVE-418', 'LIVE-419']
  const next = cleanup.productAgent?.next ?? []
  const waves = doc.meta?.slate?.waves ?? []
  const w0b = waves.find((w) => String(w.name ?? '').startsWith('W0b'))
  const w0c = waves.find((w) => String(w.name ?? '').startsWith('W0c'))

  if (by.get('LIVE-414')?.status === 'open') {
    if (next[0] !== 'LIVE-414') {
      problems.push(
        'meta.slate.metaScanCleanup.productAgent.next must list LIVE-414 first while C0 is open (calendar section first)',
      )
    }
    if (next[1] !== 'LIVE-415') {
      problems.push(
        'meta.slate.metaScanCleanup.productAgent.next must list LIVE-415 second (C0 then C1 in W0b)',
      )
    }
    const firstOther = next.find((id) => !cal.includes(id))
    if (firstOther) {
      problems.push(`productAgent.next lists ${firstOther} beside the calendar ids; keep C0–C5 as the product next list`)
    }
    const w0bIds = w0b?.ids ?? []
    const i414 = w0bIds.indexOf('LIVE-414')
    if (i414 < 0) {
      problems.push('W0b must list LIVE-414 while C0 is open')
    } else {
      for (const other of ['LIVE-186', 'LIVE-213']) {
        const io = w0bIds.indexOf(other)
        if (io >= 0 && io < i414) {
          problems.push(`W0b lists ${other} before LIVE-414`)
        }
      }
    }
  }

  const w0cIds = w0c?.ids ?? []
  const openC2 = ['LIVE-416', 'LIVE-417', 'LIVE-418', 'LIVE-419'].filter((id) => by.get(id)?.status === 'open')
  if (openC2.length) {
    const firstCal = Math.min(...openC2.map((id) => w0cIds.indexOf(id)).filter((i) => i >= 0))
    const firstOtherLive = w0cIds.findIndex((id) => !cal.includes(id) && by.get(id)?.lane === 'live')
    if (firstCal === Infinity || Number.isNaN(firstCal)) {
      problems.push('W0c must list open calendar C2–C5 ids (LIVE-416–419)')
    } else if (firstOtherLive >= 0 && firstOtherLive < firstCal) {
      problems.push(`W0c lists ${w0cIds[firstOtherLive]} before calendar C2–C5`)
    }
  }

  const leave = cleanup.scanAgent?.leave ?? []
  for (const id of cal) {
    if (by.get(id)?.status === 'open' && !leave.includes(id)) {
      problems.push(`scanAgent.leave must include open calendar id ${id}`)
    }
  }

  if (by.get('LIVE-234')?.status === 'open' && by.get('LIVE-234')?.priority !== 'P0') {
    problems.push('LIVE-234 must stay P0 (owner-gated money proof; do not demote it to raise calendar)')
  }

  return problems
}

// ── main ──────────────────────────────────────────────────────────────────────────────────────

const doc = load()
const entries = doc.entries

const structural = [...validate(entries), ...validateSlateCalendarFirst(doc), ...validateSlateWaves(doc)]
if (structural.length) {
  console.error(red(`✗ backlog contract: ${structural.length} structural problem(s) in ${FILE}\n`))
  for (const p of structural) console.error(`   ${p}`)
  process.exit(1)
}

if (REPORT) {
  const rows = entries.filter((e) => (LANE ? e.lane === LANE : true))
  const openRows = rows.filter((e) => e.status === 'open' || e.status === 'blocked')
  console.log(`\n  THE ONE LIST — ${FILE}`)
  console.log(`  ${entries.length} entries · showing ${openRows.length} open/blocked${LANE ? ` in lane "${LANE}"` : ''}\n`)
  const rank = (e) => {
    const i = PRIORITY_KEYS.indexOf(e.priority)
    return i === -1 ? PRIORITY_KEYS.length : i
  }
  const byPriority = (a, b) => rank(a) - rank(b)
  const tag = (e) => (e.priority === 'P0' ? red(e.priority) : e.priority === 'P1' ? yellow(e.priority) : dim(e.priority ?? '??'))
  const line = (e) => {
    const mark = e.status === 'blocked' ? yellow('◍') : '○'
    console.log(`    ${mark} ${tag(e)} ${e.id.padEnd(9)} ${dim(`[${e.size ?? '—'}]`)} ${e.title}`)
  }
  // The urgent set first, across every lane, so the working view answers "what is costing
  // something today" before it answers "what is in which lane". Rows keep their lane below.
  const urgent = openRows.filter((e) => e.priority === 'P0')
  if (urgent.length && !LANE) {
    console.log(`  ${red('NOW')} — ${PRIORITIES[0][1].replace(/^P0 — /, '')} (${urgent.length})`)
    for (const e of urgent) line(e)
    console.log('')
  }
  for (const lane of LANES) {
    const inLane = openRows.filter((e) => e.lane === lane).sort(byPriority)
    if (!inLane.length) continue
    console.log(`  ${lane.toUpperCase()} (${inLane.length})`)
    // The OWNER section is grouped by what KIND of action each row needs. Nineteen
    // undifferentiated items cannot be batched; five labelled groups can, and the split
    // also separates the rows that are ASKS from the ones merely WAITING on a third party
    // — re-raising the latter as a question is how one Stripe blocker collected five
    // different wrong diagnoses across three rows.
    if (lane === 'owner') {
      for (const [kind, heading] of OWNER_ACTIONS) {
        const group = inLane.filter((e) => e.ownerAction === kind)
        if (!group.length) continue
        console.log(dim(`    — ${heading} (${group.length})`))
        for (const e of group) line(e)
      }
      const rest = inLane.filter((e) => !OWNER_ACTIONS.some(([k]) => k === e.ownerAction))
      if (rest.length) {
        console.log(dim(`    — unclassified (${rest.length})`))
        for (const e of rest) line(e)
      }
      // Code rows gated on a ruling. They stay in their own lane because the work is code,
      // but the ruling is the owner's, and a ruling that only appears in a live row's detail
      // is one nobody is asked for (LIVE-185 sat that way: an economy payout the code and
      // three help articles disagree on, filed as "an owner ruling" inside the live lane).
      const carried = openRows.filter((e) => e.lane !== 'owner' && e.ownerAction).sort(byPriority)
      if (carried.length && !LANE) {
        console.log(dim(`    — RULINGS CARRIED BY OTHER LANES — code work waiting on a decision (${carried.length})`))
        for (const e of carried) line(e)
      }
    } else {
      for (const e of inLane) line(e)
    }
    console.log('')
  }
  const parked = entries.filter((e) => e.status === 'parked').length
  const done = entries.filter((e) => e.status === 'done').length
  console.log(dim(`  (${parked} parked, ${done} done — not shown. Use --lane to filter.)\n`))
  process.exit(0)
}

const contradictions = []
const staleManual = []
let probed = 0
let unprovable = 0

// Every probe first, in a pool, then the verdicts in entry order — so the output is stable however
// the pool interleaves, and a contradiction is reported against the same row it always was.
/** Is this row's probe in scope for THIS invocation? See the scope note in the header: `all` asks
 *  everything; `open` asks the rows a pull request can answer for. Parked and manual rows are
 *  filtered before this is reached, so `status` here is open | blocked | done. */
function inProbeScope(e) {
  if (PROBE_SCOPE === 'all') return true
  if (e.status !== 'done') return true
  return daysSince(e.closed) <= RECENTLY_CLOSED_DAYS
}

/** Probes NOT run, split by the reason — so the scope line can say which knob did it. */
let skippedByScope = 0
let skippedByStatic = 0

const toProbe = []
for (const e of entries) {
  // A parked row is a scheduling decision, not a claim about the tree. Probing it would report
  // "you could do this now", which is true of everything parked and therefore says nothing.
  if (e.status === 'parked') continue

  const p = e.verify
  if (p.kind === 'manual') {
    const age = daysSince(p.checked)
    if (age > MANUAL_STALE_DAYS) staleManual.push({ e, age })
    continue
  }
  if (ONLY_STATIC && p.kind === 'cmd') {
    skippedByStatic++
    continue
  }
  if (!inProbeScope(e)) {
    skippedByScope++
    continue
  }
  toProbe.push(e)
}
const outcomes = new Array(toProbe.length)
await runPool(
  toProbe.map((e, i) => async () => {
    outcomes[i] = await runProbe(e.verify)
  }),
  PROBE_PARALLELISM,
)

for (const [i, e] of toProbe.entries()) {
  const p = e.verify
  const { result, cpuMs } = outcomes[i]
  if (p.kind === 'cmd') {
    if (cpuMs === null) unattributed++
    else probeCosts.push({ id: e.id, kind: p.kind, cpuMs })
  }
  if (result === null) {
    unprovable++
    continue
  }
  probed++

  if (e.status === 'open' || e.status === 'blocked') {
    if (result === true) {
      contradictions.push({
        e,
        says: e.status,
        found: 'DONE',
        why: 'The probe passes. Close this row, or correct the probe if it proves the wrong thing.',
      })
    }
  } else if (e.status === 'done') {
    if (result === false) {
      contradictions.push({
        e,
        says: 'done',
        found: 'NOT DONE',
        why: 'Either this regressed, or the row was closed without the probe ever passing.',
      })
    }
  }
}

// ── THE COST LINE (HYG-012) ─────────────────────────────────────────────────────────────────
//
// Printed so a human reading the output can see which probe is expensive, and so
// scripts/backlog-contract.test.ts can budget the RIGHT quantity. The budget it replaces was a
// flat 20s total, which failed four builds — and every one of those failures said "the list has
// grown", not "a probe got expensive". A flat total measures the number of rows, so an honest new
// row pushes it up and the gate fires for a reason unrelated to what it exists to catch.
//
// Two numbers, because there are two questions. `max` is the regression signal and stays valid
// however long the list gets. `total` is capacity, and it scales with the probe count below.
// Only for a real run. The fixtures in scripts/backlog-contract.test.ts probe a single row, and
// several of them assert that a given row id does NOT appear in the output — that is how they prove
// the guard did not accuse a healthy row of regressing. Naming the "slowest" of one probe would put
// that id back on screen and break the assertion for a reason that has nothing to do with what it
// guards. A cost summary over a handful of probes says nothing anyway: it is a statistic about the
// fleet, and the fleet is 111.
const COST_LINE_MIN_PROBES = 10
/** 🔎 SAY WHICH PROBES RAN. A guard that quietly stops asking 556 of its questions looks exactly
 *  like a guard that got weaker for no reason, and the next reader has no way to tell the two
 *  apart from the ✓. Printed on the passing AND the failing path, for the same reason the cost
 *  line is: the number that explains the run must be readable without breaking a build to see it. */
function printScope() {
  const mode = `${PROBE_SCOPE} mode${ONLY_STATIC ? ', --only-static' : ''}`
  const skipped = skippedByScope + skippedByStatic
  const tail =
    PROBE_SCOPE === 'all' && !ONLY_STATIC
      ? 'every non-parked row was asked'
      : 'full sweep runs weekly (check:backlog --probes=all)'
  console.log(`  probes: ${toProbe.length} run (${mode}), ${skipped} skipped — ${tail}`)
  if (skippedByScope) {
    console.log(
      dim(
        `    ${skippedByScope} done row(s) closed more than ${RECENTLY_CLOSED_DAYS} days ago, or with no closed date.` +
          ' A regression there has no author on this pull request.',
      ),
    )
  }
  if (skippedByStatic) {
    console.log(dim(`    ${skippedByStatic} cmd probe(s) skipped by --only-static (search kinds only).`))
  }
}
function printCost() {
  if (probeCosts.length < COST_LINE_MIN_PROBES) return
  const sorted = [...probeCosts].sort((a, b) => b.cpuMs - a.cpuMs)
  const total = Math.round(probeCosts.reduce((n, c) => n + c.cpuMs, 0))
  const worst = sorted[0]
  // `guardCpuMs` is the WHOLE guard — this process plus every probe it reaped — and it is the
  // quantity scripts/backlog-contract.test.ts budgets. It is reported HERE, by the guard itself,
  // for one reason: the contract test's own `console.log` is swallowed by vitest's default
  // reporter on a PASSING test, so on a green CI run it prints exactly nowhere, and a number that
  // can only be read by breaking a build cannot be what a build-blocking constant is set from
  // (AGENTS.md, and the reason PACKED_PER_RAW needed a paired real reading). The `checks` job pipes
  // this stdout straight through, so a green run publishes it. Self CPU is added to child CPU
  // because ~4% of the cost is this process walking the tree for the in-process probe kinds.
  // Self CPU plus what every probe reported for itself. The probes' half used to be read off this
  // process's reaped-children counters, which is the same total but attributable only while the
  // probes ran one at a time; each probe now reports its own (backlog-probe-cpu.cjs), and the in-
  // process grep kinds are inside the self figure.
  const selfCpu = process.cpuUsage()
  const guardCpuMs = Math.round((selfCpu.user + selfCpu.system) / 1000 + total)
  console.log(
    `  probe-cost: n=${probeCosts.length} totalCpuMs=${total} maxCpuMs=${Math.round(worst.cpuMs)} slowest=${worst.id}` +
      (unattributed ? ` unattributed=${unattributed}` : ''),
  )
  console.log(`  guard-cost: guardCpuMs=${guardCpuMs} (probes ${total} + this process, ${PROBE_PARALLELISM} in flight)`)
  // The three most expensive, always — `--report` returns before any probe runs, so gating this
  // on it would have printed the list exactly never.
  for (const c of sorted.slice(0, 3)) {
    console.log(`    ${String(Math.round(c.cpuMs)).padStart(6)} ms  ${c.id.padEnd(11)} ${c.kind}`)
  }
}

const openCount = entries.filter((e) => e.status === 'open' || e.status === 'blocked').length
const parkedCount = entries.filter((e) => e.status === 'parked').length
const doneCount = entries.filter((e) => e.status === 'done').length

if (contradictions.length) {
  console.error(red(`✗ backlog contract: ${contradictions.length} row(s) disagree with the tree\n`))
  for (const c of contradictions) {
    console.error(`   ${red(c.e.id)}  says ${c.says.toUpperCase()}, tree says ${c.found}`)
    console.error(`      ${c.e.title}`)
    console.error(`      ${dim(c.why)}`)
    if (c.e.verify.pattern) console.error(`      ${dim(`probe: ${c.e.verify.kind} /${c.e.verify.pattern}/ in ${c.e.verify.paths.join(', ')}`)}`)
    if (c.e.verify.cmd) console.error(`      ${dim(`probe: ${c.e.verify.cmd}`)}`)
    console.error('')
  }
  console.error(dim(`   Fix the ROW (change its status) or the PROBE (if it measures the wrong thing).`))
  console.error(dim(`   Do not delete the probe to make this pass — that is how the last five lists drifted.\n`))
  // The cost reading prints on a FAILING run too. It has to: scripts/backlog-contract.test.ts
  // budgets from this line, and suppressing it whenever the tree happens to disagree would mean
  // the budget silently loses its input exactly when someone is mid-change — which is when they
  // are most likely to be the one making a probe expensive.
  printScope()
  printCost()
  process.exit(1)
}

console.log(green(`✓ backlog contract: ${entries.length} entries, ${probed} probe(s) agree with the tree.`))
console.log(`  ${openCount} open/blocked · ${parkedCount} parked · ${doneCount} done${unprovable ? ` · ${unprovable} unprovable here` : ''}`)
printScope()
printCost()

if (staleManual.length) {
  console.log('')
  console.log(yellow(`  ⚠ ${staleManual.length} manual row(s) with evidence older than ${MANUAL_STALE_DAYS} days.`))
  console.log(yellow(`    These never fail the build (ADR-970) — but nobody has re-checked them:`))
  for (const { e, age } of staleManual) {
    console.log(`      ${e.id.padEnd(9)} ${age === Infinity ? 'never' : `${age}d`}  ${e.title}`)
  }
}
console.log('')
