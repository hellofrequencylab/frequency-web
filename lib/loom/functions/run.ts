import { envFlag } from '@/lib/env/string'
import { log } from '@/lib/log'
import { primitiveBody } from './primitives'
import { shapeOf, kindOfSchema, validateLoomFunction, type LoomContext, type LoomFunction } from './validate'
import type { LoomKind } from './primitives'

// THE READ SIDE OF A LOOM-DECLARED FUNCTION (PROG-E9; EDITOR-GATES §4, L9). DARK: nothing runs unless
// EDITOR_CANVAS is on (`loomFunctionsEnabled`).
//
// Fail-safe, never throwing. A stored function is re-validated against TODAY's manifest and schemas before it
// runs, so a function whose primitive was retired, or whose block dropped a field, resolves to null and logs
// one line, and the surface that asked renders without it. Nothing here writes.

/** The switch for every Loom function surface. Off by default. */
export function loomFunctionsEnabled(): boolean {
  return envFlag('EDITOR_CANVAS')
}

const EMPTY: Record<LoomKind, unknown> = { text: '', number: 0, boolean: false, list: [] }

/** A block field read as its kind. An absent or wrongly typed value reads as that kind's empty value, so a
 *  sparse stored bag (the editor's normal shape) never reaches a primitive as undefined. */
function readField(content: Record<string, unknown>, key: string, kind: LoomKind): unknown {
  const v = content[key]
  if (kind === 'text') return typeof v === 'string' ? v : EMPTY.text
  if (kind === 'number') return typeof v === 'number' && Number.isFinite(v) ? v : EMPTY.number
  if (kind === 'boolean') return typeof v === 'boolean' ? v : EMPTY.boolean
  return Array.isArray(v) ? v : EMPTY.list
}

/** Evaluate an already-validated function over one block's content. Null on any failure, logged. */
export function evaluateLoomFunction(fn: LoomFunction, content: unknown, ctx: LoomContext): unknown {
  try {
    const shape = shapeOf(ctx.schemas.get(fn.input)!)!
    const bag = content && typeof content === 'object' && !Array.isArray(content) ? (content as Record<string, unknown>) : {}
    const byId = new Map(ctx.primitives.map((p) => [p.id, p]))
    const values = new Map<string, unknown>()
    for (const step of fn.steps) {
      const prim = byId.get(step.op)!
      const body = primitiveBody(prim)
      if (!body) throw new Error(`primitive ${prim.id} has no body`)
      const args: Record<string, unknown> = {}
      for (const [name, arg] of Object.entries(step.args)) {
        if ('field' in arg) args[name] = readField(bag, arg.field, kindOfSchema(shape[arg.field])!)
        else if ('step' in arg) args[name] = values.get(arg.step)
        else if ('text' in arg) args[name] = arg.text
        else if ('number' in arg) args[name] = arg.number
        else args[name] = arg.boolean
      }
      values.set(step.id, body(args))
    }
    return values.get(fn.result) ?? null
  } catch (e) {
    log.warn('loom.function.failed', { id: fn.id, error: e instanceof Error ? e.message : String(e) })
    return null
  }
}

/** Run a stored declaration: re-validate, then evaluate. Null when the switch is off, when the declaration no
 *  longer holds against today's primitives and schemas, or when evaluation fails. Never throws. */
export function runLoomFunction(stored: unknown, content: unknown, ctx: LoomContext): unknown {
  if (!loomFunctionsEnabled()) return null
  const checked = validateLoomFunction(stored, ctx)
  if (!checked.ok) {
    const id = stored && typeof stored === 'object' ? String((stored as { id?: unknown }).id ?? '?') : '?'
    log.warn('loom.function.unresolved', { id, problems: checked.problems.slice(0, 5).join('; ') })
    return null
  }
  return evaluateLoomFunction(checked.fn, content, ctx)
}
