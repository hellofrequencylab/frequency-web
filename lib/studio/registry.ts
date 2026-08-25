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
import { CIRCLE_MANIFEST } from './entities/circle'
import { EVENT_MANIFEST } from './entities/event'
import { HOUSING_MANIFEST } from './entities/housing'
import { JOURNEY_MANIFEST } from './entities/journey'
import { LISTING_MANIFEST } from './entities/listing'
import { PRACTICE_MANIFEST } from './entities/practice'
import { PRODUCT_MANIFEST } from './entities/product'
import { SERVICE_MANIFEST } from './entities/service'
import { SPACE_MANIFEST } from './entities/space'
import {
  BROADCAST_MANIFEST,
  CHANNEL_MANIFEST,
  HUB_MANIFEST,
  NEXUS_MANIFEST,
  ROOM_MANIFEST,
} from './entities/catalog-only'

/** Every entity the Studio knows how to create and review, in catalog order. */
export const STUDIO_ENTITIES: readonly EntityManifest[] = [
  // The gathering + growth entities a member makes.
  CIRCLE_MANIFEST,
  EVENT_MANIFEST,
  JOURNEY_MANIFEST,
  PRACTICE_MANIFEST,
  // The places a member or an operator runs. `business` is the RESEARCHED road (the Seeder, with a
  // provenance ledger and an adversarial verifier); `space` is the member's own road, same product,
  // no research pipeline behind it.
  SPACE_MANIFEST,
  BUSINESS_MANIFEST,
  // Commerce. Both listing verticals are CONNECT-ONLY (no checkout); `product` and `service` are
  // the ones that take payment. Housing is its own entity rather than a widening of `listing`:
  // they share five field paths and diverge on twenty-six, including a privacy model a classifieds
  // post has no use for. See entities/housing.ts.
  LISTING_MANIFEST,
  HOUSING_MANIFEST,
  PRODUCT_MANIFEST,
  SERVICE_MANIFEST,
  // Catalog-only (owner decision, 2026-08-11): declared so the catalog is COMPLETE and the universal
  // Create affordance can list them, but deliberately given no wizard. They declare no `accepts` and
  // no `steer`, so nothing can render a drop zone or a mood dial for them. See entities/catalog-only.ts.
  CHANNEL_MANIFEST,
  ROOM_MANIFEST,
  HUB_MANIFEST,
  NEXUS_MANIFEST,
  BROADCAST_MANIFEST,
]

const BY_ENTITY = new Map<string, EntityManifest>(STUDIO_ENTITIES.map((m) => [m.entity, m]))

/** The manifest for an entity id, or null when it is not registered. PURE + total. */
export function studioManifest(entity: string): EntityManifest | null {
  return BY_ENTITY.get(entity) ?? null
}

/** Every registered entity id, in catalog order. */
export function studioEntityIds(): string[] {
  return STUDIO_ENTITIES.map((m) => m.entity)
}
