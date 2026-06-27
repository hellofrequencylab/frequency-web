// The Spotlight "block kit": a member arranges a small set of governed section types
// into their page. Stored as structured JSON at profiles.meta.spotlight.layout and
// RENDERED SERVER-SIDE from a fixed allowlist — never raw HTML/JS. This file is the
// single source of truth (types + limits); the validator, the renderer, and the
// editor palette all read it, so adding a block type is one place.
//
// Round 1 ships 5 safe types: heading, text, links, image, divider. Embeds/music/
// gallery/stats/ember are deferred (each needs its own host-allowlist / validation).

export const SPOTLIGHT_LAYOUT_VERSION = 1
export const MAX_BLOCKS = 40
export const MAX_LINKS_PER_BLOCK = 10
export const HEADING_MAX = 80
export const TEXT_MAX = 1000
export const LABEL_MAX = 60
export const ALT_MAX = 140

export type BlockType = 'heading' | 'text' | 'links' | 'image' | 'divider'

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
export interface DividerBlock {
  id: string
  type: 'divider'
}

export type SpotlightBlock = HeadingBlock | TextBlock | LinksBlock | ImageBlock | DividerBlock

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
  { type: 'divider', label: 'Divider' },
]
