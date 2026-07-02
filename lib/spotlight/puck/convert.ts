// The MIGRATION-FREE BRIDGE between the stored Spotlight layout (profiles.meta.
// spotlight.layout — the bespoke SpotlightLayout schema) and a Puck `Data` document.
// PURE (no IO/React), so it round-trips in a unit test and is safe to import from both
// the client editor and the RSC render path.
//
// WHY A BRIDGE, NOT A MIGRATION: every existing spotlight keeps its data exactly where
// it is (meta.spotlight.layout). On READ we lift it into Puck so the same shared engine
// renders + edits it; on SAVE we lower the Puck document back into the SpotlightLayout
// schema and hand it to the UNCHANGED saveSpotlightLayout server action, which validates
// it against the same allowlist as before. No column, no schema, no backfill changes.
//
// LOSSLESS: each SpotlightBlock maps 1:1 to a dedicated `Spotlight*` Puck block whose
// props ARE the block's fields (plus the id). `spotlightLayoutToPuck` then
// `puckToSpotlightLayout` returns the input unchanged (proven in convert.test.ts). The
// server-resolved blocks (Stats which stores only `show`, TopFriends which stores only a
// title) carry no values in either representation, so they round-trip on their config
// alone — the numbers/faces are injected at render via metadata, never stored.

import type { Data } from '@/lib/page-editor/types'
import {
  type SpotlightBlock,
  type SpotlightLayout,
  type SpotlightStatKey,
  SPOTLIGHT_LAYOUT_VERSION,
} from '@/lib/spotlight/blocks/schema'

// The Puck block `type` keys for each Spotlight block, kept in ONE map so the converter,
// the block registry (components/page-editor/blocks/linktree.tsx), and the preset all
// agree. Namespaced `Spotlight*` so they never collide with a marketing block of a
// similar name (Image, Gallery, Quote, Divider all already exist in the shared config).
export const SPOTLIGHT_PUCK_TYPES = {
  heading: 'SpotlightHeading',
  text: 'SpotlightText',
  links: 'LinkTree',
  image: 'SpotlightImage',
  gallery: 'SpotlightGallery',
  quote: 'SpotlightQuote',
  stats: 'SpotlightStats',
  topfriends: 'TopFriends',
  embed: 'SpotlightEmbed',
  divider: 'SpotlightDivider',
} as const

/** The reverse lookup: a Puck block `type` -> the Spotlight block `type`. */
const SPOTLIGHT_TYPE_BY_PUCK: Record<string, SpotlightBlock['type']> = Object.fromEntries(
  Object.entries(SPOTLIGHT_PUCK_TYPES).map(([k, v]) => [v, k as SpotlightBlock['type']]),
)

/** The set of Puck block keys this bridge owns — used to tell a Spotlight doc apart from
 *  a foreign (marketing) block that has no Spotlight equivalent. */
export const SPOTLIGHT_PUCK_TYPE_SET = new Set<string>(Object.values(SPOTLIGHT_PUCK_TYPES))

type PuckItem = { type: string; props: Record<string, unknown> }

// ── Layout -> Puck ────────────────────────────────────────────────────────────

/** Lift ONE validated SpotlightBlock into a Puck content item. The block's fields become
 *  the item's props; the id rides `props.id` (Puck's stable per-item key). */
function blockToItem(block: SpotlightBlock): PuckItem {
  const type = SPOTLIGHT_PUCK_TYPES[block.type]
  // Spread everything except the discriminant `type` (Puck holds it as `item.type`),
  // keeping `id` + every field verbatim so the reverse is exact.
  const rest: Record<string, unknown> = { ...block }
  delete rest.type
  const props = rest
  // ADAPTER (stats only): the stored schema is a FLAT SpotlightStatKey[] (`show`), but a
  // Puck array field needs object rows, so the block edits it as [{ key }]. Wrap on the
  // way in; `itemToBlock` unwraps on the way out. Every other block is a 1:1 prop pass.
  if (block.type === 'stats') {
    props.show = block.show.map((key) => ({ key }))
  }
  return { type, props }
}

/**
 * Convert a stored SpotlightLayout into a Puck `Data` document. PURE + total: an empty
 * layout yields an empty document, so a member who hasn't customized still opens a valid
 * (empty) Puck canvas. `root` is always `{}` (the Spotlight identity header + theme live
 * OUTSIDE the Puck body, exactly as today — see the render bridge).
 */
export function spotlightLayoutToPuck(layout: SpotlightLayout | null | undefined): Data {
  const blocks = layout?.blocks ?? []
  return {
    root: {},
    content: blocks.map(blockToItem),
  }
}

// ── Puck -> Layout ────────────────────────────────────────────────────────────

/**
 * Lower ONE Puck content item back into a SpotlightBlock, or null to drop it (an unknown
 * / foreign block type). The reverse of `blockToItem`: the item's props ARE the block's
 * fields, the item's `type` reselects the discriminant. This produces a RAW block shape;
 * the caller runs it through validateSpotlightLayout before it is ever stored or rendered,
 * so this stays a pure re-shaping step with no trust of its own.
 */
function itemToBlock(item: unknown): Record<string, unknown> | null {
  if (!item || typeof item !== 'object') return null
  const it = item as { type?: unknown; props?: unknown }
  if (typeof it.type !== 'string') return null
  const spotType = SPOTLIGHT_TYPE_BY_PUCK[it.type]
  if (!spotType) return null // a foreign block (no Spotlight equivalent) is dropped
  const props = (it.props && typeof it.props === 'object' ? it.props : {}) as Record<string, unknown>
  const out: Record<string, unknown> = { ...props, type: spotType }
  // ADAPTER (stats only): unwrap the editor's [{ key }] rows back into the stored FLAT
  // SpotlightStatKey[] the schema + validator expect. Mirrors the wrap in `blockToItem`.
  if (spotType === 'stats') {
    out.show = Array.isArray(props.show)
      ? (props.show as unknown[])
          .map((r) => (r && typeof r === 'object' ? (r as { key?: unknown }).key : r))
          .filter((k): k is string => typeof k === 'string')
      : []
  }
  // Re-stamp the discriminant; keep every prop (id + fields) verbatim.
  return out
}

/**
 * Convert a Puck `Data` document back into a RAW SpotlightLayout (blocks carry their
 * stored fields; foreign blocks are dropped). PURE + total. The result is intended to be
 * handed straight to `validateSpotlightLayout` (which coerces it to the safe subset,
 * clamps every field, and pins asset paths to the owner) before persisting — this bridge
 * only re-shapes, it does not validate.
 */
export function puckToSpotlightLayout(data: Data | null | undefined): SpotlightLayout {
  const content = Array.isArray(data?.content) ? data!.content : []
  const blocks = content
    .map(itemToBlock)
    .filter((b): b is Record<string, unknown> => b !== null)
  return {
    version: SPOTLIGHT_LAYOUT_VERSION,
    // Cast: these are RAW blocks (unvalidated). The validator narrows them to SpotlightBlock.
    blocks: blocks as unknown as SpotlightBlock[],
  }
}

// ── Small typed helpers the blocks + preset share ───────────────────────────────

/** The Spotlight stat keys, re-exported as the union the LinkTree stat block toggles. */
export type { SpotlightStatKey }
