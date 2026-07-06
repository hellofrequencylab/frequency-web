#!/usr/bin/env node
// Admin-menu contract check (ADR-553 · docs/MENU-CONTRACT.md).
//
// The admin menu + admin rail for EVERY scope derive from a SINGLE source: the module
// catalogs SPACE_MODULES (lib/admin/modules/space-modules.ts) and ADMIN_MODULES
// (lib/admin/modules/registry.ts), plus the layout catalog LAYOUT_MODULES. Both the in-page
// rail (settings-panel -> appsForScope) and the /manage consoles (resolveSpaceMenu /
// resolveEntityConsole) resolve from those catalogs; no surface hand-rolls its own list.
//
// This coarse, FILE-LEVEL static guard fails a PR that (a) declares a NEW parallel module
// catalog outside the three source files, or (b) reintroduces one of the retired parallel
// registries (SPACE_SURFACES / ENTITY_SURFACES) that this standardization deleted. It is the
// cheap always-on floor; the RUNTIME lock that the console and rail resolve the identical set
// per scope lives in the vitest drift guards (lib/admin/modules/space-menu.test.ts,
// lib/admin/entity-console.test.ts). Together: this catches "someone hand-rolled a new list",
// the tests catch "the derivations diverged".
//
// Escape hatch: an inline `// menu-ok: <reason>` comment on the declaration line, or add the
// file to ALLOWLIST below WITH a reason. Usage: `node scripts/check-menu.mjs` (or
// `pnpm check:menu`). Exits 1 on violation. Model: scripts/check-authz-guards.mjs.

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const ROOTS = ['lib', 'app', 'components']
const ANNOTATION = '// menu-ok:'

// The ONLY files allowed to DECLARE an admin/layout module catalog. Each carries its reason.
const CATALOG_ALLOWLIST = new Map([
  ['lib/admin/modules/space-modules.ts', 'THE Space module catalog (source of truth)'],
  ['lib/admin/modules/registry.ts', 'THE AdminModule catalog for the non-Space scopes'],
  ['lib/widgets/modules.ts', 'THE layout/page module catalog (LAYOUT_MODULES -> PAGE_APPS)'],
])

// (a) A hand-rolled parallel module catalog: `const XXX_MODULES = [` / `: ... = [`.
const MODULE_CATALOG = /\bconst\s+[A-Z][A-Z0-9_]*_MODULES\b\s*[:=]/
// (b) Reintroducing a retired parallel registry that the standardization deleted.
const RETIRED_REGISTRY = /\bconst\s+(SPACE_SURFACES|ENTITY_SURFACES)\b\s*[:=]/

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

/** Pure classifier — exported so the companion test can import it (see scripts/check-rls.test.ts).
 *  Returns the list of {line, kind, text} violations in one file's source. */
export function menuViolations(file, src) {
  const lines = src.split('\n')
  const out = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.includes(ANNOTATION)) continue
    if (RETIRED_REGISTRY.test(line)) {
      out.push({ line: i + 1, kind: 'retired-registry', text: line.trim() })
    } else if (MODULE_CATALOG.test(line) && !CATALOG_ALLOWLIST.has(file)) {
      out.push({ line: i + 1, kind: 'parallel-catalog', text: line.trim() })
    }
  }
  return out
}

export function runCheck() {
  const files = ROOTS.flatMap(walk)
  const violations = []
  for (const f of files) {
    for (const v of menuViolations(f, readFileSync(f, 'utf8'))) violations.push({ file: f, ...v })
  }
  return violations
}

function main() {
  const violations = runCheck()
  if (violations.length === 0) {
    console.log('✓ Menu contract: the admin menu derives from the single module catalogs (no hand-rolled list, no retired registry).')
    return
  }
  console.error('\n✗ Menu contract check failed — the admin menu must derive from ONE source:\n')
  for (const v of violations) {
    const why =
      v.kind === 'retired-registry'
        ? 'reintroduces a RETIRED parallel registry (SPACE_SURFACES/ENTITY_SURFACES)'
        : 'declares a NEW parallel module catalog'
    console.error(`  • ${v.file}:${v.line} — ${why}\n      ${v.text}`)
  }
  console.error(
    '\nDo NOT hand-roll a module list or a parallel registry. Add entries to SPACE_MODULES\n' +
      '(lib/admin/modules/space-modules.ts) or ADMIN_MODULES (lib/admin/modules/registry.ts); the\n' +
      'rail + every /manage console resolve from those (appsForScope / resolveSpaceMenu /\n' +
      'resolveEntityConsole). If this is genuinely a new catalog, add `// menu-ok: <reason>` on the\n' +
      'line or allowlist the file in scripts/check-menu.mjs. See docs/MENU-CONTRACT.md + ADR-553.\n',
  )
  process.exit(1)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main()
