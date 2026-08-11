#!/usr/bin/env node
// check:research-freshness: how long since a real user was in the loop, said out loud.
//
// WHY THIS EXISTS. UX-MATURITY-PLAN Lift 1 ("the user-evidence loop") names exactly one gate,
// and docs/research/PROTOCOL.md §8 repeats its spec down to the regex: warn when the newest
// `docs/research/findings/YYYY-MM-DD.md` is more than 100 days old. Neither doc had a script
// behind it. The loop's protocol, its file convention, and its handoff leg were all written;
// the only thing measuring them was nobody.
//
// ADVISORY BY DESIGN. It exits 0 even when stale, even when no round has ever run. This follows
// ADR-970, which split `check:help` into two halves for exactly this reason: an ORPHAN KEY is a
// broken link and fails now, while an UNDOCUMENTED CORE FEATURE is "a content backlog item with
// an owner and a queue. Failing every build on it would make the gate something to route around,
// which is how a gate dies." Recruiting five members per quarter is that second kind of thing:
// it is 🔴 owner action (PROTOCOL §2, ~2 hours per quarter), and no PR author can clear it. A
// red build on someone else's calendar teaches everyone to ignore the gate, and then the gate is
// worth less than the doc it was meant to enforce.
//
// WHAT IT IS STRICT ABOUT. Its own ability to measure. See ANCHORS below: the staleness verdict
// is advisory, the gate's competence to reach a verdict is not.
//
// SHAPE VS TRUTH. This repo's named failure mode is a gate that checks the shape of a value
// rather than its truth. A filename is pure shape: `2026-08-01.md` asserts a round happened on a
// date, and an empty file asserts it just as loudly. So the newest round is also read, and its
// six required headings (findings/README.md §Required shape) are checked. A file with no
// "## What users tripped on" table resets the clock while giving the DAWN handoff nothing to
// carry, which is the one failure this gate exists to make impossible to miss. Reported loudly,
// still exit 0: a half-written findings file is an authoring problem with a name attached, and the
// person who can fix it is the person reading the warning.
//
// Usage:
//   node scripts/check-research-freshness.mjs           # the report + the handoff line
//   node scripts/check-research-freshness.mjs --json    # machine-readable

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

export const RESEARCH_DIR = 'docs/research'
export const FINDINGS_DIR = 'docs/research/findings'
export const PROTOCOL_PATH = 'docs/research/PROTOCOL.md'
export const README_PATH = 'docs/research/findings/README.md'

/** The cadence, from Lift 1's gate line and PROTOCOL §8: "more than **100 days** old". NOT the
 *  "quarterly" of PROTOCOL §1. 100 days is deliberately looser than a 91-day quarter, so a round
 *  that slips a week does not trip it. Read the number, do not re-derive it from the word. */
export const CADENCE_DAYS = 100

/** The convention, quoted from findings/README.md §Naming: "The freshness gate scans
 *  `\d{4}-\d{2}-\d{2}\.md` and ignores this README; anything else in here is noise it has to be
 *  taught to skip." Anchored both ends so `draft-2026-01-01.md` is noise, not a round. */
export const FINDINGS_RE = /^(\d{4})-(\d{2})-(\d{2})\.md$/

/** findings/README.md §Required shape: six sections, in this order, because "the handoff step and
 *  the freshness gate both depend on the headings being stable". This is that dependency, made
 *  real rather than assumed. */
export const REQUIRED_SECTIONS = [
  '## The round',
  '## What users tripped on',
  '## Journey outcomes',
  '## Quotes',
  '## What we are changing',
  '## Open questions for the design round',
]

/** The one section the handoff copies out verbatim (SYNC.md standing rule 1). */
export const HANDOFF_SECTION = '## What users tripped on'

const defaultIo = () => ({
  read: (f) => readFileSync(f, 'utf8'),
  exists: existsSync,
  readdir: (d) => readdirSync(d).map(String),
  now: new Date(),
})

/** THE FLOOR, and it is deliberately not a count.
 *
 *  The two sibling floors (MIN_PAGES in check-templates.mjs, MIN_ROWS in check-gate-parity.mjs) both
 *  exist because "a gate that scans nothing reports a clean bill of health". The instinct is to
 *  copy them literally: fail under N findings files. That would be wrong here, and wrong forever.
 *  The corpus is legitimately ZERO today (no moderated round has run), and zero is the honest
 *  state, not a broken walk. A floor that fires on the correct state is a floor everybody learns
 *  to skip, which costs more than having none.
 *
 *  So the flooring moves off the corpus and onto the MEASUREMENT. The hazard those two floors
 *  actually guard is a scan that resolved to nothing and reported silence as health. Here that
 *  hazard is precise and nameable: `docs/research/findings/` gets renamed, moved, or emptied, and
 *  this gate goes on printing "no moderated round has run yet", which is TRUE TODAY and would
 *  stay indistinguishable from a vanished directory for as long as it took someone to notice.
 *  Zero findings and zero directory print the same sentence, and only one of them is fine.
 *
 *  Three anchors, each the minimum evidence that this gate can still tell those apart:
 *    · PROTOCOL.md exists      : the process this gate reports on. Gone, and the gate is measuring
 *                                the age of a practice the repo no longer describes.
 *    · findings/ exists        : the corpus location. Gone, and every future round has nowhere to
 *                                land, silently.
 *    · README.md is IN it      : the listing returned at least one entry, so the walk resolved.
 *                                This is the closest thing to MIN_ROWS available: the honest
 *                                minimum for a healthy empty corpus is one file, and it is the
 *                                file that DEFINES the convention this scanner implements.
 *
 *  These are the one part of this gate that exits 1. The split is the point: the staleness verdict
 *  is advisory because it lands on a human calendar, and the anchors are strict because they land
 *  on this file's ability to have a verdict at all. An advisory gate that cannot measure is not
 *  advisory, it is decorative. */
export const ANCHORS = [
  { path: PROTOCOL_PATH, kind: 'file', why: 'the protocol this gate reports the cadence of' },
  { path: FINDINGS_DIR, kind: 'dir', why: 'the corpus location every round lands in' },
  { path: README_PATH, kind: 'file', why: 'the file convention this scanner implements, and proof the listing resolved' },
]

export function anchorFailures(io = {}) {
  const exists = io.exists ?? defaultIo().exists
  const readdir = io.readdir ?? defaultIo().readdir
  const out = []
  for (const a of ANCHORS) {
    if (!exists(a.path)) {
      out.push(`${a.path} is missing (${a.why}).`)
      continue
    }
    if (a.kind === 'dir') {
      let entries
      try {
        entries = readdir(a.path)
      } catch (e) {
        out.push(`${a.path} could not be listed: ${e.message} (${a.why}).`)
        continue
      }
      if (entries.length === 0) out.push(`${a.path} listed zero entries, not even its README (${a.why}).`)
    }
  }
  return out
}

/** UTC midnight for a Y-M-D triple, plus a round-trip check. `2026-13-45.md` matches the regex
 *  (the regex is shape; this is truth) and a bare Date would happily roll it into 2027. A filename
 *  that does not survive the round trip is not a date, so it is named and skipped, never counted. */
export function parseIsoDate(y, m, d) {
  const ts = Date.UTC(Number(y), Number(m) - 1, Number(d))
  const dt = new Date(ts)
  if (dt.getUTCFullYear() !== Number(y) || dt.getUTCMonth() !== Number(m) - 1 || dt.getUTCDate() !== Number(d)) {
    return null
  }
  return dt
}

/** Split a directory listing into rounds, malformed dates, and noise. */
export function classify(entries) {
  const rounds = []
  const malformed = []
  const stray = []
  for (const name of [...entries].sort()) {
    if (name === 'README.md') continue
    const m = FINDINGS_RE.exec(name)
    if (!m) {
      stray.push(name)
      continue
    }
    const date = parseIsoDate(m[1], m[2], m[3])
    if (!date) {
      malformed.push(name)
      continue
    }
    rounds.push({ name, date, path: `${FINDINGS_DIR}/${name}` })
  }
  rounds.sort((a, b) => a.date - b.date)
  return { rounds, malformed, stray }
}

const DAY = 86_400_000
const utcMidnight = (d) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())

/** Whole days between the round's date and today, both at UTC midnight. Negative = future-dated,
 *  which is a typo worth naming rather than clamping to "0 days old". */
export function ageInDays(date, now) {
  return Math.round((utcMidnight(now) - utcMidnight(date)) / DAY)
}

/** Which of the six required headings this findings file is missing. Comment-blind is unnecessary
 *  here (markdown, not code), but the match is line-anchored so a heading quoted mid-sentence does
 *  not count as the section existing. */
export function missingSections(src) {
  return REQUIRED_SECTIONS.filter((h) => !new RegExp(`^${h}\\s*$`, 'm').test(src))
}

/** Does the trip table have at least one data row? A heading with an empty table under it is the
 *  purest form of shape-without-truth: the handoff copies out a header row and nothing tripped. */
export function tripRowCount(src) {
  const lines = src.split('\n')
  const start = lines.findIndex((l) => l.trim() === HANDOFF_SECTION)
  if (start === -1) return 0
  let rows = 0
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (line.startsWith('## ')) break
    if (!line.startsWith('|')) continue
    if (/^\|[\s|:-]+\|$/.test(line)) continue // the |---|---| separator
    if (/^\|\s*Severity\b/i.test(line)) continue // the header row
    rows++
  }
  return rows
}

export function evaluate(io = {}) {
  const failures = anchorFailures(io)
  if (failures.length > 0) {
    throw new Error(
      'check:research-freshness cannot measure anything:\n' +
        failures.map((f) => `    ${f}`).join('\n') +
        '\n  Zero findings and a vanished findings directory print the same sentence, and only one ' +
        'of them is fine. Restore the anchor rather than relaxing it.',
    )
  }

  const d = defaultIo()
  const read = io.read ?? d.read
  const readdir = io.readdir ?? d.readdir
  const now = io.now ?? d.now

  const { rounds, malformed, stray } = classify(readdir(FINDINGS_DIR))

  if (rounds.length === 0) {
    return {
      status: 'never',
      rounds: 0,
      newest: null,
      ageDays: null,
      malformed,
      stray,
      missing: [],
      tripRows: 0,
      handoff: `No moderated round has run yet. See ${PROTOCOL_PATH}.`,
    }
  }

  const newest = rounds[rounds.length - 1]
  const ageDays = ageInDays(newest.date, now)
  const src = read(newest.path)
  const missing = missingSections(src)
  const tripRows = tripRowCount(src)

  const status = ageDays < 0 ? 'future' : ageDays > CADENCE_DAYS ? 'stale' : 'fresh'
  const handoff =
    status === 'stale'
      ? `Newest findings: the round of ${newest.name.replace('.md', '')}, ${ageDays} days old, past the ` +
        `${CADENCE_DAYS}-day cadence. Sending it anyway. Trip table: ${newest.path}.`
      : `Newest findings: the round of ${newest.name.replace('.md', '')}, ${ageDays} days old. ` +
        `Trip table: ${newest.path}.`

  return { status, rounds: rounds.length, newest, ageDays, malformed, stray, missing, tripRows, handoff }
}

const ICON = { fresh: '✅', stale: '⚠️', never: '🔴', future: '⚠️' }

export function report(r) {
  const lines = []
  if (r.status === 'never') {
    lines.push(
      `🔴 check:research-freshness: no moderated round has ever run. ${FINDINGS_DIR}/ holds its ` +
        'README and nothing else.',
    )
    lines.push(
      `   This is the honest state, not a broken scan: the protocol is written (${PROTOCOL_PATH}), ` +
        'the file convention is written, and the round itself is 🔴 owner action (recruiting five ' +
        'members, PROTOCOL §2). Nothing a PR can fix, which is why this exits 0.',
    )
  } else if (r.status === 'future') {
    lines.push(
      `⚠️ check:research-freshness: the newest findings file is dated ${Math.abs(r.ageDays)} day(s) in ` +
        `the FUTURE (${r.newest.path}). Round files are dated the day the last session ran ` +
        '(findings/README.md), so this is a typo or a file landed early.',
    )
  } else {
    const verdict =
      r.status === 'stale'
        ? `⚠️ ${r.ageDays} days since the last moderated round, past the ${CADENCE_DAYS}-day cadence.`
        : `✅ ${r.ageDays} days since the last moderated round, inside the ${CADENCE_DAYS}-day cadence.`
    lines.push(`${verdict} Newest: ${r.newest.path} (${r.rounds} round file(s) on record).`)
    if (r.status === 'stale') {
      lines.push(
        '   Advisory, so this exits 0: the fix is recruiting five members for the next round ' +
          '(PROTOCOL §2, 🔴 owner), which no build can do.',
      )
    }
  }

  if (r.missing.length > 0) {
    lines.push(
      `   ⚠️ That file is missing ${r.missing.length} of the ${REQUIRED_SECTIONS.length} required ` +
        `sections: ${r.missing.join(' · ')}. findings/README.md §Required shape.`,
    )
  }
  if (r.newest && r.missing.length === 0 && r.tripRows === 0) {
    lines.push(
      `   ⚠️ "${HANDOFF_SECTION}" has no rows, so the clock restarted on a round the DAWN handoff ` +
        'cannot carry anything out of.',
    )
  }
  if (r.malformed.length > 0) {
    lines.push(
      `   ⚠️ Ignored ${r.malformed.length} file(s) whose name looks like a date but is not one: ` +
        `${r.malformed.join(' · ')}.`,
    )
  }
  if (r.stray.length > 0) {
    lines.push(
      `   ⏳ Ignored ${r.stray.length} non-round file(s) in ${FINDINGS_DIR}/: ${r.stray.join(' · ')}. ` +
        'findings/README.md: nothing else lives in this folder.',
    )
  }

  lines.push('')
  lines.push('   Handoff line, copy into the outbound DAWN handoff, "What users tripped on"')
  lines.push('   (design_handoff/SYNC.md standing rule 1: never omit the heading):')
  lines.push('')
  lines.push(`     ${r.handoff}`)
  lines.push('')
  return lines.join('\n')
}

function main() {
  const json = process.argv.includes('--json')
  let result
  try {
    result = evaluate()
  } catch (e) {
    console.error(`✗ ${e.message}`)
    process.exit(1)
  }
  if (json) {
    console.log(
      JSON.stringify(
        {
          status: result.status,
          icon: ICON[result.status],
          cadenceDays: CADENCE_DAYS,
          rounds: result.rounds,
          newest: result.newest?.path ?? null,
          ageDays: result.ageDays,
          missingSections: result.missing,
          tripRows: result.tripRows,
          malformed: result.malformed,
          stray: result.stray,
          handoff: result.handoff,
        },
        null,
        2,
      ),
    )
    return
  }
  console.log(report(result))
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main()
