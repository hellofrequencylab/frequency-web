#!/usr/bin/env node
// Studio contract check (ADR-986 · docs/STUDIO.md).
//
// Every creation wizard, review board, and edit re-entry derives from ONE source: the entity
// manifests (lib/studio/entities/*.ts) declared in the catalog (lib/studio/registry.ts) and
// rendered by the kernel (lib/studio/kernel/*). The whole value of that arrangement is a single
// property:
//
//     change the KERNEL -> every wizard changes.  change an ENTITY -> only that wizard changes.
//
// That property survives only while the dependency arrow points ONE way. This guard enforces it
// mechanically, so it cannot decay through good intentions:
//
//   (a) STRICT BOUNDARY  — nothing in lib/studio/kernel/ may import from lib/studio/entities/
//                          (or from the registry, which imports entities). A kernel that knows
//                          about one entity is no longer shared infrastructure.
//   (b) PURE KERNEL      — the kernel imports no React / Next / Supabase. It has to stay callable
//                          from a Server Component, a client surface, an action, and a test.
//   (c) NO BESPOKE FIELD — no hand-rolled Tailwind field constant inside the Studio's own surface.
//       CSS                This is the specific rot the survey found: the same
//                          `const FIELD = 'w-full rounded-xl border …'` copied per wizard.
//
// (c) is deliberately SCOPED to lib/studio + components/studio rather than the whole app. There
// are ~19 further copies out in legacy surfaces (admin clients, settings forms, connections);
// widening the rule to catch them would turn every Studio PR into an app-wide restyle, and a
// guard people have to fight gets bypassed. Those are tracked as their own cleanup; this rule
// holds the line where the field kit is the mandated control.
//
// The RUNTIME half of the contract (every manifest is well formed, uses known field kinds, and
// can clear its own commercial facts) lives in the vitest drift guards beside the catalog:
// lib/studio/registry.test.ts. Together: this catches "the layering was broken", the tests catch
// "a manifest was declared wrong".
//
// Escape hatch: an inline `// studio-ok: <reason>` comment on the offending line. Usage:
// `node scripts/check-studio.mjs` (or `pnpm check:studio`). Exits 1 on violation.
// Model: scripts/check-menu.mjs.

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const KERNEL_DIR = 'lib/studio/kernel'
const FIELD_KIT_DIR = 'components/studio/spark/field'
const ANNOTATION = '// studio-ok:'
/** Rule (c)'s scan scope: the Studio's own surface, where the field kit is the mandated control. */
const STUDIO_ROOTS = ['lib/studio', 'components/studio']

// (a) A kernel file reaching sideways into an entity or the catalog that imports them.
const KERNEL_REACHES_ENTITY = /from\s+['"](?:@\/lib\/studio\/(?:entities|registry)|\.\.\/(?:entities|registry))/
// (b) A framework import inside the kernel.
const KERNEL_IMPURE = /from\s+['"](?:react|next(?:\/[\w-]+)?|@supabase\/[\w-]+|server-only)['"]/
// (c) A bespoke Tailwind field/input class constant outside the field kit.
const BESPOKE_FIELD_CSS = /\bconst\s+(?:FIELD|field|INPUT|input|FIELD_CLS|fieldClasses)\s*=\s*['"`][^'"`]*\b(?:rounded-|border-|px-\d)/

function walk(dir) {
  const out = []
  if (!existsSync(dir)) return out
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.next') continue
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...walk(p))
    else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(p)
  }
  return out
}

/** Files inside the Studio surface that predate the field kit. Each carries a reason and is
 *  DELETED by the PR that moves that surface onto components/studio/spark/field/*. A shrinking
 *  list is the migration's progress bar; nothing new may join it. */
const FIELD_CSS_ALLOWLIST = new Map([
  ['components/studio/practice/practice-spark.tsx', 'pre-kit: Practice spark'],
  ['components/studio/practice/practice-builder.tsx', 'pre-kit: Practice builder'],
  ['components/studio/practice/practice-composer.tsx', 'pre-kit: Practice composer'],
  ['components/studio/market/listing-builder.tsx', 'pre-kit: Listing builder'],
  ['components/studio/market/new-listing-button.tsx', 'pre-kit: New listing button'],
])

function runCheck() {
  const violations = []
  const norm = (p) => p.split('\\').join('/')

  // (a) + (b): the kernel's layering + purity.
  for (const file of walk(KERNEL_DIR)) {
    const lines = readFileSync(file, 'utf8').split('\n')
    lines.forEach((text, i) => {
      if (text.includes(ANNOTATION)) return
      if (KERNEL_REACHES_ENTITY.test(text)) violations.push({ kind: 'boundary', file: norm(file), line: i + 1, text: text.trim() })
      else if (KERNEL_IMPURE.test(text)) violations.push({ kind: 'impure', file: norm(file), line: i + 1, text: text.trim() })
    })
  }

  // (c): bespoke field CSS inside the Studio surface, outside the kit.
  for (const root of STUDIO_ROOTS) {
    for (const file of walk(root)) {
      const rel = norm(file)
      if (rel.startsWith(FIELD_KIT_DIR) || FIELD_CSS_ALLOWLIST.has(rel)) continue
      const lines = readFileSync(file, 'utf8').split('\n')
      lines.forEach((text, i) => {
        if (text.includes(ANNOTATION)) return
        if (BESPOKE_FIELD_CSS.test(text)) violations.push({ kind: 'field-css', file: rel, line: i + 1, text: text.trim() })
      })
    }
  }

  return violations
}

const WHY = {
  boundary: 'the KERNEL imports an ENTITY (the dependency arrow must point entities -> kernel only)',
  impure: 'the KERNEL imports a framework (it must stay pure: no React / Next / Supabase)',
  'field-css': 'declares a bespoke field CSS constant instead of using the shared field kit',
}

function main() {
  const violations = runCheck()
  if (violations.length === 0) {
    console.log('✓ Studio contract: the kernel is pure and entity-blind, and no surface hand-rolls a field control.')
    return
  }
  console.error('\n✗ Studio contract check failed:\n')
  for (const v of violations) {
    console.error(`  • ${v.file}:${v.line} — ${WHY[v.kind]}\n      ${v.text}`)
  }
  console.error(
    '\nThe Studio derives every wizard from ONE source, so a kernel change reaches every entity and an\n' +
      'entity change reaches nothing else. Keep the layers apart:\n' +
      '  • lib/studio/kernel/*    pure, entity-blind machinery. Needs a new capability? Add a FIELD KIND.\n' +
      '  • lib/studio/entities/*  one manifest per entity: data only, no render code.\n' +
      '  • components/studio/spark/field/*  the ONLY place a field control is styled.\n' +
      'If this is a genuine exception, add `// studio-ok: <reason>` on the line, or allowlist the file\n' +
      'in scripts/check-studio.mjs WITH a reason. See docs/STUDIO.md + ADR-986.\n',
  )
  process.exit(1)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main()
