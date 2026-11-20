import type { Data } from '@/lib/page-editor/types'

// The Space doc SHAPE check, in a module that imports no block (PERF-030).
//
// lib/page-editor/templates/space.ts needs the whole Puck config to answer "does every block still
// resolve", so importing it for this pure shape check dragged EVERY block component, every site kit's
// client islands included, into whatever imported it. lib/spaces/profile-pages.ts did, and through it
// lib/sites/profile-canonical.ts and lib/spaces/discovery.ts, which the home page, /discover,
// /north-county-san-diego and the sitemap reach: a 183 KB client chunk, about 98% unused, on each of
// them. templates/space.ts re-exports this, so its callers are unchanged.

/**
 * Is `data` a well-formed Puck document? Non-empty `content`, every entry naming a
 * type. Says NOTHING about whether those types still resolve — that is the
 * renderer's problem, not the loader's, and <BlockRender> already skips a block it
 * cannot resolve. PURE.
 *
 * This is the Space twin of `isWellFormed` (templates/index.ts) and it exists for the
 * reason recorded in ADR-978: the predicate it replaces answered "does every type
 * resolve", every caller read it as "can I use this document", and the gap between
 * those two questions is where an author's work went. A Space carries far more stored
 * documents than the eight marketing slugs, so the same bug here is the same bug at
 * a much larger scale.
 */
export function isWellFormedSpaceDoc(data: unknown): data is Data {
  const content = (data as Data | null)?.content
  if (!Array.isArray(content) || content.length === 0) return false
  return content.every((b) => b != null && typeof (b as { type?: unknown }).type === 'string')
}
