// ─────────────────────────────────────────────────────────────────────────────
// THE STUDIO REGISTRY (docs/STUDIO.md §3, ADR-986).
//
// The catalog of creatable entities: entity id -> its manifest. This is the file STUDIO.md has
// claimed was built since ADR-143 and never was, which is why every wizard grew its own shell,
// its own field CSS, and its own review screen. It exists now.
//
// LOCKED CONTRACT, the same law as SPACE_MODULES (ADR-553) and ENTITY_BLOCKS (ADR-508):
//   * To add an entity to the Studio, add a row here pointing at its manifest. That is the
//     whole change. The Spark, the review board, the edit re-entry, and (once it lands) the
//     universal Create affordance all derive from it.
//   * NEVER hand-roll a per-entity wizard, review screen, or field renderer. If you think you
//     need to, you need a new FIELD KIND in the kernel instead, which every entity then gets.
//
// Enforced by `pnpm check:studio` plus the drift-guard tests beside this file.
//
// PURE (types + data only). Gating, launch routes, and the AI wiring join each row as the
// later phases land; the catalog is deliberately introduced with its narrowest useful shape
// rather than a speculative one.
// ─────────────────────────────────────────────────────────────────────────────

import type { EntityManifest } from './kernel/manifest'
import { BUSINESS_MANIFEST } from './entities/business'

/** Every entity the Studio knows how to create and review. */
export const STUDIO_ENTITIES: readonly EntityManifest[] = [BUSINESS_MANIFEST]

const BY_ENTITY = new Map<string, EntityManifest>(STUDIO_ENTITIES.map((m) => [m.entity, m]))

/** The manifest for an entity id, or null when it is not registered. PURE + total. */
export function studioManifest(entity: string): EntityManifest | null {
  return BY_ENTITY.get(entity) ?? null
}

/** Every registered entity id, in catalog order. */
export function studioEntityIds(): string[] {
  return STUDIO_ENTITIES.map((m) => m.entity)
}
