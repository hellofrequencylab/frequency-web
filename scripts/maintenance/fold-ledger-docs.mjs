#!/usr/bin/env node
// Fold the two ledger docs that EVERY merge re-conflicts (HYG-032).
//
// WHY THIS EXISTS. Every open PR appends an ADR to the tail of docs/DECISIONS.md and adds rows to
// docs/BUILD-BACKLOG.json. So every merge to main re-conflicts every other open branch on exactly
// those two paths — and, measured across a whole queue with `git merge-tree --write-tree`, on
// nothing else: zero code conflicts, those two files every time. Two sessions in a row have now
// hand-resolved the same conflict eleven times each. That is the thing this replaces.
//
// 🔴 THE JSON HALF MUST NOT BE HAND-EDITED. Doing so has already produced an invalid file (a
// dropped `},{` between two rows) and a duplicated row id in this repo's history, each costing a
// CI round. A merge by row id cannot make either mistake.
//
// 🔴 IT MUST NOT SILENTLY PICK A WINNER. When both sides edited the SAME row, that is a real
// disagreement a human has to settle — it happened on HYG-020 in one session, main holding it
// `open` while the closing PR held it `done`. This exits non-zero and names the id rather than
// guessing, because guessing is how a status list starts lying.
//
// THE TWO RESOLUTIONS, which are always the same:
//   DECISIONS.md      both sides append at the tail, so keep main's block first and the branch's
//                     after (theirs-then-ours). `node scripts/check-adr.mjs` proves the result.
//   BUILD-BACKLOG.json  3-way merge BY ROW ID: ours == base -> take theirs; theirs == base -> take
//                     ours; both changed -> STOP. Emit in main's order, then append the ids only
//                     this branch has, so the file stays reviewable as an append.
//
// Usage, from a conflicted merge (the normal case — git has already staged the three sides):
//   node scripts/maintenance/fold-ledger-docs.mjs
//   node scripts/maintenance/fold-ledger-docs.mjs --check   # report only, write nothing
//
// Exit codes: 0 folded (or nothing to fold) · 1 needs a human (names the ids) · 2 usage/read error.

import { execFileSync } from 'node:child_process'
import { existsSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const BACKLOG = 'docs/BUILD-BACKLOG.json'
const DECISIONS = 'docs/DECISIONS.md'
const checkOnly = process.argv.includes('--check')

/** Read one side of a conflicted path out of the index. Stage 1 = base, 2 = ours, 3 = theirs.
 *  Returns null when that stage does not exist (e.g. a file added on one side only). */
function stage(path, n) {
  try {
    return execFileSync('git', ['show', `:${n}:${path}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  } catch {
    return null
  }
}

/** Paths git currently reports as unmerged. */
function conflicted() {
  const out = execFileSync('git', ['diff', '--name-only', '--diff-filter=U'], { encoding: 'utf8' })
  return out.split('\n').filter(Boolean)
}

// ── BUILD-BACKLOG.json ────────────────────────────────────────────────────────────────────────
//
// Byte-fidelity matters: the repo file is `json.dump(indent=2, ensure_ascii=False)` and ends at the
// closing brace with NO TRAILING NEWLINE. Matching it exactly is what keeps the diff reviewable as
// "N rows added" instead of "whole file rewritten".
//
// ⚠️ THIS COMMENT USED TO SAY "with a single trailing newline", AND THE CODE OBEYED IT. Measured on
// `origin/main` 2026-08-25 (`od -c`): the file ends `] \n }` with nothing after it. Emitting a
// newline is a one-byte change, which is exactly why it survives review — it costs a spurious
// "last line changed" hunk on THIS branch, and then the same hunk in reverse on every branch that
// merges after it. Read the bytes; do not restore the newline from memory of this line.
export function mergeBacklog(base, ours, theirs) {
  if (!ours || !theirs) return { skipped: 'not a 3-way conflict' }

  const parse = (s, which) => {
    try {
      return JSON.parse(s)
    } catch (err) {
      throw new Error(`${BACKLOG} (${which}) is not valid JSON: ${err.message}`)
    }
  }
  const b = base ? parse(base, 'base') : { entries: [] }
  const o = parse(ours, 'ours')
  const t = parse(theirs, 'theirs')

  // ⚠️ CHECK FOR DUPLICATES ON THE WAY IN, NOT ONLY ON THE WAY OUT. `new Map()` keeps the LAST row
  // for a repeated id and drops the rest without a word, so a side that already carried a duplicate
  // — the exact mistake a hand-edit has made in this repo's history — would be silently deduped
  // here and one of the two rows would vanish from the fold. Losing a row quietly is worse than the
  // conflict this tool exists to resolve, so it is an error that names the side and the id.
  const byId = (doc, which) => {
    const rows = doc.entries ?? []
    const seen = new Set()
    const dupes = new Set()
    for (const e of rows) (seen.has(e.id) ? dupes : seen).add(e.id)
    if (dupes.size) {
      throw new Error(`${BACKLOG} (${which}) already has duplicate row id(s): ${[...dupes].join(', ')}`)
    }
    return new Map(rows.map((e) => [e.id, e]))
  }
  const [B, O, T] = [byId(b, 'base'), byId(o, 'ours'), byId(t, 'theirs')]
  const same = (x, y) => JSON.stringify(x) === JSON.stringify(y)

  const bothChanged = []
  const merged = []
  const emitted = new Set()

  // Main's order first: theirs is main, so its ordering is the one reviewers already know.
  for (const [id, theirRow] of T) {
    const ourRow = O.get(id)
    const baseRow = B.get(id)
    if (!ourRow) {
      merged.push(theirRow) // only main has it (or we deleted it — deletion is not a case here)
    } else if (same(ourRow, theirRow)) {
      merged.push(theirRow)
    } else if (baseRow && same(ourRow, baseRow)) {
      merged.push(theirRow) // only main moved it
    } else if (baseRow && same(theirRow, baseRow)) {
      merged.push(ourRow) // only this branch moved it
    } else {
      bothChanged.push(id) // a real disagreement: a human settles it
      merged.push(theirRow)
    }
    emitted.add(id)
  }
  // Then the ids only this branch has, appended in its own order.
  for (const [id, ourRow] of O) if (!emitted.has(id)) merged.push(ourRow)

  const ids = merged.map((e) => e.id)
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i)
  if (dupes.length) throw new Error(`duplicate row id(s) after fold: ${[...new Set(dupes)].join(', ')}`)

  const out = { ...t, entries: merged }
  const text = JSON.stringify(out, null, 2) // no trailing newline — see the byte-fidelity note above
  return { text, count: merged.length, added: merged.length - T.size, bothChanged }
}

// ── DECISIONS.md ──────────────────────────────────────────────────────────────────────────────
//
// Both sides append ADR entries at the tail. The fold is theirs-then-ours: main's block keeps its
// position, this branch's block follows. The common prefix is whatever the two sides still share.
export function mergeDecisions(base, ours, theirs) {
  if (!ours || !theirs || !base) return { skipped: 'not a 3-way conflict' }

  // Each side = base + its own appended tail. Verify that shape before trusting the fold: if a side
  // EDITED the shared body rather than appending, this is not an append-conflict and wants a human.
  if (!ours.startsWith(base) || !theirs.startsWith(base)) {
    return { needsHuman: 'one side edited the existing body rather than appending at the tail' }
  }
  const ourTail = ours.slice(base.length)
  const theirTail = theirs.slice(base.length)
  const text = base + theirTail + ourTail
  return { text, ourTailBytes: ourTail.length, theirTailBytes: theirTail.length }
}

// ── main ──────────────────────────────────────────────────────────────────────────────────────
//
// The two `merge*` functions above are PURE and exported: they take the three sides as text and
// return the fold. Everything that touches git lives here. That is the whole reason
// scripts/maintenance/fold-ledger-docs.test.ts can drive the byte fidelity and the both-sides-edited
// refusal without staging a real conflict — and it is the reason this tool has a CI half at all.

const foldBacklog = () => mergeBacklog(stage(BACKLOG, 1), stage(BACKLOG, 2), stage(BACKLOG, 3))
const foldDecisions = () => mergeDecisions(stage(DECISIONS, 1), stage(DECISIONS, 2), stage(DECISIONS, 3))

function main() {
  const unmerged = conflicted()
  const targets = unmerged.filter((p) => p === BACKLOG || p === DECISIONS)
  const others = unmerged.filter((p) => p !== BACKLOG && p !== DECISIONS)

  if (targets.length === 0) {
    console.log('fold-ledger-docs: nothing to fold (neither ledger doc is conflicted).')
    if (others.length) console.log(`  ${others.length} other conflicted path(s) left for you: ${others.join(', ')}`)
    return 0
  }

  let failed = false

  if (targets.includes(BACKLOG)) {
    const r = foldBacklog()
    if (r.skipped) {
      console.log(`fold-ledger-docs: ${BACKLOG} ${r.skipped}`)
    } else if (r.bothChanged.length) {
      console.error(`🔴 ${BACKLOG}: both sides edited the same row(s) — a human decides, not this tool:`)
      for (const id of r.bothChanged) console.error(`     ${id}`)
      console.error('   Resolve those rows by hand, then re-run.')
      failed = true
    } else {
      if (!checkOnly) writeFileSync(BACKLOG, r.text)
      console.log(`✓ ${BACKLOG}: ${r.count} rows (${r.added >= 0 ? '+' : ''}${r.added} vs main)${checkOnly ? ' [check only]' : ''}`)
    }
  }

  if (targets.includes(DECISIONS)) {
    const r = foldDecisions()
    if (r.skipped) {
      console.log(`fold-ledger-docs: ${DECISIONS} ${r.skipped}`)
    } else if (r.needsHuman) {
      console.error(`🔴 ${DECISIONS}: ${r.needsHuman}. Resolve by hand.`)
      failed = true
    } else {
      if (!checkOnly) writeFileSync(DECISIONS, r.text)
      console.log(`✓ ${DECISIONS}: main's ${r.theirTailBytes}B tail kept first, this branch's ${r.ourTailBytes}B after${checkOnly ? ' [check only]' : ''}`)
    }
  }

  if (failed) return 1

  if (!checkOnly) {
    // Stage only what was folded. Anything else conflicted stays yours to resolve.
    const folded = targets.filter((p) => existsSync(p))
    if (folded.length) execFileSync('git', ['add', ...folded])
    console.log('\nFolded and staged. Now prove it before committing:')
    console.log('  node scripts/check-adr.mjs && node scripts/check-backlog.mjs')
  }
  if (others.length) console.log(`\n${others.length} other conflicted path(s) left for you: ${others.join(', ')}`)
  return 0
}

// Run only when INVOKED, never on import — the CI half imports the two pure `merge*` functions, and
// an unguarded `main()` here would shell out to git and call process.exit() inside the test runner.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exit(main())
  } catch (err) {
    console.error(`fold-ledger-docs failed: ${err.message}`)
    process.exit(2)
  }
}
