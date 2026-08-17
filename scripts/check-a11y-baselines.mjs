#!/usr/bin/env node
// check:a11y-baselines — the STATIC half of the accessibility ratchet.
//
// ── What this guards, and why the runtime gate cannot ─────────────────────────
// `test/e2e/a11y.spec.ts` can only judge a surface it has just measured, and it needs a
// browser, a deployed URL and a seeded member account to do it. So every property that lives
// in the FILE rather than in a run — is this number a reading or a ceiling? does the ceiling
// say why? was it raised without anyone writing a reason? — had no gate at all. That gap is
// exactly how three raw pre-waiver seeds (/feed 12, /settings 7, /spaces/<slug>/manage 8) sat
// in the file for six days reading as measurements. This script runs on the tree alone, with
// no browser, so it fires on every PR.
//
// ── The rule ──────────────────────────────────────────────────────────────────
// A bare integer is a READING: the runtime gate asserts EQUALITY against it, so a regression
// and an improvement both fail. Anything weaker than that is an exception and has to be
// declared as one — an object carrying `ceiling`, `why`, `retiredBy`, `frozen` and `history`:
//
//   1. PROVENANCE INTEGRITY — `frozen.value` must equal `ceiling`, and `history.at(-1)` must
//      equal `frozen`. Editing the number by hand without writing why now FAILS. This is the
//      rule scripts/check-adoption.mjs added on 2026-08-04 after a blind `--update` laundered a
//      494 → 529 raise into a green board; the a11y file had the same hole and no such rule.
//   2. CHAIN CONSISTENCY — each history step's `from` is the previous step's `value`, and the
//      declared `direction` must match the arithmetic (`seed` / `raised` / `lowered`). A raise
//      therefore cannot be dressed as a re-freeze.
//   3. A CEILING NAMES ITS EXIT — `retiredBy` is the command that replaces it with a reading.
//      A ceiling with no way out is a permanent hole, and ADR-970 is about exactly the kind of
//      gate people stop being able to satisfy.
//
// None of this loosens anything: every rule adds a failure mode, none removes one.
//
// Exit codes: 0 = the file is honest · 1 = it is not · 79 = could not look (unreadable or
// unparseable). 79 is the repo's PROBE_INDETERMINATE (see scripts/check-backlog.mjs): a guard
// that cannot look must never be mistaken for a guard that looked and approved.
//
// Usage: node scripts/check-a11y-baselines.mjs

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

export const FILE = join('test', 'e2e', 'a11y-baselines.json')

/** "I could not look." Mirrors PROBE_INDETERMINATE in scripts/check-backlog.mjs. */
export const INDETERMINATE = 79

/** How a ceiling came to hold its value. Mirrors test/e2e/a11y-ratchet.ts. */
export const DIRECTIONS = ['seed', 'lowered', 'raised']

/** A `why` shorter than this is a label, not a reason. The three real ones run 200+ chars. */
const MIN_WHY = 80

/** A provenance `reason` is one sentence; below this it is a shrug. */
const MIN_REASON = 24

/** `retiredBy` has to be a runnable-looking command, not "later". */
const MIN_RETIRED_BY = 12

/** A file that shrinks to a handful of contexts means a truncation or a broken merge, and a ✓
 *  printed over nothing is the one thing a gate must never do (ADR-962). */
const MIN_SURFACES = 40

const ALLOWED_CEILING_KEYS = new Set(['ceiling', 'why', 'retiredBy', 'frozen', 'history'])
const ALLOWED_CHANGE_KEYS = new Set(['at', 'value', 'from', 'direction', 'reason'])

const red = (s) => `\x1b[31m${s}\x1b[0m`
const green = (s) => `\x1b[32m${s}\x1b[0m`
const yellow = (s) => `\x1b[33m${s}\x1b[0m`
const dim = (s) => `\x1b[2m${s}\x1b[0m`

/** True for the object (ceiling) form. Kept byte-identical in intent to `isCeilingEntry` in
 *  test/e2e/a11y-ratchet.ts; test/e2e/a11y-ratchet.test.ts pins the two together so the static
 *  gate and the runtime gate can never disagree about which entries are exceptions. */
export function isCeilingEntry(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && 'ceiling' in value
}

const isCount = (n) => Number.isInteger(n) && n >= 0
const isIsoDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s))

/** The direction the arithmetic actually describes, independent of what was declared. */
function actualDirection(value, from) {
  if (from === null || from === undefined) return 'seed'
  if (value > from) return 'raised'
  if (value < from) return 'lowered'
  return null // a re-freeze at the same number records nothing and is not a change
}

function checkChange(change, at, problems) {
  if (typeof change !== 'object' || change === null || Array.isArray(change)) {
    problems.push(`${at}: not an object`)
    return
  }
  for (const key of Object.keys(change)) {
    if (!ALLOWED_CHANGE_KEYS.has(key)) problems.push(`${at}: unknown key "${key}"`)
  }
  if (!isIsoDate(change.at)) problems.push(`${at}.at: "${change.at}" is not a YYYY-MM-DD date`)
  if (!isCount(change.value)) problems.push(`${at}.value: "${change.value}" is not a count`)
  if (!(change.from === null || isCount(change.from))) {
    problems.push(`${at}.from: "${change.from}" is not a count or null`)
  }
  if (!DIRECTIONS.includes(change.direction)) {
    problems.push(`${at}.direction: "${change.direction}" is not one of ${DIRECTIONS.join('|')}`)
  }
  if (typeof change.reason !== 'string' || change.reason.trim().length < MIN_REASON) {
    problems.push(
      `${at}.reason: a number cannot move without a written reason (min ${MIN_REASON} chars). ` +
        `Got ${JSON.stringify(change.reason ?? null)}.`,
    )
  }
  // NOTE on `history[0].from`: it is null when the entry was seeded as a ceiling, and a NUMBER
  // when a bare reading was force-raised into one (the reading it replaced). Both are honest
  // starts, so neither is required — what is required is that the step's direction match its own
  // arithmetic, which is the rule below and the one a laundered raise has to get past.
  if (isCount(change.value) && (change.from === null || isCount(change.from))) {
    const actual = actualDirection(change.value, change.from)
    if (actual === null) {
      problems.push(`${at}: value ${change.value} is unchanged from ${change.from} — that records nothing`)
    } else if (DIRECTIONS.includes(change.direction) && change.direction !== actual) {
      problems.push(
        `${at}.direction: declared "${change.direction}" but ${change.from} → ${change.value} is a ` +
          `"${actual}". A raise cannot be filed as anything else.`,
      )
    }
  }
}

function sameChange(a, b) {
  return (
    a.at === b.at &&
    a.value === b.value &&
    (a.from ?? null) === (b.from ?? null) &&
    a.direction === b.direction &&
    a.reason === b.reason
  )
}

/**
 * Validate a parsed baselines document.
 * @returns {{ problems: string[], ceilings: Array<{ context: string, entry: object }>, readings: number }}
 */
export function validate(doc) {
  const problems = []
  const ceilings = []
  let readings = 0

  if (doc.$defaultMax !== undefined && !isCount(doc.$defaultMax)) {
    problems.push(`$defaultMax: "${doc.$defaultMax}" is not a count`)
  }

  const surfaces = doc.surfaces ?? {}
  const contexts = Object.keys(surfaces)
  if (contexts.length < MIN_SURFACES) {
    problems.push(
      `only ${contexts.length} context(s) (floor ${MIN_SURFACES}) — the file looks truncated, and a ` +
        'ratchet over nothing prints the same ✓ as a ratchet over everything',
    )
  }

  for (const context of contexts) {
    const value = surfaces[context]

    if (typeof value === 'number') {
      if (!isCount(value)) problems.push(`${context}: reading "${value}" is not a count`)
      else readings += 1
      continue
    }

    if (!isCeilingEntry(value)) {
      problems.push(
        `${context}: a baseline is either a bare integer (a READING, compared with equality) or a ` +
          'declared ceiling object {ceiling, why, retiredBy, frozen, history}. ' +
          `Got ${JSON.stringify(value)}.`,
      )
      continue
    }

    ceilings.push({ context, entry: value })
    const at = `${context}`

    for (const key of Object.keys(value)) {
      if (!ALLOWED_CEILING_KEYS.has(key)) problems.push(`${at}: unknown key "${key}"`)
    }
    for (const key of ALLOWED_CEILING_KEYS) {
      if (!(key in value)) problems.push(`${at}: a declared ceiling must carry "${key}"`)
    }

    if (!isCount(value.ceiling)) problems.push(`${at}.ceiling: "${value.ceiling}" is not a count`)

    if (typeof value.why !== 'string' || value.why.trim().length < MIN_WHY) {
      problems.push(
        `${at}.why: a ceiling is a weaker claim than a reading, so it has to say what is missing ` +
          `before it can become one (min ${MIN_WHY} chars).`,
      )
    }

    if (typeof value.retiredBy !== 'string' || value.retiredBy.trim().length < MIN_RETIRED_BY) {
      problems.push(
        `${at}.retiredBy: name the command that replaces this ceiling with a reading. A ceiling ` +
          'with no exit is a permanent hole in the gate.',
      )
    }

    checkChange(value.frozen, `${at}.frozen`, problems)

    // RULE 1 — provenance integrity. This is the hand-edit guard: bump `ceiling` and leave
    // `frozen` alone and the gate fails instead of quietly widening the hole.
    if (isCount(value.ceiling) && isCount(value.frozen?.value) && value.frozen.value !== value.ceiling) {
      problems.push(
        `${at}: ceiling ${value.ceiling} but frozen.value ${value.frozen.value}. The number moved ` +
          'without a reason being written. Record the change in frozen + history, or put it back.',
      )
    }

    if (!Array.isArray(value.history) || value.history.length === 0) {
      problems.push(`${at}.history: every value this entry has held, oldest first. Cannot be empty.`)
      continue
    }

    // RULE 2 — chain consistency.
    value.history.forEach((change, i) => {
      checkChange(change, `${at}.history[${i}]`, problems)
      if (i > 0) {
        const prev = value.history[i - 1]
        if (isCount(prev?.value) && (change?.from ?? null) !== prev.value) {
          problems.push(
            `${at}.history[${i}].from: ${JSON.stringify(change?.from ?? null)} does not follow ` +
              `history[${i - 1}].value ${prev.value} — the chain is broken, so no step is attributable`,
          )
        }
      }
    })

    const last = value.history[value.history.length - 1]
    if (typeof value.frozen === 'object' && value.frozen !== null && typeof last === 'object' && last !== null) {
      if (!sameChange(last, value.frozen)) {
        problems.push(
          `${at}: frozen does not match history.at(-1). The current value and the record of how it ` +
            'got there have to be the same statement.',
        )
      }
    }
  }

  return { problems, ceilings, readings }
}

// ── main ──────────────────────────────────────────────────────────────────────────────────────

function main() {
  if (!existsSync(FILE)) {
    console.error(red(`✗ ${FILE} is missing. The accessibility ratchet has no baselines to hold.`))
    return 1
  }
  let doc
  try {
    doc = JSON.parse(readFileSync(FILE, 'utf8'))
  } catch (err) {
    console.error(yellow(`? ${FILE} could not be parsed (${err.message}). Not a verdict.`))
    return INDETERMINATE
  }
  if (typeof doc !== 'object' || doc === null || typeof doc.surfaces !== 'object' || doc.surfaces === null) {
    console.error(yellow(`? ${FILE} has no "surfaces" object. Nothing to judge; not a verdict.`))
    return INDETERMINATE
  }

  const { problems, ceilings, readings } = validate(doc)

  if (problems.length > 0) {
    console.error(red(`✗ a11y baselines: ${problems.length} problem(s) in ${FILE}\n`))
    for (const p of problems) console.error(`   ${p}`)
    console.error(
      dim(
        '\n   A bare integer is a READING and is checked with equality — an improvement fails too,\n' +
          '   which is what gets the win written down. Weaken one to a ceiling only when nothing has\n' +
          '   measured the surface honestly, and pay for it with a written reason.\n',
      ),
    )
    return 1
  }

  console.log(green(`✓ a11y baselines: ${readings} reading(s) held to equality, ${ceilings.length} declared ceiling(s).`))
  for (const { context, entry } of ceilings) {
    console.log(yellow(`   ⚠ ceiling ${entry.ceiling} — ${context}`))
    console.log(dim(`      ${entry.frozen.at} · ${entry.frozen.direction} · ${entry.frozen.reason}`))
    console.log(dim(`      retire with: ${entry.retiredBy}`))
  }
  if (ceilings.length > 0) {
    console.log(
      dim(
        '\n   Every ceiling is headroom a real regression can sit in while this prints a tick.\n' +
          '   They stay listed here until a run replaces them with readings.\n',
      ),
    )
  }
  return 0
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exit(main())
}
