import { loomFunctionsEnabled } from './run'
import { validateLoomFunction, type LoomContext } from './validate'

// THE LOOM USAGE INDEX (PROG-E2; check:loom-integrity CANNOT SEE note). A PROJECTION, NOT A TABLE: it is derived
// from the stored declarations a caller already read, so there is no second copy of the truth to drift and no
// migration (the same call ADR-1502 made for block_type_usage). It answers the question the manifest gate could
// not: "which stored functions use primitive P, or read block type B", so a retirement can name what it strands
// BEFORE it ships.
//
// Pure and dark: with EDITOR_CANVAS off every projection is empty. A stored row is not trusted: it is
// re-validated against today's manifest and schemas, and a row that no longer validates is listed as
// `stranded` (the read side resolves it to nothing and logs) rather than silently dropped.

/** One stored row as the store lists it. Only the fields the projection reads. */
interface LoomUsageRow {
  spaceId: string
  surface: string
  declaration: unknown
}

interface LoomUsageRef {
  spaceId: string
  surface: string
  /** The declaration id (slug). */
  functionId: string
}

interface LoomUsageIndex {
  /** primitive id -> functions that name it as an op. */
  byPrimitive: ReadonlyMap<string, readonly LoomUsageRef[]>
  /** `block:<type>` -> functions that read it. */
  byBlock: ReadonlyMap<string, readonly LoomUsageRef[]>
  /** Rows that no longer validate against today's manifest and schemas. */
  stranded: readonly LoomUsageRef[]
}

const EMPTY: LoomUsageIndex = { byPrimitive: new Map(), byBlock: new Map(), stranded: [] }

function push(map: Map<string, LoomUsageRef[]>, key: string, ref: LoomUsageRef): void {
  const list = map.get(key)
  if (list) list.push(ref)
  else map.set(key, [ref])
}

function rawId(declaration: unknown): string {
  return declaration && typeof declaration === 'object' ? String((declaration as { id?: unknown }).id ?? '?') : '?'
}

/** Project stored rows into the usage index. Empty when the switch is off. Never throws. */
export function projectLoomUsage(rows: readonly LoomUsageRow[], ctx: LoomContext): LoomUsageIndex {
  if (!loomFunctionsEnabled()) return EMPTY
  const byPrimitive = new Map<string, LoomUsageRef[]>()
  const byBlock = new Map<string, LoomUsageRef[]>()
  const stranded: LoomUsageRef[] = []
  for (const row of rows) {
    const checked = validateLoomFunction(row.declaration, ctx)
    if (!checked.ok) {
      stranded.push({ spaceId: row.spaceId, surface: row.surface, functionId: rawId(row.declaration) })
      continue
    }
    const fn = checked.fn
    const ref: LoomUsageRef = { spaceId: row.spaceId, surface: row.surface, functionId: fn.id }
    push(byBlock, fn.input, ref)
    for (const op of new Set(fn.steps.map((s) => s.op))) push(byPrimitive, op, ref)
  }
  return { byPrimitive, byBlock, stranded }
}

/** What retiring a primitive (or dropping a block schema) would strand: the functions that name it, and the
 *  distinct Spaces they belong to. The answer a retirement must have in hand first. */
export function retirementImpact(index: LoomUsageIndex, target: { primitive: string } | { block: string }): { functions: readonly LoomUsageRef[]; spaces: number } {
  const functions = ('primitive' in target ? index.byPrimitive.get(target.primitive) : index.byBlock.get(target.block)) ?? []
  return { functions, spaces: new Set(functions.map((f) => f.spaceId)).size }
}
