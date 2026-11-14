import type { z } from 'zod'
import { ADOPTED_BLOCKS } from '@/lib/entity-blocks/contract'
import { LOOM_PRIMITIVES } from './primitives'
import type { LoomContext } from './validate'

// THE REAL CONTEXT A LOOM FUNCTION IS VALIDATED AGAINST (PROG-E9). Schemas are DERIVED from the adopted block
// contract (lib/entity-blocks/contract), never restated: `block:<type>` is that block's own content schema, so
// a field a block drops stops resolving in every function that read it, by itself. Primitives are the one
// manifest (./primitives.ts).

/** `block:<type>` → that adopted block's content schema. */
function loomSchemas(): ReadonlyMap<string, z.ZodType> {
  return new Map(ADOPTED_BLOCKS.map((b) => [`block:${b.type}`, b.content as z.ZodType]))
}

let cached: LoomContext | null = null

/** The context the store's write path and the read side both use. */
export function loomContext(): LoomContext {
  cached ??= { primitives: LOOM_PRIMITIVES, schemas: loomSchemas() }
  return cached
}
