#!/usr/bin/env node
// THE VENDORED DAWN BUNDLE IS A PHOTOCOPY, AND NOTHING MEASURED WHETHER IT WAS THE CURRENT ONE.
//
// `design_handoff/dawn/` is a snapshot of the external Claude Design project, copied in by hand.
// `design_handoff/CHANGES.md` is DAWN's reply for a round. The two are separate artifacts and they
// are allowed to be at different rounds — the reply is prose the owner pastes back, the bundle is a
// file export that has to be copied separately. Nothing noticed when only one of them arrived.
//
// WHAT WENT WRONG, 2026-08-25. CHANGES.md landed describing the 2026-08-25 round: five colour
// corrections applied value-for-value, four hero legibility rungs drawn into `tokens/effects.css`,
// `data-hero-zone` emitted by `ui_kits/marketing/sections.jsx`, a new `guidelines/on-media.card.html`.
// The bundle did not land. Every one of those files is still the 2026-08-03 export, and
// `on-media.card.html` never arrived at all. So:
//
//   • `lib/theme/dawn-divergence.test.ts` reads `tokens/colors.css` and was GREEN, because the
//     divergences it found equalled the divergences it declared. Green did not mean "the two agree";
//     it meant "they disagree in the eight declared ways". Read as freshness, it says the opposite
//     of what is true.
//   • `design_handoff/PROD-AHEAD.md` — the sheet the next outbound handoff copies — therefore still
//     asks DAWN to apply five corrections DAWN APPLIED THREE WEEKS AGO. That is the stale-row failure
//     the divergence test's own header describes (`--color-text-on-primary`, eleven days), recurring
//     one level up: not a stale row in the sheet, a stale FILE under the whole sheet.
//
// SO THIS GUARD MEASURES THE ONE THING NEITHER OF THOSE COULD: whether the bundle on disk is the
// round CHANGES.md is talking about. It fails BOTH ways, which is the only useful shape:
//
//   1. The bundle is declared STALE and a round marker APPEARS → someone re-exported the bundle and
//      did not update this declaration, the divergence ledger, or the sheet. This is the dangerous
//      direction: a refreshed `colors.css` closes five declared divergences, and a sheet that still
//      lists them would ask DAWN to re-apply what it already has, or worse, be "reconciled" by
//      putting DAWN's old values back into `app/globals.css` and un-fixing three AA failures.
//   2. The bundle is declared FRESH and a round marker is MISSING → the export is partial, exactly
//      like the round this guard was written for.
//
// It never asserts "the bundle is up to date", because it is not, and a guard that cannot fire
// honestly gets routed around and then reads as coverage (ADR-970). The staleness is tracked as a
// backlog row with an owner action; this file's job is to keep the DECLARATION true.

import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const BUNDLE = join(ROOT, 'design_handoff', 'dawn')
const CHANGES_PATH = join(ROOT, 'design_handoff', 'CHANGES.md')
const SHEET_PATH = join(ROOT, 'design_handoff', 'PROD-AHEAD.md')

/** The round `design_handoff/CHANGES.md` describes. Parsed from its H1 and asserted below. */
export const CHANGES_ROUND = '2026-08-25'

/**
 * The round the vendored bundle actually is. NOT a guess: every marker below was checked against
 * the files on 2026-08-25 and every one was absent, while the same files carry the 2026-08-03
 * values (e.g. `--color-focus-ring: #E2912F`, the pre-correction brand amber).
 *
 * WHEN THE BUNDLE IS RE-EXPORTED, set this to CHANGES_ROUND in the SAME change that updates
 * `lib/theme/dawn-divergence.test.ts`'s ledger and `design_handoff/PROD-AHEAD.md`. All three move
 * together or none of them do.
 */
export const BUNDLE_ROUND = '2026-08-03'

/** True when the bundle on disk is the round CHANGES.md describes. */
export const bundleIsCurrent = () => BUNDLE_ROUND === CHANGES_ROUND

/**
 * Strings the 2026-08-25 round says it wrote into named bundle files. Each is quoted from
 * CHANGES.md's own change tables, so this is DAWN's claim about its own export, not our summary of
 * it. A marker is chosen to be unmistakable: it appears only if that round's change is present.
 */
export const ROUND_MARKERS = [
  {
    file: 'tokens/effects.css',
    marker: 'hero-zone',
    proves: 'the four hero legibility rungs (§Q2b) — 0 nothing, 1 halo, 2 halo + plate, 3 strong plate',
  },
  {
    file: 'ui_kits/marketing/sections.jsx',
    marker: 'data-hero-zone',
    proves: 'PageHero emitting the lockup and actions zones (§Q2b)',
  },
  {
    file: 'tokens/colors.css',
    marker: 'on-media',
    proves: 'the on-media family added in §2, and the Q2 mechanism documented on that block',
  },
  {
    file: 'ui_kits/app/index.html',
    marker: 'runs all season',
    proves: 'the beta-window banner rewrite (§9 copy table)',
  },
  {
    file: 'ui_kits/marketing/beta.jsx',
    marker: 'Funnel induction',
    proves: 'the Funnels rename residue fix (§9b, ADR-1090)',
  },
  {
    file: 'ui_kits/app/nav-rail.jsx',
    marker: 'admin-operations',
    proves: 'the five nav-rail key fixes confirmed against NAV_AREAS (§7a Q4b)',
  },
]

/**
 * Bundle-relative paths CHANGES.md names that are NOT in the vendored copy.
 *
 * Declared, not tolerated. The check fails if one of these ARRIVES (the declaration is then stale)
 * or if any other named path goes missing. `on-media.card.html` is DAWN's new Foundations · Color
 * card; CHANGES.md §Q2b says it was created, and it is the one file of this round that is absent by
 * existence rather than by content.
 */
export const DECLARED_ABSENT = ['guidelines/on-media.card.html']

/** Every top-level folder a bundle path can start with. Distinguishes DAWN paths from repo paths. */
const BUNDLE_ROOTS = [
  'tokens',
  'ui_kits',
  'templates',
  'guidelines',
  'components',
  'assets',
  'public',
]

/** Bundle-relative paths CHANGES.md names in backticks. Pure, so the test can exercise it. */
export function bundlePathsNamedIn(changesMd) {
  const roots = BUNDLE_ROOTS.join('|')
  const re = new RegExp('`((?:' + roots + ')\\/[A-Za-z0-9._/-]+)`', 'g')
  return [...new Set([...changesMd.matchAll(re)].map((m) => m[1]))].sort()
}

/** The round date in CHANGES.md's H1, or null. Pure. */
export function roundOf(changesMd) {
  const m = changesMd.match(/^#\s.*?(\d{4}-\d{2}-\d{2})/m)
  return m ? m[1] : null
}

// ── Runner ─────────────────────────────────────────────────────────────────────────────────────
const red = (s) => `\x1b[31m${s}\x1b[0m`
const green = (s) => `\x1b[32m${s}\x1b[0m`
const yellow = (s) => `\x1b[33m${s}\x1b[0m`

/**
 * Runs every assertion and returns `{ failures, notes }`. Separated from process.exit so the test
 * can call it directly rather than spawning a second node — `check:backlog`'s meta-guard (LIVE-034)
 * exists because probes that spawn runners are what made the suite cost 24 seconds.
 */
export function run() {
  const failures = []
  const notes = []

  for (const [label, p] of [
    ['design_handoff/CHANGES.md', CHANGES_PATH],
    ['design_handoff/PROD-AHEAD.md', SHEET_PATH],
  ]) {
    if (!existsSync(p)) failures.push(`${label} is missing — the bundle cannot be checked against it.`)
  }
  if (failures.length) return { failures, notes }

  const changes = readFileSync(CHANGES_PATH, 'utf8')
  const sheet = readFileSync(SHEET_PATH, 'utf8')

  // 1. The declaration tracks the reply. A new CHANGES.md means the markers below describe a round
  //    that is no longer the current one, and every assertion after this is about the wrong thing.
  const round = roundOf(changes)
  if (round !== CHANGES_ROUND) {
    failures.push(
      `CHANGES.md is the ${round ?? 'unparseable'} round; this guard declares ${CHANGES_ROUND}.\n` +
        `    A NEW ROUND ARRIVED. Re-derive ROUND_MARKERS and DECLARED_ABSENT from the new\n` +
        `    CHANGES.md, set CHANGES_ROUND, and say whether the bundle came with it.`,
    )
    return { failures, notes }
  }

  // 2. Arrival. Every bundle path the reply names is present, except the declared-absent ones —
  //    and a declared-absent path that has ARRIVED fails, because the declaration is then a lie.
  const named = bundlePathsNamedIn(changes)
  if (named.length < 10) {
    failures.push(
      `only ${named.length} bundle paths parsed out of CHANGES.md — the scan looks broken, and a\n` +
        `    green over an empty scan is the failure this guard is for (ADR-962).`,
    )
  }
  const absent = new Set(DECLARED_ABSENT)
  const missing = named.filter((p) => !absent.has(p) && !existsSync(join(BUNDLE, p)))
  const resurrected = DECLARED_ABSENT.filter((p) => existsSync(join(BUNDLE, p)))

  for (const p of missing) {
    failures.push(
      `CHANGES.md names \`${p}\` but it is not in design_handoff/dawn/.\n` +
        `    Either the export was partial, or add it to DECLARED_ABSENT with the reason.`,
    )
  }
  for (const p of resurrected) {
    failures.push(
      `\`${p}\` is declared absent but EXISTS. The declaration is stale — drop it from\n` +
        `    DECLARED_ABSENT in the same change that brought the file in.`,
    )
  }

  // 3. Round markers, in whichever direction the declaration claims.
  for (const { file, marker, proves } of ROUND_MARKERS) {
    const p = join(BUNDLE, file)
    if (!existsSync(p)) {
      failures.push(`ROUND_MARKERS names \`${file}\`, which is not in the bundle at all.`)
      continue
    }
    const present = readFileSync(p, 'utf8').includes(marker)
    if (bundleIsCurrent() && !present) {
      failures.push(
        `\`${file}\` does not contain "${marker}".\n` +
          `    The bundle is declared CURRENT (${BUNDLE_ROUND}), so it must carry ${proves}.\n` +
          `    Either the export was partial, or the bundle is not current after all.`,
      )
    }
    if (!bundleIsCurrent() && present) {
      failures.push(
        `\`${file}\` NOW CONTAINS "${marker}" — the bundle has been re-exported.\n` +
          `    🔴 THE DECLARATION AND THE LEDGER MUST MOVE WITH IT, IN THIS CHANGE:\n` +
          `      1. set BUNDLE_ROUND = '${CHANGES_ROUND}' here;\n` +
          `      2. re-derive the ledger in lib/theme/dawn-divergence.test.ts — a refreshed\n` +
          `         colors.css closes five declared divergences and that test will say which;\n` +
          `      3. rewrite design_handoff/PROD-AHEAD.md so it stops asking DAWN to apply\n` +
          `         corrections DAWN has already applied.\n` +
          `    Do NOT reconcile by moving DAWN's values into app/globals.css: three of the five\n` +
          `    are AA fixes production measured, and DAWN took production's value on purpose.`,
      )
    }
  }

  // 4. While the bundle is behind, the sheet has to say so. PROD-AHEAD.md is the artifact the next
  //    outbound handoff copies verbatim; if it reads as current while resting on a stale file, the
  //    next round re-sends five applied corrections.
  if (!bundleIsCurrent() && !sheet.includes(CHANGES_ROUND)) {
    failures.push(
      `design_handoff/PROD-AHEAD.md does not mention the ${CHANGES_ROUND} round.\n` +
        `    The bundle it is derived from is the ${BUNDLE_ROUND} export, so the sheet must carry\n` +
        `    the note that those corrections are already applied and must not be sent again.`,
    )
  }

  if (!bundleIsCurrent()) {
    notes.push(
      `bundle is the ${BUNDLE_ROUND} export; CHANGES.md is the ${CHANGES_ROUND} round.\n` +
        `    That gap is DECLARED and tracked — re-exporting design_handoff/dawn/ is an owner step.`,
    )
  }

  return { failures, notes }
}

const invokedDirectly = process.argv[1] && process.argv[1].endsWith('check-dawn-bundle.mjs')
if (invokedDirectly) {
  const { failures, notes } = run()
  for (const n of notes) console.log(yellow(`⚠️  ${n}`))
  if (failures.length) {
    console.error(red(`\n✗ DAWN bundle contract: ${failures.length} problem(s)\n`))
    for (const f of failures) console.error(red(`  • ${f}\n`))
    process.exit(1)
  }
  console.log(
    green(
      `✓ DAWN bundle contract: ${ROUND_MARKERS.length} round markers and ` +
        `${DECLARED_ABSENT.length} declared-absent path(s) all match the declaration.`,
    ),
  )
}
