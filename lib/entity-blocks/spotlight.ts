// THE SPOTLIGHT BLOCK KIT, BESIDE THE ONE BLOCK REGISTRY (PROG-E2C, 2026-11-16).
//
// Until this fold the kit lived at lib/spotlight/blocks/schema.ts and was counted as its own block system.
// Every one of its nine types was already a row in the entity-block registry (./registry.ts, kind `member`):
// same id, and the registry carries the label, description and palette order. What this file adds is only
// what the registry does not hold: the STORED SHAPE of each block (the fields a member's saved layout
// carries at profiles.meta.spotlight.layout) and the limits the validator enforces. The goldens
// (./spotlight.golden.test.tsx) fail if any of the nine stops being a registry row a member may hold.
// Stored data, rendered output and the validator are byte for byte what they were; nothing was migrated.
//
// Said plainly, what is NOT unified: the renderer (components/spotlight/blocks/render.tsx) and the
// validator (lib/spotlight/blocks/validate.ts) still switch on these nine types themselves. They read this
// file for types and limits, as they read the old one.
//
// The kit itself, as before: a member arranges a small set of governed section types into their page.
// Stored as structured JSON and RENDERED SERVER-SIDE from a fixed allowlist, never raw HTML/JS. Round 1
// shipped 5 safe types (heading, text, links, image, divider); round 2 turned on image/background UPLOAD;
// round 3 added gallery, quote and stats; embeds landed behind a per-host allowlist (lib/spotlight/embeds.ts).
// The sticker layer (ADR-1275) is page CHROME beside `background`, not a block.
// PURE (types and data only, no runtime import), so the probes can load it on its own.

export const SPOTLIGHT_LAYOUT_VERSION = 1
export const MAX_BLOCKS = 40
export const MAX_LINKS_PER_BLOCK = 10
export const MAX_GALLERY_IMAGES = 12
export const HEADING_MAX = 80
export const TEXT_MAX = 1000
export const QUOTE_MAX = 280
export const CITE_MAX = 80
export const LABEL_MAX = 60
export const ALT_MAX = 140

import type { EmbedProvider } from '../spotlight/embeds'

export type BlockType = 'heading' | 'text' | 'links' | 'image' | 'gallery' | 'quote' | 'stats' | 'embed' | 'divider'
// Each BlockType is an ENTITY_BLOCKS row a member may hold, with the same id; the goldens hold the nine to the
// registry. Adding a type = a registry row first, then its stored shape here.

/** The gamification numbers a `stats` block can surface. Values are read SERVER-SIDE from
 *  the allowlisted profile row (privacy.ts) — the block only stores WHICH to show, never a
 *  member-supplied value, so the numbers can't be faked. */
export type SpotlightStatKey = 'zaps' | 'streak' | 'gems' | 'joined' | 'region'
export const SPOTLIGHT_STAT_KEYS: readonly SpotlightStatKey[] = ['zaps', 'streak', 'gems', 'joined', 'region']

/** Optional per-block colour overrides (validated hex) — they win over the page theme for
 *  just that block. `text` recolours type; `bg` recolours the block's card/surface. */
export interface BlockTint {
  text?: string
  bg?: string
}

export interface HeadingBlock {
  id: string
  type: 'heading'
  text: string
  level: 2 | 3
  tint?: BlockTint
}
export interface TextBlock {
  id: string
  type: 'text'
  text: string
  tint?: BlockTint
}
export interface LinkItem {
  label: string
  url: string
}
export interface LinksBlock {
  id: string
  type: 'links'
  items: LinkItem[]
  tint?: BlockTint
}
export interface ImageBlock {
  id: string
  type: 'image'
  /** A storage PATH in the public bucket (never a full URL) — the renderer derives the URL. */
  assetPath: string
  alt: string
  /** Focal point within the frame, 0–100 each (object-position). Default 50/50 (centred). */
  focusX?: number
  focusY?: number
  /** Zoom, 100–200 (%). Default 100. */
  zoom?: number
}
export interface GalleryItem {
  /** A storage PATH in the public bucket (never a full URL) — the renderer derives the URL. */
  assetPath: string
  alt: string
  /** Focal point within the frame, 0–100 each (object-position). Default 50/50 (centred). */
  focusX?: number
  focusY?: number
  /** Zoom, 100–200 (%). Default 100. */
  zoom?: number
}
export interface GalleryBlock {
  id: string
  type: 'gallery'
  items: GalleryItem[]
}
export interface QuoteBlock {
  id: string
  type: 'quote'
  text: string
  /** Optional attribution shown under the quote. */
  cite?: string
  tint?: BlockTint
}
export interface StatsBlock {
  id: string
  type: 'stats'
  /** Which gamification numbers to surface, in display order. The values are resolved
   *  server-side from the profile row — the block never carries the numbers themselves. */
  show: SpotlightStatKey[]
}
export interface EmbedBlock {
  id: string
  type: 'embed'
  provider: EmbedProvider
  /** The validated id/ref the renderer reconstructs the iframe src from (never a raw src). */
  ref: string
}
export interface DividerBlock {
  id: string
  type: 'divider'
  tint?: BlockTint
}

export type SpotlightBlock =
  | HeadingBlock
  | TextBlock
  | LinksBlock
  | ImageBlock
  | GalleryBlock
  | QuoteBlock
  | StatsBlock
  | EmbedBlock
  | DividerBlock

export interface SpotlightLayout {
  version: number
  blocks: SpotlightBlock[]
}

/** Page chrome (sibling of `layout`, not a block): an optional background image. */
export interface SpotlightBackground {
  /** Storage path in the public bucket, or null/absent for none. */
  assetPath: string | null
  /** 0–80: how much to dim the background so text stays readable. */
  dim: number
  /** Focal point within the frame, 0–100 each (object-position). Default 50/50 (centred). */
  focusX: number
  focusY: number
  /** Zoom, 100–200 (%). Default 100. */
  zoom: number
}

export const EMPTY_LAYOUT: SpotlightLayout = { version: SPOTLIGHT_LAYOUT_VERSION, blocks: [] }

