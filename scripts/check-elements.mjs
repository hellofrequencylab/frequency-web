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
// ALLOWLIST below WITH a reason. Usage: `node scripts/check-elements.mjs` (or `pnpm check:elements`).
// Exits 1 on violation.

import { readFileSync, readdirSync, existsSync } from 'node:fs'
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

function main() {
  const scanned = ROOTS.flatMap(walk).length
  if (scanned < MIN_SCANNED_FILES) {
    console.error(
      `✗ check:elements scanned only ${scanned} file(s), expected at least ${MIN_SCANNED_FILES}. ` +
        'A root moved or the walk is broken; a run that reads almost nothing must fail ' +
        'rather than report a clean contract.',
    )
    process.exit(1)
  }
  const violations = runCheck()
  if (violations.length === 0) {
    console.log('✓ Elements contract: one catalog (lib/elements/registry.ts), one store (lib/elements/store.ts); no fork, no direct table access.')
    return
  }
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
  process.exit(1)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main()
