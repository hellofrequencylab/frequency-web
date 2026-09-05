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
// Escape hatch: an inline `// studio-ok: <reason>` comment on the offending line.
//
// ⚠️ WHERE THIS RUNS (changed 2026-08-12). This is no longer a `check:*` entry in the CI guards
// array. It is enforced by `scripts/check-studio.test.ts`, which vitest AUTO-DISCOVERS — so unlike
// an array entry, it cannot be forgotten. That matters here more than anywhere: this exact guard
// shipped in PR #2098 and was wired into nothing for the whole life of that PR, while AGENTS.md
// called the contract "machine-enforced". The runtime half already lived beside the catalog in
// lib/studio/registry.test.ts; this puts the layering half on the same footing.
// Still runnable by hand for the friendly report: `node scripts/check-studio.mjs`. Exits 1 on
// violation. Model: scripts/check-menu.mjs.

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

/** The tree every export measures by default. Resolved from this file's own location, so the CLI
 *  and the vitest guard read the same repo whatever the cwd. Every export also takes a `root`
 *  argument (scan2 L8-03, 2026-09-05) so the test can point the SAME detector at a fixture tree
 *  with a planted violation and prove the regexes still match today's import syntax. */
export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

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

// ── NON-TRIVIALITY FLOORS ────────────────────────────────────────────────────────────────────
// 🔴 MEASURED 2026-08-12: with the repo tree absent, this script printed
// "✓ Studio contract: the kernel is pure and entity-blind" and exited 0. `walk()` returns [] for a
// directory that does not exist, every loop body was skipped, `violations` stayed empty, and the
// success branch fired. AGENTS.md calls this contract "machine-enforced" — it was enforcing
// nothing, in exactly the way check:og-trace's regex bug made half of THAT guard vacuous for weeks.
//
// A guard that reports a clean bill of health over an empty corpus is worse than no guard: it
// converts "I never looked" into "I looked and it was fine". These floors make the two distinct.
//
// Raise them only when the real counts move, and never to make a red build green.
export const MIN_KERNEL_FILES = 3
export const MIN_STUDIO_FILES = 10

/** The two corpora the floors are measured against. Exported so the vitest guard asserts the SAME
 *  numbers the CLI does, rather than a re-derived approximation of them. */
export function corpus(root = REPO_ROOT) {
  return { kernelFiles: walk(join(root, KERNEL_DIR)), studioFiles: STUDIO_ROOTS.flatMap((r) => walk(join(root, r))) }
}

/** The floor, as a message rather than an exit — so both the CLI and the test can enforce it.
 *  Returns null when the corpus is real. */
export function corpusFloorFailure(root = REPO_ROOT) {
  const { kernelFiles, studioFiles } = corpus(root)
  if (kernelFiles.length >= MIN_KERNEL_FILES && studioFiles.length >= MIN_STUDIO_FILES) return null
  return (
    `\n✗ check:studio — refusing to pass over a corpus it could not read.\n` +
    `    ${KERNEL_DIR}: ${kernelFiles.length} file(s), floor ${MIN_KERNEL_FILES}\n` +
    `    studio surfaces: ${studioFiles.length} file(s), floor ${MIN_STUDIO_FILES}\n\n` +
    `  Either the Studio moved and this guard's paths are stale, or it is running outside the\n` +
    `  repo. Both are real problems. Neither is a pass.\n`
  )
}

export function runCheck(root = REPO_ROOT) {
  const violations = []
  const norm = (p) => relative(root, p).split('\\').join('/')

  const kernelFiles = walk(join(root, KERNEL_DIR))

  // (a) + (b): the kernel's layering + purity.
  for (const file of kernelFiles) {
    const lines = readFileSync(file, 'utf8').split('\n')
    lines.forEach((text, i) => {
      if (text.includes(ANNOTATION)) return
      if (KERNEL_REACHES_ENTITY.test(text)) violations.push({ kind: 'boundary', file: norm(file), line: i + 1, text: text.trim() })
      else if (KERNEL_IMPURE.test(text)) violations.push({ kind: 'impure', file: norm(file), line: i + 1, text: text.trim() })
    })
  }

  // (c): bespoke field CSS inside the Studio surface, outside the kit.
  for (const surface of STUDIO_ROOTS) {
    for (const file of walk(join(root, surface))) {
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

export const WHY = {
  boundary: 'the KERNEL imports an ENTITY (the dependency arrow must point entities -> kernel only)',
  impure: 'the KERNEL imports a framework (it must stay pure: no React / Next / Supabase)',
  'field-css': 'declares a bespoke field CSS constant instead of using the shared field kit',
}

function main() {
  const floor = corpusFloorFailure()
  if (floor) {
    console.error(floor)
    process.exit(1)
  }
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
