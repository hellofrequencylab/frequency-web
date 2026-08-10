import type { Data } from '@/lib/page-editor/types'
import { config } from '@/lib/page-editor/config'
import { data as home } from './home'
import { data as about } from './about'
import { data as spaces } from './spaces'
import { data as theLab } from './the-lab'
import { data as theCommunity } from './the-community'
import { data as theQuest } from './the-quest'
import { data as pricing } from './pricing'
import { data as circles } from './circles'
import { generateDefaultProfilePage } from './profile-default'

// Starter documents that re-create each editable page's content using the
// STANDARDIZED block library. They seed the editor when a page has no usable
// draft yet (or its stored draft predates the new blocks), so opening the editor
// always shows the page rebuilt from standard, design-system sections. Purely a
// code default — nothing is written to the database until the janitor Publishes.

// The SIX primary marketing pages each ship a designed template here, so the
// designed page is live without a DB publish (getPublishedData -> getTemplate ->
// legacy). Pricing keeps its template too (linked from Spaces; off the primary
// nav). Build / Practice / Spread were FOLDED into the six primaries: their routes
// are now 308 redirect stubs, so they no longer need templates.
const TEMPLATES: Record<string, Data> = {
  home,
  about,
  spaces,
  'the-lab': theLab,
  'the-community': theCommunity,
  'the-quest': theQuest,
  pricing,
  circles,
  // The member/user-page starter (cross-surface Puck template system, ADR-500). Registered here so
  // getTemplate('profile') returns the designed member default; the `user` surface in surfaces.ts
  // references the same generator. Keyed with a neutral (blank) name; a live seed passes the member's.
  profile: generateDefaultProfilePage(''),
}

export function getTemplate(slug: string): Data | null {
  return TEMPLATES[slug] ?? null
}

// The set of block keys the current config knows how to render.
const KNOWN_BLOCKS = new Set(Object.keys(config.components))

// A document is WELL-FORMED if it has content and every entry names a type. It says
// NOTHING about whether those types are still known — that is the renderer's problem,
// not the loader's. Use this anywhere discarding the document would lose an author's
// work: <BlockRender> already skips an item it cannot resolve (block-render.tsx), so an
// unknown block costs one section, never the page.
export function isWellFormed(data: unknown): data is Data {
  const content = (data as Data | null)?.content
  if (!Array.isArray(content) || content.length === 0) return false
  return content.every((b) => typeof b?.type === 'string')
}

// The types in a document that no longer resolve to a component. Powers the editor's
// UnknownBlock placeholder, and the doc-safety corpus in docs/EDITOR-GATES.md.
export function unknownTypes(data: unknown): string[] {
  const content = (data as Data | null)?.content
  if (!Array.isArray(content)) return []
  return [...new Set(content.map((b) => b?.type).filter((t): t is string => typeof t === 'string' && !KNOWN_BLOCKS.has(t)))]
}

// A stored document is "fully known" if every block in it still resolves. Use this ONLY
// to decide whether a brand-new page seeds from a template — NEVER to discard a stored
// document (see ADR-978: three drafts carried retired types, and this predicate meant
// opening the editor replaced them with the code template).
export function isFullyKnown(data: unknown): data is Data {
  return isWellFormed(data) && unknownTypes(data).length === 0
}

/** @deprecated Ambiguous — it conflates "well-formed" with "fully known", and callers that
 *  meant the first got the second. Use `isWellFormed` (never lose a document) or
 *  `isFullyKnown` (seed decisions). Kept so the public-page fallbacks read unchanged. */
export const isRenderable = isFullyKnown
