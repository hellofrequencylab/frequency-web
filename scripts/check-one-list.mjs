#!/usr/bin/env node
// ONE-LIST CONTRACT — there is one backlog, and a new plan doc cannot quietly become a second one.
//
// WHY THIS EXISTS. Five documents in this repo each declare themselves the single master list:
// MASTER-TODO ("This is the one list"), BUILD-LIST ("The single, prioritized, execute-from list"),
// MASTER-PLAN ("one consolidated, ordered work list"), BUILD-CATALOG ("master index of ALL
// unfinished work") and BUILD-SEQUENCE ("the single front-door"). Four are wrong. None of them was
// wrong when it was written — each was a genuine consolidation that then drifted, and the drift
// was invisible because nothing measured it.
//
// The 2026-08-17 census cost a full session to reconstruct what was actually open, and found 22
// items already done and still listed, plus three docs asking for shipped work. This gate exists so
// that reconstruction never has to happen twice.
//
// TWO RULES, both cheap:
//
//   1. THE SET IS FROZEN. `scripts/planning-docs.txt` lists every planning-shaped markdown file.
//      A new one fails CI. This is the same exact-match ratchet as `render-path-bodies.txt`: the
//      fix is to add the row deliberately, in the same PR, with a reason in the commit message.
//      A file that DISAPPEARS also fails — a deleted plan whose rows nobody re-homed is exactly
//      how work gets lost, which is the failure mode in the other direction.
//
//   2. EVERY PLANNING DOC DECLARES WHERE ITS STATUS LIVES. In its first 25 lines it must either
//      point at `docs/BUILD-BACKLOG.json` (status is owned by the one list) or carry a SUPERSEDED
//      banner (it is history). A planning doc claiming neither is a rival master list in waiting.
//      Three docs failed this on 2026-08-17 — FOUNDATION-HARDENING-PLAN, ENTITY-MANAGEMENT-OVERHAUL
//      and GROWTH-OS-BUILD-PLAN — and a reader genuinely could not tell whether they were live.
//
// WHAT THIS DELIBERATELY DOES NOT DO. It does not ban documents. Specs, architecture and rationale
// are the reason this repo is legible, and EDITOR-ARCHITECTURE / PAGE-FRAMEWORK / STUDIO are worth
// more than any list. The rule is narrower and it is only about STATUS: prose may explain the work,
// but it may not be the record of whether the work is done. That record is the backlog, because a
// machine can check the backlog and cannot check prose.

import { readFileSync, existsSync } from 'node:fs'
import { execSync } from 'node:child_process'

const ALLOWLIST = 'scripts/planning-docs.txt'
const BACKLOG = 'docs/BUILD-BACKLOG.json'

/** How far into a file a reader should have to look to learn whether it is live. */
const HEADER_LINES = 25

/** Name shapes that have historically spawned a rival master list.
 *
 *  INVENTORY / CENSUS / SURVEY / ASSESSMENT / FINDINGS were added on the day this gate shipped,
 *  because the census that prompted it was itself called TASK-INVENTORY and would have slipped
 *  through — a document enumerating all open work is the single most likely thing to become the
 *  sixth rival list. Bare REVIEW is deliberately NOT here: it catches process guidance like
 *  REVIEWING-CHANGES.md, which is not a work list, and a gate that fires on the wrong class of
 *  file is how a gate gets muted. */
const PLANNING_NAME = /(PLAN|TODO|ROADMAP|BACKLOG|CHECKLIST|SEQUENCE|CATALOG|AUDIT|REMAINING|OPEN-THREADS|MASTER|BUILD-LIST|BUILD-PHASES|DEVELOPMENT-MAP|PATCH-LIST|STATUS|BASELINE|SCAN|HANDOFF|BUILD|INVENTORY|CENSUS|SURVEY|ASSESSMENT|FINDINGS)/i

/** Either of these, in the header, satisfies rule 2. */
const DEFERS_TO_BACKLOG = /BUILD-BACKLOG\.json/
const IS_HISTORY = /SUPERSEDED|Superseded|superseded|history, not status|Kept for history|kept for history/

const red = (s) => `\x1b[31m${s}\x1b[0m`
const green = (s) => `\x1b[32m${s}\x1b[0m`
const dim = (s) => `\x1b[2m${s}\x1b[0m`

if (!existsSync(ALLOWLIST)) {
  console.error(red(`✗ ${ALLOWLIST} is missing — the frozen set cannot be checked.`))
  process.exit(1)
}

const allowed = readFileSync(ALLOWLIST, 'utf8')
  .split('\n')
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith('#'))

if (allowed.length < 40) {
  // A truncated allowlist would silently permit everything. A ✓ over nothing is the one thing a
  // gate must never print (ADR-962).
  console.error(red(`✗ ${ALLOWLIST} has only ${allowed.length} entries — it looks truncated.`))
  process.exit(1)
}

// Enumerate the tree with git so ignored files and build output can never enter the set.
let tracked
try {
  tracked = execSync('git ls-files "*.md"', { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 })
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
} catch (err) {
  console.error(red(`✗ could not list tracked markdown via git: ${err.message}`))
  process.exit(1)
}

const actual = tracked.filter((p) => {
  if (p.startsWith('node_modules/')) return false
  // Only the doc roots. design_handoff/ is DAWN's contract surface, not a task list, and every
  // file under it would otherwise match on the directory name alone.
  const inScope = p.startsWith('docs/') || p.startsWith('resonance/docs/') || !p.includes('/')
  if (!inScope) return false
  const base = p.split('/').pop()
  return PLANNING_NAME.test(base)
})

const allowedSet = new Set(allowed)
const actualSet = new Set(actual)

const added = actual.filter((p) => !allowedSet.has(p))
const removed = allowed.filter((p) => !actualSet.has(p))

const problems = []

if (added.length) {
  problems.push({
    kind: 'A NEW PLANNING DOC',
    lines: added,
    fix:
      `If this file is genuinely the right home for something, add it to ${ALLOWLIST} in THIS PR and\n` +
      `   say why in the commit message. If it is a list of work, it belongs in ${BACKLOG} as entries\n` +
      `   instead — that is the whole point of the one-list rule.`,
  })
}

if (removed.length) {
  problems.push({
    kind: 'A PLANNING DOC DISAPPEARED',
    lines: removed,
    fix:
      `Deleting a plan is fine, but its open rows have to go somewhere first. Confirm every open item\n` +
      `   is represented in ${BACKLOG}, then drop the line from ${ALLOWLIST} in the same PR.`,
  })
}

// Rule 2 — every planning doc says where its status lives.
const silent = []
for (const p of actual) {
  if (!existsSync(p)) continue
  const header = readFileSync(p, 'utf8').split('\n').slice(0, HEADER_LINES).join('\n')
  if (DEFERS_TO_BACKLOG.test(header) || IS_HISTORY.test(header)) continue
  silent.push(p)
}

if (silent.length) {
  problems.push({
    kind: 'PLANNING DOCS THAT DO NOT SAY WHERE THEIR STATUS LIVES',
    lines: silent,
    fix:
      `Add ONE line to the top of each (within the first ${HEADER_LINES} lines):\n` +
      `     > **Status lives in [\`docs/BUILD-BACKLOG.json\`](BUILD-BACKLOG.json).** This document is the\n` +
      `     > spec and the rationale; it does not track what is done.\n` +
      `   ...or a SUPERSEDED banner if it is history. A reader must not have to guess.`,
  })
}

if (problems.length) {
  console.error(red(`✗ one-list contract: ${problems.length} problem(s)\n`))
  for (const p of problems) {
    console.error(`   ${red(p.kind)} (${p.lines.length})`)
    for (const l of p.lines) console.error(`     ${l}`)
    console.error(`   ${dim(p.fix)}\n`)
  }
  process.exit(1)
}

console.log(green(`✓ one-list contract: ${actual.length} planning doc(s), set unchanged, every one declares where its status lives.`))
console.log(dim(`  Status is owned by ${BACKLOG}. Prose explains the work; it does not record whether it is done.`))
