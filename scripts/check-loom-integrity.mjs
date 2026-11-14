#!/usr/bin/env node
// check:loom-integrity — ARM B, the manifest gate (PROG-E9; docs/EDITOR-GATES.md §4; EDITOR-ARCHITECTURE §5,
// §7.2). Arm A is the write-time validator, lib/loom/functions/validate.ts `validateLoomFunction`, which a
// store calls before every insert and update. A write-time validator that checks against a drifted registry is
// worse than none (it authorises what it cannot honour), so this gate proves the registry it checks against
// is real:
//
//   M1  every primitive in LOOM_PRIMITIVES names a module file that exists and an export that is a function;
//       ids are unique, argument and return kinds are Loom kinds, and the manifest is not empty.
//   M2  every schema a declaration may name (`block:<type>`, derived from the adopted block contract) is a Zod
//       object schema, so field references resolve against a real shape.
//   M3  the manifest is declared once: `export const LOOM_PRIMITIVES` appears in exactly one source file.
//   M4  `.from('loom_functions')` appears only in lib/loom/store.ts (lifted from check-elements.mjs): nothing
//       writes the table around the validator.
//   M5  if lib/loom/store.ts exists, it calls validateLoomFunction (the write path is guarded). The store exists
//       since PROG-E9 part 2 (migration 20270346048000), so M5 is strict.
//   M6  arm A is not vacuous: the validator accepts a known-good declaration against the real context and
//       rejects a broken copy of it.
//   M7  the usage projection (lib/loom/functions/usage.ts, PROG-E2) is not vacuous: it indexes the self-test's
//       primitives and block, and lists a row whose op was retired as stranded, so a retirement can be sized.
//
// No `// loom-ok:` bypass, on either arm. The exit is a PR adding a primitive (Layer 1, CI-gated).
//
// CANNOT SEE: whether a composition is useful or fast; its cost; and functions ALREADY STORED when a primitive
// is later retired. Until a usage index covers Loom functions, retiring a primitive is NOT reversible from CI:
// the read side (lib/loom/functions/run.ts) resolves such a function to nothing and logs, it does not repair it.
//
// Runs under node with type stripping (package.json), importing the real modules through scripts/probe-ts.mjs.
// The enforcing arm is scripts/check-loom-integrity.test.ts (guard-wiring.test.ts names it).

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { invokedDirectly } from './lib/invoked-directly.mjs'

export const STORE_FILE = 'lib/loom/store.ts'
export const MANIFEST_FILE = 'lib/loom/functions/primitives.ts'
const SOURCE_ROOTS = ['lib', 'app', 'components']
const SKIP = new Set(['node_modules', '.next', '.git'])

/** M1. */
export function manifestProblems(primitives, { kinds, bodyOf, exists = existsSync }) {
  const out = []
  if (!primitives.length) return ['M1 the manifest is empty: the gate would pass on nothing']
  const seen = new Set()
  for (const p of primitives) {
    const at = `M1 ${p?.id ?? '?'}`
    if (seen.has(p.id)) out.push(`${at}: declared twice`)
    seen.add(p.id)
    if (!exists(p.module)) out.push(`${at}: module ${p.module} does not exist`)
    else if (typeof bodyOf(p) !== 'function') out.push(`${at}: ${p.module} has no function export ${p.export}`)
    for (const [name, kind] of Object.entries(p.args ?? {})) if (!kinds.includes(kind)) out.push(`${at}: argument ${name} has kind ${kind}, not a Loom kind`)
    if (!kinds.includes(p.returns)) out.push(`${at}: returns ${p.returns}, not a Loom kind`)
  }
  return out
}

/** M2. `isZod` says a value roots at z; `shapeOf` says it is an object schema. */
export function schemaProblems(schemas, { isZod, shapeOf }) {
  const out = []
  if (!schemas.size) return ['M2 no schema is available to compose over']
  for (const [ref, s] of schemas) {
    if (!isZod(s)) out.push(`M2 ${ref}: not a Zod schema`)
    else if (!shapeOf(s)) out.push(`M2 ${ref}: not a Zod object schema, so no field can resolve`)
  }
  return out
}

/** M3, M4, M5 over a map of repo-relative path → source. */
export function sourceProblems(sources) {
  const out = []
  const declares = Object.keys(sources).filter((f) => /export const LOOM_PRIMITIVES\b/.test(sources[f]))
  if (declares.length !== 1 || declares[0] !== MANIFEST_FILE) out.push(`M3 LOOM_PRIMITIVES must be declared once, in ${MANIFEST_FILE}; found in: ${declares.join(', ') || 'nowhere'}`)
  for (const [f, src] of Object.entries(sources)) {
    if (f !== STORE_FILE && /\.from\(\s*['"`]loom_functions['"`]\s*\)/.test(src)) out.push(`M4 ${f} touches loom_functions; only ${STORE_FILE} may, behind the validator`)
  }
  const store = sources[STORE_FILE]
  if (store !== undefined && !/validateLoomFunction\(/.test(store)) out.push(`M5 ${STORE_FILE} exists but its write path never calls validateLoomFunction`)
  return out
}

/** The canonical known-good declaration M6 runs arm A against. */
export const SELF_TEST = {
  id: 'loom-integrity-self-test',
  label: 'Self test',
  v: 1,
  input: 'block:heading',
  output: 'boolean',
  steps: [
    { id: 'clean', op: 'text.trim', args: { value: { field: 'text' } } },
    { id: 'blank', op: 'text.isEmpty', args: { value: { step: 'clean' } } },
    { id: 'shown', op: 'logic.not', args: { value: { step: 'blank' } } },
  ],
  result: 'shown',
}

/** M6. */
export function validatorProblems(validate, ctx) {
  const out = []
  const good = validate(SELF_TEST, ctx)
  if (!good.ok) out.push(`M6 the validator rejects the known-good declaration: ${good.problems.join('; ')}`)
  const bad = validate({ ...SELF_TEST, steps: [{ ...SELF_TEST.steps[0], op: 'js.eval' }] }, ctx)
  if (bad.ok) out.push('M6 the validator accepts a step whose op is not a primitive: arm A is vacuous')
  return out
}

/** M7. `project` is projectLoomUsage, `impact` is retirementImpact; both run over the real context. */
export function usageProblems(project, impact, ctx) {
  const out = []
  const prev = process.env.EDITOR_CANVAS
  process.env.EDITOR_CANVAS = '1'
  try {
    const idx = project([{ spaceId: 'self-test', surface: 'self-test', declaration: SELF_TEST }, { spaceId: 'self-test', surface: 'stranded', declaration: { ...SELF_TEST, steps: [{ ...SELF_TEST.steps[0], op: 'js.eval' }] } }], ctx)
    if (impact(idx, { primitive: 'text.trim' }).functions.length !== 1) out.push('M7 the usage projection does not index a primitive the self-test uses')
    if (impact(idx, { block: SELF_TEST.input }).functions.length !== 1) out.push('M7 the usage projection does not index the self-test block')
    if (idx.stranded.length !== 1) out.push('M7 the usage projection does not list a row with a retired primitive as stranded')
  } finally {
    if (prev === undefined) delete process.env.EDITOR_CANVAS
    else process.env.EDITOR_CANVAS = prev
  }
  return out
}

/** Every .ts / .tsx source under lib, app and components, tests excluded. */
export function readSources(root = '.') {
  const out = {}
  const walk = (dir) => {
    if (!existsSync(dir)) return
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (SKIP.has(e.name)) continue
      const p = path.join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out[path.relative(root, p).split(path.sep).join('/')] = readFileSync(p, 'utf8')
    }
  }
  for (const r of SOURCE_ROOTS) walk(path.join(root, r))
  return out
}

async function main() {
  await import('./probe-ts.mjs')
  const { z } = await import('zod')
  const { LOOM_PRIMITIVES, LOOM_KINDS, primitiveBody } = await import('../lib/loom/functions/primitives.ts')
  const { validateLoomFunction, shapeOf } = await import('../lib/loom/functions/validate.ts')
  const { loomContext } = await import('../lib/loom/functions/context.ts')
  const { projectLoomUsage, retirementImpact } = await import('../lib/loom/functions/usage.ts')
  const ctx = loomContext()
  const problems = [
    ...manifestProblems(LOOM_PRIMITIVES, { kinds: [...LOOM_KINDS], bodyOf: primitiveBody }),
    ...schemaProblems(ctx.schemas, { isZod: (s) => s instanceof z.ZodType, shapeOf }),
    ...sourceProblems(readSources()),
    ...validatorProblems(validateLoomFunction, ctx),
    ...usageProblems(projectLoomUsage, retirementImpact, ctx),
  ]
  if (problems.length) {
    console.error(`check:loom-integrity — ${problems.length} problem(s):\n` + problems.map((p) => `  ${p}`).join('\n'))
    process.exit(1)
  }
  const store = existsSync(STORE_FILE) ? 'the store calls the validator' : `no ${STORE_FILE} yet (waits on the loom_functions table), M5 holds vacuously`
  console.log(`check:loom-integrity — ${LOOM_PRIMITIVES.length} primitive(s) over ${ctx.schemas.size} block schema(s) resolve; ${store}.`)
}

if (invokedDirectly(import.meta.url)) await main()
