#!/usr/bin/env node
// Embeddable-elements contract check (ADR-792 · docs/EMBEDDABLE-ELEMENTS.md).
//
// Every reusable in-product element (the Loom picker today; QR Studio / Email editor / CRM board
// next) is ONE canonical app: its features + role gates live in the SINGLE catalog
// lib/elements/registry.ts (ELEMENTS: ElementDef[]), and its config table element_settings is
// read/written through the SINGLE store lib/elements/store.ts. No surface may hand-roll a parallel
// catalog or reach the config table directly.
//
// ⚠️ THERE IS NO COMPONENT MAP AND NO <AppElement> MOUNTER, and this header used to say there was.
// Both were deleted 2026-08-12 (the mounter had been gone for longer; components/elements/registry.tsx
// and its vitest drift guard went with it), because nothing ever imported them — every consumer
// imports the pure catalog directly and mounts its own component. The invariant they were built to
// hold is holding anyway without them: LoomPicker has one definition across 8 surfaces and
// StyleEditor one across 7, zero forks. Do not re-add a map on the strength of this comment; read
// docs/EMBEDDABLE-ELEMENTS.md §2, which records the decision.
//
// This coarse, FILE-LEVEL static guard fails a PR that (a) declares a SECOND ElementDef[] catalog
// outside the registry, or (b) touches the element_settings table outside the store. That is the
// whole of the mechanical enforcement now — there is no runtime lock-step test behind it, so a
// catalog entry with no component anywhere is invisible to CI. Mirrors scripts/check-menu.mjs (the
// admin-menu twin, ADR-553).
//
// Escape hatch: an inline `// element-ok: <reason>` comment on the flagged line, or add the file to an
// ALLOWLIST below WITH a reason.
//
// ⚠️ WHERE THIS RUNS (changed 2026-08-12). No longer a `check:*` entry in the CI guards array: it is
// enforced by scripts/check-elements.test.ts, which vitest AUTO-DISCOVERS, so it cannot be forgotten
// in an array the way check:studio was for the whole life of PR #2098. Still runnable by hand —
// `node scripts/check-elements.mjs` — for the friendly report. Exits 1 on violation.
//
// ────────────────────────────────────────────────────────────────────────────────────────────────
// SECOND CONTRACT, added 2026-08-17: THE UI-PRIMITIVE STATE-TEST RATCHET (Lift 8d).
//
// ⚠️ NAME COLLISION, ACKNOWLEDGED RATHER THAN QUIETLY FIXED. "Element" means two unrelated things
// in this repo. Everything above is the EMBEDDABLE-ELEMENTS contract (ADR-792): one catalog, one
// store. Everything below is about `components/ui/*` PRIMITIVES and their interaction states
// (docs/INTERACTION-STATES.md). They share a file because UX-MATURITY-PLAN Lift 8d says in so many
// words "extend `check:elements` (the existing element-contract script)", and because that buys the
// state ratchet the one property it most needs: scripts/check-elements.test.ts is auto-discovered
// by vitest, so unlike a `check:*` array entry it cannot be dropped from CI by editing a list.
// Do NOT merge the two sections' vocabularies; they are neighbours, not relatives.
//
// WHAT IT ENFORCES. A NEW `components/ui/*.tsx` primitive must ship a colocated state test, else
// this exits 1. Per docs/INTERACTION-STATES.md §6 the machine-checkable proxy is: some
// `components/ui/*.test.tsx` imports the primitive's module AND names at least
// MIN_NAMED_STATES of the nine §1 states in its own describe/it TITLES. Titles only, on purpose —
// a `.press` inside a className assertion exercises a state, it does not name one, and naming is
// what §6 asks for. (Empirically the cut is also where the false positives stop: avatar.test.tsx
// says "focus" about a focal POINT and ".dimmed" about a receded avatar, and lands at 2.)
//
// PRE-EXISTING DEBT IS FROZEN, NOT SWEPT. 36 of 42 primitives had no state test on 2026-08-17.
// They are listed in scripts/ui-state-test-ledger.txt, the same shape of ratchet as
// scripts/templates-baseline.txt and scripts/admin-client-baseline.txt: a SET of paths, not a
// count, so one primitive gaining a test and one arriving without one can never net to zero.
//
// STRICTER THAN ITS TWO SIBLINGS, DELIBERATELY. check:templates and check:admin-client only
// *report* a ledger entry that no longer qualifies. Here a graduated entry FAILS, because the
// number this ledger carries is a published metric (INTERACTION-STATES §5) and an un-banked win
// makes it fiction — the same "fails both ways" rule `pnpm check:backlog` applies to a row whose
// probe has started passing. The fix is one command, `--update`, and the diff shows the shrink.
//
//   node scripts/check-elements.mjs                                   # report + gate
//   node scripts/check-elements.mjs --update                          # bank a shrink
//   node scripts/check-elements.mjs --update --allow-raise --reason="why"   # grandfather one more
// ────────────────────────────────────────────────────────────────────────────────────────────────

import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const ROOTS = ['lib', 'app', 'components']
const ANNOTATION = '// element-ok:'

// The ONLY file allowed to DECLARE the element catalog (ElementDef[]).
const CATALOG_SOURCE = 'lib/elements/registry.ts'
// The ONLY file allowed to reach the element_settings table.
const STORE_SOURCE = 'lib/elements/store.ts'

// (a) A hand-rolled parallel element catalog: `const XXX: (readonly )?ElementDef[]`, but ONLY in a file
//     that imports OUR ElementDef from lib/elements/registry — an unrelated local type of the same name
//     (e.g. lib/library/element-catalog.ts's illustration ElementDef) is not our catalog and is fine.
const ELEMENT_CATALOG = /\bconst\s+[A-Za-z_][A-Za-z0-9_]*\s*:\s*(readonly\s+)?ElementDef\s*\[\]/
// A file "uses our catalog type" iff it imports ElementDef from the elements registry module.
const IMPORTS_REGISTRY_ELEMENTDEF = /import[^;]*\bElementDef\b[^;]*from\s*['"][^'"]*elements\/registry['"]/
// (b) A direct element_settings table access outside the store: `.from('element_settings')`.
const TABLE_ACCESS = /\.from\(\s*['"]element_settings['"]\s*\)/

function walk(dir) {
  const out = []
  if (!existsSync(dir)) return out
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules') continue
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...walk(p))
    else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(p)
  }
  return out
}

/** Pure classifier — exported so the companion test can import it (see scripts/check-elements.test.ts).
 *  Returns the list of {line, kind, text} violations in one file's source. */
export function elementViolations(file, src) {
  const lines = src.split('\n')
  const usesOurCatalogType = IMPORTS_REGISTRY_ELEMENTDEF.test(src)
  const out = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.includes(ANNOTATION)) continue
    if (ELEMENT_CATALOG.test(line) && usesOurCatalogType && file !== CATALOG_SOURCE) {
      out.push({ line: i + 1, kind: 'parallel-catalog', text: line.trim() })
    } else if (TABLE_ACCESS.test(line) && file !== STORE_SOURCE) {
      out.push({ line: i + 1, kind: 'table-access', text: line.trim() })
    }
  }
  return out
}

/** The scanned corpus. Exported so the vitest guard asserts the SAME number the CLI floors on,
 *  rather than a re-derived approximation of it. */
export function scannedFiles() {
  return ROOTS.flatMap(walk)
}

export function runCheck() {
  const files = ROOTS.flatMap(walk)
  const violations = []
  for (const f of files) {
    for (const v of elementViolations(f, readFileSync(f, 'utf8'))) violations.push({ file: f, ...v })
  }
  return violations
}

/** A gate that scans nothing reports a clean bill of health, and this one prints no count at all,
 *  so an under-scan is invisible. `walk()` returns [] for a missing root without complaint. The
 *  floor sits well under the live corpus (~3274 on 2026-08-10) and far above zero, so it fires on
 *  a broken read rather than on growth. Same pattern as MIN_ROWS in check-gate-parity.mjs. */
export const MIN_SCANNED_FILES = 1500

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// The UI-primitive state-test ratchet (Lift 8d · docs/INTERACTION-STATES.md §6).
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/** The kit. Flat by design — there are no subdirectories under components/ui today, and a
 *  primitive that grew one would be a component folder, not a primitive. */
export const UI_DIR = join('components', 'ui')

/** The ONLY ledger of primitives allowed to ship without a state test. One path per line, sorted,
 *  `#` comments ignored. Same file format as scripts/templates-baseline.txt. */
export const UI_STATE_LEDGER_FILE = join('scripts', 'ui-state-test-ledger.txt')

/** The nine INTERACTION-STATES §1 states, each with the strings that NAME it in a test title.
 *
 *  Two vocabulary calls worth the reader's time:
 *  · `skeleton` is NOT a synonym for `loading`, even though Skeleton *is* the loading surface.
 *    A test for skeleton.tsx says "Skeleton" in every title because that is the component's name;
 *    counting it would let a primitive earn a state by being called after one.
 *  · `focus` covers focus-visible without demanding the hyphenated form, which no existing title
 *    uses. It is the loosest entry here, and it is why MIN_NAMED_STATES is 3 rather than 2:
 *    avatar.test.tsx's "takes an explicit focus over the one carried in the URL" is a focal POINT,
 *    and it is the exact false positive a 2-state threshold would have admitted. */
export const STATE_VOCABULARY = Object.freeze({
  rest: /\brest\b/i,
  hover: /\bhover/i,
  pressed: /\bpress(?:ed|es)?\b/i,
  'focus-visible': /\bfocus/i,
  loading: /\bloading\b|aria-busy|\bbusy\b/i,
  empty: /\bempty\b|\bzero\b/i,
  error: /\berror\b|aria-invalid|\binvalid\b/i,
  disabled: /\bdisabled\b|\bunavailable\b|\binert\b/i,
  'optimistic-pending': /\bpending\b|\bdimmed\b|\boptimistic\b/i,
})

/** How many distinct §1 states a colocated test must NAME before it counts as a state test.
 *
 *  Grounded in §2, not chosen for a green run: the two classes this gate actually protects require
 *  well over three states each — an Action control owes rest · hover · pressed · focus · loading ·
 *  disabled (6), a Field owes rest · focus · error · disabled (4). Three is the floor that both
 *  clear with room and that no title-echo reaches by accident.
 *
 *  It is deliberately ABOVE what the quiet classes owe (a Display badge owes only `rest`), so those
 *  live on the ledger with a reason. The gate can only ever over-report — call a primitive
 *  undertested — never certify an untested one as covered. Same direction of error as
 *  check-templates.mjs, and for the same reason. */
export const MIN_NAMED_STATES = 3

/** Every `describe` / `it` / `test` title in a source file, as raw strings.
 *  Handles ', " and ` delimiters and escaped delimiters inside the title. */
export function testTitles(src) {
  const re = /\b(?:describe|it|test)(?:\.\w+)?\s*\(\s*(['"`])((?:\\.|(?!\1)[\s\S])*?)\1/g
  return [...src.matchAll(re)].map((m) => m[2])
}

/** Which of the nine states a test file NAMES, read from its titles only. */
export function statesNamed(src) {
  const titles = testTitles(src).join(' \u2022 ')
  return Object.entries(STATE_VOCABULARY)
    .filter(([, re]) => re.test(titles))
    .map(([name]) => name)
}

/** Is this test file a STATE test at all (regardless of what it covers)? */
export function isStateTest(src) {
  return statesNamed(src).length >= MIN_NAMED_STATES
}

/** Which kit modules a test file imports, as bare basenames (`./field` and `@/components/ui/field`
 *  both yield `field`). Import-based on purpose: a test that never imports the primitive cannot be
 *  its state test no matter what its titles say. */
export function coveredModules(src) {
  // `from '…'` covers every real form (named, default, `import type`); the bare `import '…'`
  // alternative is here so a side-effect import cannot make a covered primitive read as uncovered.
  // Under-detection is the dangerous direction for THIS regex: it would fail an author who did
  // write the test.
  const re = /\bfrom\s+['"](?:\.\/|@\/components\/ui\/)([A-Za-z0-9._-]+)['"]|\bimport\s+['"](?:\.\/|@\/components\/ui\/)([A-Za-z0-9._-]+)['"]/g
  return [...src.matchAll(re)].map((m) => (m[1] ?? m[2]).replace(/\.tsx?$/, ''))
}

export function loadUiStateLedger(read = (f) => readFileSync(f, 'utf8')) {
  return new Set(
    read(UI_STATE_LEDGER_FILE)
      .split('\n')
      .map((l) => l.replace(/#.*/, '').trim())
      .filter(Boolean),
  )
}

/** Read components/ui as a { filename -> source } map. Injectable so the guard's fixtures never
 *  have to touch the filesystem (mirrors elementViolations above). */
export function readUiDir() {
  const files = new Map()
  if (!existsSync(UI_DIR)) return files
  for (const e of readdirSync(UI_DIR, { withFileTypes: true })) {
    if (!e.isFile() || !/\.tsx$/.test(e.name)) continue
    files.set(e.name, readFileSync(join(UI_DIR, e.name), 'utf8'))
  }
  return files
}

/** The whole verdict, from a { filename -> source } map plus a ledger set.
 *
 *  · primitives  every `components/ui/*.tsx` that is not itself a test
 *  · tested      those a state test imports
 *  · untested    the rest
 *  · missing     untested AND not on the ledger        → FAIL: a new primitive owes a state test
 *  · graduated   on the ledger AND now tested          → FAIL: bank the win, the ratchet only shrinks
 *  · vanished    on the ledger but no longer a file    → FAIL: a deleted primitive is not debt */
export function evaluateUiStates(io = {}) {
  const files = io.files ?? readUiDir()
  const ledger = io.ledger ?? loadUiStateLedger()

  const covered = new Set()
  for (const [name, src] of files) {
    if (!/\.test\.tsx$/.test(name)) continue
    if (!isStateTest(src)) continue
    for (const mod of coveredModules(src)) covered.add(mod)
  }

  const primitives = []
  const tested = []
  const untested = []
  for (const name of [...files.keys()].sort()) {
    if (/\.test\.tsx$/.test(name)) continue
    const path = `${UI_DIR.split('\\').join('/')}/${name}`
    primitives.push(path)
    ;(covered.has(name.replace(/\.tsx$/, '')) ? tested : untested).push(path)
  }

  const live = new Set(primitives)
  return {
    primitives,
    tested,
    untested,
    missing: untested.filter((p) => !ledger.has(p)),
    graduated: tested.filter((p) => ledger.has(p)).sort(),
    vanished: [...ledger].filter((p) => !live.has(p)).sort(),
    ledgerSize: ledger.size,
  }
}

/** A gate that scans nothing reports a clean bill of health. `readUiDir()` returns an empty map for
 *  a moved directory without complaint, and an empty map yields zero primitives, zero missing, and
 *  a cheerful exit 0. The floor sits well under the live kit (42 primitives on 2026-08-17) and far
 *  above zero, so it fires on a broken read rather than on a deletion. Same pattern as
 *  MIN_SCANNED_FILES above and MIN_PAGES in check-templates.mjs. */
export const MIN_UI_PRIMITIVES = 25

const LEDGER_HEADER_LINES = 32

/** Rewrite the ledger, keeping its prose header and swapping the path block. */
function writeUiStateLedger(paths, counts) {
  const header = readFileSync(UI_STATE_LEDGER_FILE, 'utf8')
    .split('\n')
    .filter((l) => l.startsWith('#') || l.trim() === '')
    .slice(0, LEDGER_HEADER_LINES)
    .join('\n')
    .replace(/^#\s*\d+ primitives ·.*$/m, `# ${counts.total} primitives · ${counts.tested} with a state test · ${paths.length} grandfathered (${new Date().toISOString().slice(0, 10)})`)
    .replace(/\n+$/, '\n')
  writeFileSync(UI_STATE_LEDGER_FILE, `${header}\n${paths.join('\n')}\n`)
}

/** Returns true when the state contract holds; prints and returns false when it does not. */
function reportUiStates() {
  const result = evaluateUiStates()
  const { primitives, tested, untested, missing, graduated, vanished, ledgerSize } = result

  if (primitives.length < MIN_UI_PRIMITIVES) {
    console.error(
      `✗ check:elements found only ${primitives.length} primitive(s) in ${UI_DIR}/, expected at ` +
        `least ${MIN_UI_PRIMITIVES}. The directory moved or the read is broken, so this run's ` +
        'silence about state tests means nothing.',
    )
    return false
  }

  let ok = true

  if (missing.length > 0) {
    ok = false
    console.error(`\n✗ check:elements: ${missing.length} NEW ui primitive(s) ship no state test:\n`)
    for (const p of missing) console.error(`    - ${p}`)
    console.error(
      `\n  docs/INTERACTION-STATES.md §2 says which states the primitive's CLASS requires, and §6\n` +
        `  makes the test the gate: a colocated components/ui/*.test.tsx that imports it and NAMES\n` +
        `  at least ${MIN_NAMED_STATES} of the nine states in its describe/it titles (rest · hover · pressed ·\n` +
        '  focus-visible · loading · empty · error · disabled · optimistic-pending). Copy the shape\n' +
        '  from components/ui/switch.test.tsx, which names seven. If this primitive is a quiet class\n' +
        '  that genuinely owes fewer (a Display badge owes only rest), grandfather it in this PR:\n' +
        '    node scripts/check-elements.mjs --update --allow-raise --reason="why"\n',
    )
  }

  if (graduated.length > 0) {
    ok = false
    console.error(
      `\n✗ check:elements: ${graduated.length} grandfathered primitive(s) now HAVE a state test ` +
        'and are still on the ledger:\n',
    )
    for (const p of graduated) console.error(`    - ${p}`)
    console.error(
      '\n  The ratchet only means something if it shrinks when the coverage is bought. Bank it:\n' +
        '    node scripts/check-elements.mjs --update\n',
    )
  }

  if (vanished.length > 0) {
    ok = false
    console.error(`\n✗ check:elements: ${vanished.length} ledger entr(ies) name a file that is gone:\n`)
    for (const p of vanished) console.error(`    - ${p}`)
    console.error('\n  A deleted primitive is not debt. Regenerate:\n    node scripts/check-elements.mjs --update\n')
  }

  if (ok) {
    console.log(
      `✓ UI state tests: ${tested.length} of ${primitives.length} primitive(s) ship a colocated ` +
        `test naming ≥${MIN_NAMED_STATES} interaction states; ${untested.length} do not and all ` +
        `${untested.length} are grandfathered (ledger ${ledgerSize}, may only shrink).`,
    )
  }
  return ok
}

function main() {
  const scanned = scannedFiles().length
  if (scanned < MIN_SCANNED_FILES) {
    console.error(
      `✗ check:elements scanned only ${scanned} file(s), expected at least ${MIN_SCANNED_FILES}. ` +
        'A root moved or the walk is broken; a run that reads almost nothing must fail ' +
        'rather than report a clean contract.',
    )
    process.exit(1)
  }
  const violations = runCheck()
  let ok = true
  if (violations.length === 0) {
    console.log('✓ Elements contract: one catalog (lib/elements/registry.ts), one store (lib/elements/store.ts); no fork, no direct table access.')
  } else {
    ok = false
    console.error('\n✗ Elements contract check failed — every element derives from ONE source:\n')
    for (const v of violations) {
      const why =
        v.kind === 'parallel-catalog'
          ? 'declares a SECOND ElementDef[] catalog outside lib/elements/registry.ts'
          : 'reaches the element_settings table outside lib/elements/store.ts'
      console.error(`  • ${v.file}:${v.line} — ${why}\n      ${v.text}`)
    }
    console.error(
      '\nDo NOT fork the element catalog or bypass the store. Add an element by editing ELEMENTS\n' +
        '(lib/elements/registry.ts), then import and mount its one canonical component directly;\n' +
        'read/write its config only through lib/elements/store.ts. If this is a genuine exception, add\n' +
        '`// element-ok: <reason>` on the line. See docs/EMBEDDABLE-ELEMENTS.md + ADR-792.\n',
    )
  }

  // Second contract: the ui-primitive state-test ratchet (Lift 8d). Both run every time, and BOTH
  // report before the process exits — a gate that stops at the first failure hides the second one.
  if (!reportUiStates()) ok = false

  if (!ok) process.exit(1)
}

/** `--update` regenerates the ledger from reality. Asymmetric, like every other ratchet here:
 *  shrinking is free, adding a primitive to the grandfathered set needs --allow-raise + a reason. */
function updateLedger() {
  const prior = (() => {
    try { return loadUiStateLedger() } catch { return new Set() }
  })()
  const { primitives, tested, untested } = evaluateUiStates({ ledger: prior })

  if (primitives.length < MIN_UI_PRIMITIVES) {
    console.error(
      `✗ refusing to regenerate the ledger from ${primitives.length} primitive(s) (floor ` +
        `${MIN_UI_PRIMITIVES}). Freezing a broken read is how a ratchet quietly becomes a snapshot.`,
    )
    process.exit(1)
  }

  const rising = untested.filter((p) => !prior.has(p))
  const allowRaise = process.argv.includes('--allow-raise')
  const reasonArg = process.argv.find((a) => a.startsWith('--reason='))
  const reason = reasonArg ? reasonArg.slice('--reason='.length).trim() : ''
  if (rising.length > 0 && prior.size > 0 && !allowRaise) {
    console.error(
      `✗ ui-state ledger: refusing to RAISE by ${rising.length} primitive(s).\n` +
        rising.map((p) => `    + ${p}`).join('\n') +
        '\n  Each of these ships with no colocated state test. Write one (see\n' +
        '  components/ui/switch.test.tsx), or if the primitive is a quiet class that owes fewer\n' +
        '  than three states, say so:\n' +
        '    node scripts/check-elements.mjs --update --allow-raise --reason="why"',
    )
    process.exit(1)
  }
  if (rising.length > 0 && prior.size > 0 && reason.length < 12) {
    console.error('✗ ui-state ledger: --allow-raise needs --reason="..." (>= 12 chars).')
    process.exit(1)
  }

  writeUiStateLedger(untested, { total: primitives.length, tested: tested.length })
  const delta = prior.size - untested.length
  console.log(
    `✓ ui-state ledger regenerated: ${untested.length} grandfathered of ${primitives.length} ` +
      `primitive(s)` +
      (delta > 0 ? ` — ${delta} banked` : delta < 0 ? ` — ⚠️ RAISED by ${-delta}: ${reason}` : ' — held'),
  )
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  if (process.argv.includes('--update')) updateLedger()
  else main()
}
