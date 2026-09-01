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
// Usage:
//   node scripts/check-backlog.mjs           # verify every probe; exit 1 on a contradiction
//   node scripts/check-backlog.mjs --report  # print the working view (open + owner rows), exit 0
//   node scripts/check-backlog.mjs --lane owner   # filter the report to one lane

import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

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
const STATUSES = ['open', 'done', 'parked', 'blocked']
const SIZES = ['XS', 'S', 'M', 'L', 'XL', '—']
const PROBE_KINDS = ['grep-absent', 'grep-present', 'cmd', 'manual']

/** A repo backlog that drops to a handful of rows means the file was truncated or the scan is
 *  broken, and a ✓ over nothing is the one thing a gate must never print (ADR-962). */
const MIN_ENTRIES = 40

const args = process.argv.slice(2)
const REPORT = args.includes('--report')
const LANE = args.includes('--lane') ? args[args.indexOf('--lane') + 1] : null

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
      if (p.cmd) {
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

    // A source that no longer exists is how a row outlives the document that justified it.
    if (e.source?.file && !existsSync(e.source.file)) {
      problems.push(`${at}: source file "${e.source.file}" does not exist`)
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

/** CPU burned by REAPED CHILDREN so far, in ms, or null off Linux.
 *
 *  This is the same quantity scripts/backlog-contract.test.ts budgets against, and it is the only
 *  honest one: LIVE-047 established that the wall clock here measures the CI runner's contention
 *  rather than any probe's cost (12.0s of CPU read as 9.3s wall unloaded and 18.6s wall against a
 *  20s ceiling with six spinners, while the CPU stayed flat within 4%). Measuring it PER PROBE is
 *  what lets the budget name the expensive probe instead of blaming the list for being long. */
function childCpuMs() {
  try {
    const stat = readFileSync('/proc/self/stat', 'utf8')
    const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ')
    const ticks = Number(fields[13]) + Number(fields[14]) // cutime + cstime
    if (!Number.isFinite(ticks)) return null
    return (ticks / 100) * 1000 // CLK_TCK is 100 on every platform this runs on
  } catch {
    return null
  }
}

/** Per-probe CPU, newest first, for the summary line the contract test parses. */
const probeCosts = []

/** Run one probe. Returns true (DONE), false (NOT DONE), or null (cannot tell). */
function runProbe(p) {
  if (p.kind === 'manual') return null

  if (p.kind === 'cmd') {
    // ⚠️ A `cmd` probe carries the same hazard the ripgrep bug above demonstrated: a pipeline whose
    // tool is missing can still exit 0 and read as DONE. Keep cmd probes to `node -e`, which is
    // guaranteed present wherever this guard runs at all.
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
    const r = spawnSync(p.cmd, { shell: true, stdio: 'pipe', timeout: 120_000 })
    if (r.error || r.signal !== null || r.status === null) return null // killed, timed out, unspawnable
    if (r.status === 127) return null // the shell could not find the command — not an answer
    if (r.status === PROBE_INDETERMINATE) return null // the probe told us it could not look
    return r.status === 0
  }

  // Paths that do not exist count as "no match" — a deleted file cannot contain the thing.
  const paths = p.paths.filter((f) => existsSync(f))
  if (paths.length === 0) return p.kind === 'grep-absent'

  let matched
  try {
    matched = patternMatches(p.pattern, paths)
  } catch {
    return null // a bad regex is "cannot tell", never a silent verdict
  }
  return p.kind === 'grep-present' ? matched : !matched
}

function daysSince(iso) {
  const then = Date.parse(iso)
  if (Number.isNaN(then)) return Infinity
  return Math.floor((Date.now() - then) / 86_400_000)
}

// ── main ──────────────────────────────────────────────────────────────────────────────────────

const doc = load()
const entries = doc.entries

const structural = validate(entries)
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
  for (const lane of LANES) {
    const inLane = openRows.filter((e) => e.lane === lane)
    if (!inLane.length) continue
    console.log(`  ${lane.toUpperCase()} (${inLane.length})`)
    for (const e of inLane) {
      const mark = e.status === 'blocked' ? yellow('◍') : '○'
      console.log(`    ${mark} ${e.id.padEnd(9)} ${dim(`[${e.size ?? '—'}]`)} ${e.title}`)
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

  const cpuBefore = childCpuMs()
  const result = runProbe(p)
  const cpuAfter = childCpuMs()
  if (cpuBefore !== null && cpuAfter !== null) {
    probeCosts.push({ id: e.id, kind: p.kind, cpuMs: Math.max(0, cpuAfter - cpuBefore) })
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
  const selfCpu = process.cpuUsage()
  const guardCpuMs = Math.round((selfCpu.user + selfCpu.system) / 1000 + (childCpuMs() ?? 0))
  console.log(
    `  probe-cost: n=${probeCosts.length} totalCpuMs=${total} maxCpuMs=${Math.round(worst.cpuMs)} slowest=${worst.id}`,
  )
  console.log(`  guard-cost: guardCpuMs=${guardCpuMs} (probes ${total} + this process)`)
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
  printCost()
  process.exit(1)
}

console.log(green(`✓ backlog contract: ${entries.length} entries, ${probed} probe(s) agree with the tree.`))
console.log(`  ${openCount} open/blocked · ${parkedCount} parked · ${doneCount} done${unprovable ? ` · ${unprovable} unprovable here` : ''}`)
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
