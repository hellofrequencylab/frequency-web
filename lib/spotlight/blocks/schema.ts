// The Spotlight "block kit": a member arranges a small set of governed section types
// into their page. Stored as structured JSON at profiles.meta.spotlight.layout and
// RENDERED SERVER-SIDE from a fixed allowlist — never raw HTML/JS. This file is the
// single source of truth (types + limits); the validator, the renderer, and the
// editor palette all read it, so adding a block type is one place.
//
// Round 1 shipped 5 safe types (heading, text, links, image, divider); round 2 turned on
// image/background UPLOAD. Round 3 adds 3 more SELF-CONTAINED composition blocks — gallery
// (multi-image), quote (callout), stats (member picks which gamification numbers to show) —
// all rendered from the same closed allowlist, no new external hosts. Embeds/music (which
// need a per-host iframe allowlist) and earned cosmetics are still deferred.

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

export type BlockType = 'heading' | 'text' | 'links' | 'image' | 'gallery' | 'quote' | 'stats' | 'divider'

/** The gamification numbers a `stats` block can surface. Values are read SERVER-SIDE from
 *  the allowlisted profile row (privacy.ts) — the block only stores WHICH to show, never a
 *  member-supplied value, so the numbers can't be faked. */
export type SpotlightStatKey = 'streak' | 'gems' | 'joined' | 'region'
export const SPOTLIGHT_STAT_KEYS: readonly SpotlightStatKey[] = ['streak', 'gems', 'joined', 'region']

export interface HeadingBlock {
  id: string
  type: 'heading'
  text: string
  level: 2 | 3
}
export interface TextBlock {
  id: string
  type: 'text'
  text: string
}
export interface LinkItem {
  label: string
  url: string
}
export interface LinksBlock {
  id: string
  type: 'links'
  items: LinkItem[]
}
export interface ImageBlock {
  id: string
  type: 'image'
  /** A storage PATH in the public bucket (never a full URL) — the renderer derives the URL. */
  assetPath: string
  alt: string
}
export interface GalleryItem {
  /** A storage PATH in the public bucket (never a full URL) — the renderer derives the URL. */
  assetPath: string
  alt: string
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
}
export interface StatsBlock {
  id: string
  type: 'stats'
  /** Which gamification numbers to surface, in display order. The values are resolved
   *  server-side from the profile row — the block never carries the numbers themselves. */
  show: SpotlightStatKey[]
}
export interface DividerBlock {
  id: string
  type: 'divider'
}

export type SpotlightBlock =
  | HeadingBlock
  | TextBlock
  | LinksBlock
  | ImageBlock
  | GalleryBlock
  | QuoteBlock
  | StatsBlock
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
}

export const EMPTY_LAYOUT: SpotlightLayout = { version: SPOTLIGHT_LAYOUT_VERSION, blocks: [] }

/** The block types a member can add, in palette order, with a label for the editor. */
export const BLOCK_PALETTE: { type: BlockType; label: string }[] = [
  { type: 'heading', label: 'Heading' },
  { type: 'text', label: 'Text' },
  { type: 'links', label: 'Links' },
  { type: 'image', label: 'Image' },
  { type: 'gallery', label: 'Gallery' },
  { type: 'quote', label: 'Quote' },
  { type: 'stats', label: 'Stats' },
  { type: 'divider', label: 'Divider' },
]
