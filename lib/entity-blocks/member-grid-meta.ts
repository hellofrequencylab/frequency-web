import { parseEntityLayout, type EntityLayout } from './layout'

// Where a MEMBER's unified grid layout (ADR-508, U2b) lives inside the opaque profiles.meta jsonb, and
// how to read / merge it. Deliberately SEPARATE from the live Spotlight nodes (meta.spotlight.layout /
// theme / background): the grid is an additive preview surface, so writing it must NEVER touch what the
// public Puck Spotlight renders. Stored at the top-level `meta.entityGrid` key; every reader/writer goes
// through here so the path is spelled out once. Pure (no IO / React), so it round-trips in a unit test
// and is safe to import from an RSC, a pure lib, or the write action alike. Fail-safe on READ: a
// malformed node parses to null and the fresh default stands.

type GridMeta = { entityGrid?: unknown } & Record<string, unknown>

/** Read the member's saved grid layout off their meta blob, fail-safe (null when absent / malformed). */
export function readMemberGridLayout(meta: unknown): EntityLayout | null {
  return parseEntityLayout((meta as GridMeta | null | undefined)?.entityGrid)
}

/**
 * Merge a grid layout into meta at `entityGrid`, preserving every other key (INCLUDING the live
 * meta.spotlight nodes). A null / empty layout clears the node (back to the fresh default). The caller
 * is responsible for sanitizing the layout (sanitizeEntityLayout) before persisting.
 */
export function withMemberGridLayout(meta: unknown, layout: EntityLayout | null): Record<string, unknown> {
  const base = (meta ?? {}) as GridMeta
  const empty =
    !layout || (!layout.rows && !layout.template && !layout.slots && !layout.order && !layout.hidden)
  if (empty) {
    const next = { ...base }
    delete next.entityGrid
    return next
  }
  return { ...base, entityGrid: layout }
}
