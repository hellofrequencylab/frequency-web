import { z } from 'zod'
import { MODULE_ROLES } from '@/lib/page-settings/layout'
import { LOOM_KINDS, type LoomKind, type LoomPrimitive } from './primitives'

// ARM A OF check:loom-integrity: THE WRITE-TIME VALIDATOR (PROG-E9; EDITOR-GATES §4; ADR-975).
//
// `validateLoomFunction(decl, ctx)` is pure: no IO, no clock, no env. A store calls it before EVERY insert and
// update, and persists nothing unless it returns ok (fail-closed). What it proves, L1 to L9:
//   L1  every step's `op` names a real primitive in the manifest.
//   L2  every step supplies exactly that primitive's arguments, each of the declared kind.
//   L3  `input` names a real schema, and every field reference resolves against that schema's Zod SHAPE (not a
//       string list), so a schema edit that drops a field invalidates the reference by itself.
//   L4  the graph is acyclic and bounded: a step may read only an EARLIER step, ids are unique, and there are at
//       most MAX_STEPS steps.
//   L5  no free identifiers and no raw JavaScript: the declaration is strict JSON data. Unknown keys, functions,
//       and identifiers outside the safe alphabet all fail; every name it uses must resolve (L1, L3, L4).
//   L6  the `result` step's kind is the declared `output` kind.
//   L7  every gate names something that exists (a role floor on the ModuleRole ladder).
//   L8  validation is total: ok with the parsed function, or every problem found. Never a partial value.
//   L9  is the read side's (./run.ts): a function whose primitive vanished resolves to nothing and logs.
//
// 🔴 NO BYPASS. There is no per-row escape hatch here and there must never be one: a write-time validator with a
// bypass is a plugin platform with extra steps. The way out is a PR that adds a primitive (Layer 1).
//
// CANNOT SEE: whether a composition is useful, or what an operator meant. It proves a declaration well formed,
// not intended (a prompt-injected declaration that is well formed passes).

export const MAX_STEPS = 24
const MAX_LITERAL = 500

const ID = /^[a-z][a-zA-Z0-9]{0,39}$/
const SLUG = /^[a-z][a-z0-9-]{1,62}$/
const SCHEMA_REF = /^block:[a-zA-Z][a-zA-Z0-9]{0,63}$/

const ArgSchema = z.union([
  z.strictObject({ field: z.string().regex(ID) }),
  z.strictObject({ step: z.string().regex(ID) }),
  z.strictObject({ text: z.string().max(MAX_LITERAL) }),
  z.strictObject({ number: z.number().finite() }),
  z.strictObject({ boolean: z.boolean() }),
])

const StepSchema = z.strictObject({
  id: z.string().regex(ID),
  op: z.string().min(1).max(64),
  args: z.record(z.string().regex(ID), ArgSchema),
})

const DeclSchema = z.strictObject({
  id: z.string().regex(SLUG),
  label: z.string().trim().min(1).max(80),
  v: z.literal(1),
  input: z.string().regex(SCHEMA_REF),
  output: z.enum(LOOM_KINDS),
  steps: z.array(StepSchema).min(1).max(MAX_STEPS),
  result: z.string().regex(ID),
  gates: z.strictObject({ minRole: z.enum(MODULE_ROLES).optional() }).optional(),
})

/** A Loom-declared function, as stored. Only `validateLoomFunction` produces one. */
export type LoomFunction = z.infer<typeof DeclSchema>

export interface LoomContext {
  primitives: readonly LoomPrimitive[]
  /** Schema ref (`block:<type>`) → the block's content schema. */
  schemas: ReadonlyMap<string, z.ZodType>
}

export type LoomValidation = { ok: true; fn: LoomFunction } | { ok: false; problems: string[] }

/** Unwrap optional / nullable / default to the value's own schema. */
function inner(schema: z.ZodType): z.ZodType {
  let s = schema
  for (let i = 0; i < 8; i++) {
    const def = (s as { def?: { type?: string; innerType?: z.ZodType } }).def
    if (def && (def.type === 'optional' || def.type === 'nullable' || def.type === 'default') && def.innerType) s = def.innerType
    else break
  }
  return s
}

/** The Loom kind a schema field reads as, or null when no primitive can take it (an object, a record). */
export function kindOfSchema(schema: z.ZodType): LoomKind | null {
  const type = (inner(schema) as { def?: { type?: string } }).def?.type
  switch (type) {
    case 'string':
    case 'enum':
      return 'text'
    case 'number':
      return 'number'
    case 'boolean':
      return 'boolean'
    case 'array':
      return 'list'
    default:
      return null
  }
}

/** The shape of an object schema, or null when the schema is not a Zod object. */
export function shapeOf(schema: z.ZodType): Record<string, z.ZodType> | null {
  const def = (inner(schema) as { def?: { type?: string; shape?: Record<string, z.ZodType> } }).def
  return def?.type === 'object' && def.shape ? def.shape : null
}

const describe = (issue: { path: readonly PropertyKey[]; message: string }): string =>
  `${issue.path.length ? issue.path.map(String).join('.') : 'declaration'}: ${issue.message}`

/** Arm A. Total and pure: every problem, or the parsed function. */
export function validateLoomFunction(decl: unknown, ctx: LoomContext): LoomValidation {
  const parsed = DeclSchema.safeParse(decl)
  if (!parsed.success) return { ok: false, problems: parsed.error.issues.map(describe) }
  const fn = parsed.data
  const problems: string[] = []

  const schema = ctx.schemas.get(fn.input)
  const shape = schema ? shapeOf(schema) : null
  if (!schema) problems.push(`input: ${fn.input} is not a known schema`)
  else if (!shape) problems.push(`input: ${fn.input} is not an object schema`)

  const byId = new Map(ctx.primitives.map((p) => [p.id, p]))
  const kinds = new Map<string, LoomKind>()

  for (const [i, step] of fn.steps.entries()) {
    const at = `steps.${i} (${step.id})`
    if (kinds.has(step.id)) problems.push(`${at}: the id is used by an earlier step`)
    const prim = byId.get(step.op)
    if (!prim) {
      problems.push(`${at}: ${step.op} is not a Loom primitive`)
      continue
    }
    const want = Object.keys(prim.args)
    for (const name of Object.keys(step.args)) if (!want.includes(name)) problems.push(`${at}: ${step.op} takes no argument ${name}`)
    for (const name of want) {
      const arg = step.args[name]
      const need = prim.args[name]
      if (!arg) {
        problems.push(`${at}: ${step.op} needs argument ${name}`)
        continue
      }
      let got: LoomKind | null = null
      if ('field' in arg) {
        const field = shape?.[arg.field]
        if (shape && !field) problems.push(`${at}: ${name} reads ${arg.field}, which ${fn.input} does not have`)
        got = field ? kindOfSchema(field) : null
        if (field && !got) problems.push(`${at}: ${name} reads ${arg.field}, which no primitive can take`)
      } else if ('step' in arg) {
        got = kinds.get(arg.step) ?? null
        if (!kinds.has(arg.step)) problems.push(`${at}: ${name} reads step ${arg.step}, which is not an earlier step`)
      } else if ('text' in arg) got = 'text'
      else if ('number' in arg) got = 'number'
      else got = 'boolean'
      if (got && got !== need) problems.push(`${at}: ${name} must be ${need}, got ${got}`)
    }
    kinds.set(step.id, prim.returns)
  }

  const out = kinds.get(fn.result)
  if (!fn.steps.some((s) => s.id === fn.result)) problems.push(`result: ${fn.result} is not a step`)
  else if (out && out !== fn.output) problems.push(`result: ${fn.result} gives ${out}, but the function declares ${fn.output}`)

  return problems.length ? { ok: false, problems } : { ok: true, fn }
}
