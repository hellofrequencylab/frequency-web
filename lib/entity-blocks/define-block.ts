import type { z } from 'zod'
import type { EntityKind } from './registry'
import type { FieldDef } from './block-content'

// THE BLOCK CONTRACT (E1, docs/EDITOR-ARCHITECTURE.md §3). One definition per block, in code, that
// everything else derives from: the content model (one Zod schema, surface-independent), the field
// metadata the inspector draws (a projection of that schema, never a second one), the migrations that
// carry stored content between versions, where the block may be held and shown, how it renders, and the
// plain-text form every non-visual consumer reads (search, notifications, screen readers).
//
// PURE and ADDITIVE. Nothing in the app reads a definition yet: the registry (registry.ts) stays the
// catalog the editors and renderers use, and `check:blocks` (scripts/check-blocks.mjs) holds each ADOPTED
// definition to the contract. A block joins by adoption (contract/index.ts), one at a time, so the gate is
// green on today's tree and tightens as blocks move over (ADR-1005: E1's gate quantifies over adopted rows;
// completeness over the whole catalog is E2's).

/** Where a block may be shown. A surface not listed is not offered there (§3 rule 2: `kinds` gates legality,
 *  `surfaces` gates display). */
type BlockSurface = 'profile-inapp' | 'spotlight-public' | 'space-profile' | 'space-site' | 'email'

/** The spacing and type scale a surface asks of the one component (§3 rule 4: density is a prop). */
export type BlockDensity = 'compact' | 'standard' | 'roomy'

/** One step between stored versions. `migrations[i]` takes content at version `i + 1` to `i + 2` (`up`) and
 *  back (`down`), so a block at version `v` carries exactly `v - 1` of them and the chain has no gaps. */
interface BlockMigration {
  id: string
  up: (content: unknown) => unknown
  down: (content: unknown) => unknown
}

/** What one surface asks of a block: the density it paints at, and the fields that surface edits. */
interface BlockSurfaceDisplay {
  /** DECLARED here, never passed as a className by whoever mounts the component (E3, T-3). The scale's
   *  spacing lives in density.ts. */
  density: BlockDensity
  fields: readonly string[] | '*'
}

interface BlockDefinition<S extends z.ZodType = z.ZodType> {
  /** The registry block id this definition adopts. */
  type: string
  /** The current content version. */
  v: number
  /** AXIS 1, legality: which entity kinds may hold it. Must equal the registry row's `kinds`. */
  kinds: readonly EntityKind[]
  /** `live` hits the database at render; `authored` is self-contained. A live block is legal in email only
   *  with `resolveAt: 'send'` (§3 rule 3: a live read never happens inside a renderer). */
  reads: 'live' | 'authored'
  resolveAt?: 'send'
  /** The content model, shared by every surface, forever. No presentation words. */
  content: S
  /** The inspector's field metadata. Its keys are the keys of `content`, no more and no fewer (§8.1). */
  fields: readonly FieldDef[]
  migrations: readonly BlockMigration[]
  /** AXIS 2, per-surface display: a density, and the subset of `fields` that surface edits. */
  surfaces: Partial<Record<BlockSurface, BlockSurfaceDisplay>>
  /** AXIS 3, render targets. `web` is ONE lazy component for every surface; `email` is null when the block
   *  does not render to email. */
  render: { web: () => Promise<unknown>; email: 'registered' | null }
  /** MANDATORY. The block as plain text. */
  toText: (content: z.infer<S>) => string
}

/** Declare a block. Identity at runtime: the value is the contract, typed so `toText` sees the schema's
 *  output and a missing member fails the build, not only the gate. */
export function defineBlock<S extends z.ZodType>(definition: BlockDefinition<S>): BlockDefinition<S> {
  return definition
}
