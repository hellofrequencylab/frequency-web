import * as ops from './ops'

// THE LOOM PRIMITIVE MANIFEST (PROG-E9; EDITOR-GATES §4). The one list of what an operator may compose. A
// Loom-declared function is a composition of these rows over a real block schema, never JavaScript (ADR-975's
// declarative ceiling). Each row names the module and export that implement it, the kinds its arguments take
// and the kind it returns. `check:loom-integrity` arm B proves every row resolves to a real export, and arm A
// (./validate.ts) checks every declaration against this list before it may be stored.
//
// Declared ONCE, here (arm B fails a second `LOOM_PRIMITIVES`). Retiring a row strands any stored function
// that uses it; until a usage index covers Loom functions, that is not reversible from CI, so retire nothing
// without reading the store first.

/** The value kinds a composition passes between steps. A block field reads as one of these. */
export const LOOM_KINDS = ['text', 'number', 'boolean', 'list'] as const
export type LoomKind = (typeof LOOM_KINDS)[number]

export interface LoomPrimitive {
  /** The id a declaration's step names as its `op`. */
  id: string
  /** What the operator sees, plain words. */
  label: string
  /** The implementing module, repo-relative. Arm B proves it exists. */
  module: string
  /** The export in that module. Arm B proves it is a function. */
  export: keyof typeof ops
  /** Argument name → kind. A step must supply exactly these. */
  args: Readonly<Record<string, LoomKind>>
  returns: LoomKind
}

const MODULE = 'lib/loom/functions/ops.ts'

export const LOOM_PRIMITIVES: readonly LoomPrimitive[] = [
  { id: 'text.trim', label: 'Trim spaces', module: MODULE, export: 'trimText', args: { value: 'text' }, returns: 'text' },
  { id: 'text.truncate', label: 'Shorten text', module: MODULE, export: 'truncateText', args: { value: 'text', max: 'number' }, returns: 'text' },
  { id: 'text.join', label: 'Join two texts', module: MODULE, export: 'joinText', args: { first: 'text', second: 'text', separator: 'text' }, returns: 'text' },
  { id: 'text.isEmpty', label: 'Text is empty', module: MODULE, export: 'textIsEmpty', args: { value: 'text' }, returns: 'boolean' },
  { id: 'text.length', label: 'Text length', module: MODULE, export: 'textLength', args: { value: 'text' }, returns: 'number' },
  { id: 'list.count', label: 'Count items', module: MODULE, export: 'countList', args: { value: 'list' }, returns: 'number' },
  { id: 'number.atLeast', label: 'Number is at least', module: MODULE, export: 'atLeast', args: { value: 'number', floor: 'number' }, returns: 'boolean' },
  { id: 'number.min', label: 'Smaller of two numbers', module: MODULE, export: 'smaller', args: { first: 'number', second: 'number' }, returns: 'number' },
  { id: 'logic.and', label: 'Both are true', module: MODULE, export: 'allOf', args: { first: 'boolean', second: 'boolean' }, returns: 'boolean' },
  { id: 'logic.not', label: 'Not', module: MODULE, export: 'negate', args: { value: 'boolean' }, returns: 'boolean' },
  { id: 'logic.choose', label: 'Pick a text', module: MODULE, export: 'chooseText', args: { when: 'boolean', then: 'text', otherwise: 'text' }, returns: 'text' },
]

/** The callable body behind a primitive, or null when the manifest names an export that is not a function
 *  (arm B fails that in CI; the read side treats it as a vanished primitive). */
export function primitiveBody(p: LoomPrimitive): ((args: Record<string, unknown>) => unknown) | null {
  const fn = (ops as Record<string, unknown>)[p.export]
  return typeof fn === 'function' ? (fn as (args: Record<string, unknown>) => unknown) : null
}
