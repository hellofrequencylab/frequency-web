import type { Data } from '@/lib/page-editor/types'
import { resolveSpacePageDoc, HOME_SLUG } from './profile-pages'

// THE SPACE AUTHORED-CONTENT ADAPTER (ADR-508 U3, space mirror of lib/entity-blocks/member-adapter's
// per-type grouping). The live Space profile renders through the module engine (the block-picker grid),
// which has renderers for the DATA sections (about/highlights/events/...) bound to live space data. But
// the operator can also AUTHOR free-form CONTENT in their Home Puck doc (headings, paragraphs, images,
// galleries, quotes, embeds, dividers). This pure adapter extracts those authored content blocks from
// `resolveSpacePageDoc(preferences,'home')`, grouped by the unified content id, so the module renderer
// can show each type in its grid slot exactly like the member side does.
//
// PURE + FAIL-SAFE (no React / Next / Supabase IO): a missing / malformed doc yields an all-empty bag,
// a block with an unknown type is dropped, a hidden block is skipped. The Space DATA blocks in the doc
// (SpaceAbout / SpaceEvents / ...) are intentionally NOT mapped here — they are represented by the
// module engine's own data-block sections, so mapping them would double-render.

/** The unified CONTENT block ids a space can author (the content subset of the entity-block registry). */
export type SpaceContentBlockId =
  | 'heading'
  | 'text'
  | 'image'
  | 'gallery'
  | 'quote'
  | 'embed'
  | 'divider'

/** One authored content block lifted off the Home doc: its Puck type + props, ready to hand straight to
 *  the in-house BlockRender (a single-block doc). Kept minimal + React-free so the pure test shares it. */
export interface AuthoredContentBlock {
  type: string
  props: Record<string, unknown>
}

/** Every authored content block grouped by its unified content id, in document order. A total record
 *  (every id present), so a renderer can read any slice without a guard. */
export type SpaceAuthoredContent = Record<SpaceContentBlockId, AuthoredContentBlock[]>

/** Map the shared Puck block TYPE (the generic page-builder blocks AND the Spotlight/link-tree family a
 *  Space may also use) to the unified content id. Only content-authoring blocks appear; the Space DATA
 *  sections (SpaceAbout / SpaceEvents / ...) and structural chrome are deliberately absent. */
const PUCK_TYPE_TO_CONTENT_ID: Readonly<Record<string, SpaceContentBlockId>> = {
  // Generic page-builder content blocks (lib/page-editor/config categories: content / media / layout).
  Heading: 'heading',
  Text: 'text',
  Statement: 'text',
  Image: 'image',
  Gallery: 'gallery',
  Quote: 'quote',
  Divider: 'divider',
  // The Spotlight (link-tree) content family, shared with Spaces.
  SpotlightHeading: 'heading',
  SpotlightText: 'text',
  SpotlightImage: 'image',
  SpotlightGallery: 'gallery',
  SpotlightQuote: 'quote',
  SpotlightEmbed: 'embed',
  SpotlightDivider: 'divider',
}

/** An empty per-id bag so every content id key is present (a total record). */
function emptyAuthoredContent(): SpaceAuthoredContent {
  return { heading: [], text: [], image: [], gallery: [], quote: [], embed: [], divider: [] }
}

/**
 * Resolve the operator's authored content blocks for a space's Home page, grouped by unified content id.
 * PURE + total + FAIL-SAFE: reads the resolved Home Puck doc (stored `pageDocs.home`, legacy `puck`, or
 * the universal default), keeps only the top-level content-authoring blocks (skipping hidden blocks and
 * any type without a content mapping), and buckets them by id in document order. Any error or malformed
 * shape degrades to an all-empty bag (nothing renders), never a throw.
 */
export function resolveSpaceAuthoredContent(preferences: unknown, name: string): SpaceAuthoredContent {
  const bag = emptyAuthoredContent()
  let doc: Data
  try {
    doc = resolveSpacePageDoc(preferences, name, HOME_SLUG)
  } catch {
    return bag
  }
  const content = (doc as { content?: unknown }).content
  if (!Array.isArray(content)) return bag

  for (const raw of content) {
    if (!raw || typeof raw !== 'object') continue
    const block = raw as { type?: unknown; props?: unknown; hidden?: unknown }
    // The quick-panel `hidden` flag strips a parked block from the public page (space-blocks.ts).
    if (block.hidden === true) continue
    if (typeof block.type !== 'string') continue
    const id = PUCK_TYPE_TO_CONTENT_ID[block.type]
    if (!id) continue
    const props =
      block.props && typeof block.props === 'object' && !Array.isArray(block.props)
        ? (block.props as Record<string, unknown>)
        : {}
    bag[id].push({ type: block.type, props })
  }
  return bag
}
