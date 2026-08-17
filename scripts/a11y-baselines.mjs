#!/usr/bin/env node
// Merge an accessibility CAPTURE run into test/e2e/a11y-baselines.json.
//
// Why this exists rather than a hand-written table: a ratchet is only worth having if its
// numbers came from the thing it guards. A hand-typed baseline is a guess, and a guessed
// baseline is a lie that survives in version control. So the suite writes what it actually
// observed (PW_A11Y_UPDATE=1 → one JSON line per context) and this merges those lines.
//
// The merge is deliberately ASYMMETRIC:
//   · a count that FELL is written down     — progress is locked in immediately
//   · a count that ROSE is REFUSED          — that is a regression, and the run should have
//                                             failed; silently accepting it would launder a
//                                             regression into the baseline
//
// ── READINGS, CEILINGS, AND WHAT A RAISE NOW COSTS (2026-08-17, ADR-1058) ─────────────────
// A bare integer in the baselines file is a READING: the runtime gate asserts EQUALITY against
// it, so an improvement fails as loudly as a regression and the win has to be re-recorded here.
// A ceiling — the weaker `<=` claim — is an object carrying `why`, `retiredBy` and provenance,
// and it exists for exactly one situation: nobody has measured the surface honestly yet.
//
// That changes two things about this script:
//
//   · A CAPTURE RETIRES A CEILING. Once a real run has measured a context, the ceiling has done
//     its job and the object is replaced with the bare integer that was observed. That is the
//     whole intended life of /feed's 12, /settings' 7 and /spaces/<slug>/manage's 8.
//   · A RAISE COSTS A WRITTEN REASON. `--force` alone used to be enough, with "say why in the
//     commit" as the only convention — and a convention is not a gate, which is precisely the
//     complaint scripts/adoption-baselines.json answered in March by making every raise carry
//     `frozen.reason`. `--force` now REQUIRES `--reason "<why>"`, and the accepted number lands
//     as a DECLARED ceiling carrying that reason, flagged on every subsequent
//     `pnpm check:a11y-baselines` run until a capture brings it back down.
//
// Usage:
//   PW_A11Y_UPDATE=1 pnpm exec playwright test --grep @a11y      # capture
//   node scripts/a11y-baselines.mjs                              # merge
//
// Flags: --force --reason "<why>"   accept a RISE, recorded as a ceiling with that reason
//        --prune                    retire entries this run did not observe (after a COMPLETE run)

import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { isCeilingEntry } from './check-a11y-baselines.mjs'

const OBSERVED = join('test', 'e2e', '.a11y-observed.jsonl')
const BASELINES = join('test', 'e2e', 'a11y-baselines.json')

/** Printed into every ceiling this script writes, so the exception names its own exit. */
const RETIRE_CMD = 'PW_A11Y_UPDATE=1 pnpm test:e2e:a11y && pnpm a11y:baselines'

/** Matches MIN_REASON in check-a11y-baselines.mjs — the gate would reject anything shorter, and
 *  a script that writes a file its own guard rejects is worse than one that refuses up front. */
const MIN_REASON = 24

const args = process.argv.slice(2)
const force = args.includes('--force')
const prune = args.includes('--prune')
const reason = args.includes('--reason') ? (args[args.indexOf('--reason') + 1] ?? '') : ''

const today = () => new Date().toISOString().slice(0, 10)

/** The number an entry currently holds, whichever form it is in. */
function valueOf(entry) {
  return isCeilingEntry(entry) ? entry.ceiling : entry
}

/** Build the ceiling object a forced number lands as. Keeps any prior history so the chain of
 *  who-raised-what-when survives the write. */
function asCeiling(existing, value, from, direction, why) {
  const change = { at: today(), value, from, direction, reason }
  const history = isCeilingEntry(existing) ? [...existing.history, change] : [change]
  return { ceiling: value, why, retiredBy: RETIRE_CMD, frozen: change, history }
}

if (force && reason.trim().length < MIN_REASON) {
  console.error(
    `✗ --force now requires --reason "<why>" (at least ${MIN_REASON} characters).\n` +
      '  A forced number is debt the ratchet stopped guarding, and it stays in this file until\n' +
      '  somebody fixes the surface. "Say why in the commit" was the old rule, and a commit\n' +
      '  message is not something check:a11y-baselines can read. The reason goes in the file.',
  )
  process.exit(1)
}

if (!existsSync(OBSERVED)) {
  console.error(
    `✗ No capture found at ${OBSERVED}.\n` +
      `  Run: PW_A11Y_UPDATE=1 pnpm exec playwright test --grep @a11y (with PW_BASE_URL set)`,
  )
  process.exit(1)
}

const observed = new Map()
for (const line of readFileSync(OBSERVED, 'utf8').split('\n')) {
  const trimmed = line.trim()
  if (!trimmed) continue
  let row
  try {
    row = JSON.parse(trimmed)
  } catch {
    continue
  }
  if (typeof row?.context !== 'string' || typeof row?.total !== 'number') continue
  // A context can appear twice when Playwright retries; the LAST write is the one that counts.
  observed.set(row.context, row.total)
}

if (observed.size === 0) {
  console.error('✗ The capture file held no usable rows. Nothing merged.')
  process.exit(1)
}

const doc = JSON.parse(readFileSync(BASELINES, 'utf8'))
doc.surfaces ??= {}

const fell = []
const rose = []
const added = []
const retired = []

for (const [context, total] of [...observed].sort(([a], [b]) => a.localeCompare(b))) {
  const existing = doc.surfaces[context]
  const current = valueOf(existing)

  if (current === undefined) {
    // A NEW context used to be written at whatever debt it happened to carry, exit 0 --
    // which quietly contradicted the suite's own rule that "a new surface joins at zero
    // tolerance" ($defaultMax). That made the rise-guard below reachable only by contexts
    // that already existed: any amount of debt could enter the file simply by arriving
    // under a name nobody had frozen yet. A new context above the default is now a RISE
    // and takes the same --force as any other.
    if (total > (doc.$defaultMax ?? 0)) {
      added.push([context, total])
      if (force) {
        doc.surfaces[context] = asCeiling(
          existing,
          total,
          null,
          'seed',
          'Not a reading. Seeded above $defaultMax by a forced merge on ' +
            `${today()}: the number was measured, but admitting debt on a surface joining the ` +
            'suite is a decision, not an observation, so it lands as a ceiling carrying the ' +
            `reason it was accepted for. ${reason}`,
        )
      }
    } else {
      doc.surfaces[context] = total
    }
  } else if (total < current) {
    fell.push([context, current, total])
    // A fall always writes a bare integer: it came from a real capture, so it is a READING.
    // If this context was a ceiling, that ceiling has now been measured and is retired.
    if (isCeilingEntry(existing)) retired.push([context, current, total])
    doc.surfaces[context] = total
  } else if (total > current) {
    rose.push([context, current, total])
    if (force) {
      doc.surfaces[context] = asCeiling(
        existing,
        total,
        current,
        'raised',
        'Not a reading. Raised by a forced merge on ' +
          `${today()}: a regression was accepted rather than fixed, so this number is what the ` +
          'surface is ALLOWED to carry, not a value anyone has defended. Every unit above the ' +
          `previous ${current} is headroom an unrelated violation can hide in (ADR-980). ${reason}`,
      )
    }
  } else if (isCeilingEntry(existing)) {
    // Measured, and it matched. The ceiling existed only because nobody had measured this
    // surface — somebody just did, so it becomes the reading it was always a placeholder for.
    retired.push([context, current, total])
    doc.surfaces[context] = total
  }
}

// Contexts in the file that this run did not observe. They are NOT dropped by default:
// a capture that died halfway through would otherwise delete every context it never reached,
// quietly erasing debt and re-freezing those surfaces at zero on the next run. Retiring a
// surface is a deliberate act, so it takes --prune.
const unobserved = Object.keys(doc.surfaces).filter((context) => !observed.has(context))
if (prune) for (const context of unobserved) delete doc.surfaces[context]

if ((rose.length > 0 || added.length > 0) && !force) {
  if (rose.length > 0) {
    console.error(`✗ ${rose.length} context(s) REGRESSED. Baselines not raised:`)
    for (const [context, from, to] of rose) console.error(`    ${context}: ${from} → ${to}`)
  }
  if (added.length > 0) {
    console.error(
      `✗ ${added.length} NEW context(s) carry debt above $defaultMax ${doc.$defaultMax ?? 0}.` +
        ' Not seeded:',
    )
    for (const [context, total] of added) console.error(`    ${context}: ${total}`)
    console.error(
      '\n  A new surface joins at zero tolerance. Either fix it before adding it, or seed the\n' +
        '  debt deliberately with --force --reason "<why>". The reason is written INTO the file,\n' +
        '  as a declared ceiling, because that is the only place a gate can read it.',
    )
  }
  if (rose.length > 0) {
    console.error(
      '\n  Fix the regression, or re-run with --force --reason "<why>". A forced rise lands as a\n' +
        '  DECLARED ceiling and is printed by check:a11y-baselines on every run until it comes down.',
    )
  }
  process.exit(1)
}

writeFileSync(BASELINES, JSON.stringify(doc, null, 2) + '\n')
unlinkSync(OBSERVED)

const clean = [...observed.values()].filter((n) => n === 0).length
console.log(`✓ a11y baselines merged: ${observed.size} context(s), ${clean} already clean.`)
if (unobserved.length > 0) {
  console.log(
    prune
      ? `    − retired ${unobserved.length} context(s) this run did not visit.`
      : `    · kept ${unobserved.length} context(s) this run did not visit (--prune to retire them).`,
  )
}
for (const [context, total] of added) console.log(`    + ${context}: ${total}`)
for (const [context, from, to] of fell) console.log(`    ↓ ${context}: ${from} → ${to} (improved)`)
for (const [context, from, to] of retired) {
  console.log(`    ✓ ${context}: ceiling ${from} RETIRED — now a reading of ${to}`)
}
if (rose.length > 0) for (const [context, from, to] of rose) console.log(`    ↑ ${context}: ${from} → ${to} (FORCED)`)
