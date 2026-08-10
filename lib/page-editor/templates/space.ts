import type { Data } from '@/lib/page-editor/types'
import { config } from '@/lib/page-editor/config'

// ─────────────────────────────────────────────────────────────────────────────
// SPACE PAGE DOC GUARD. The type-driven template presets (Book / Schedule / Storefront /
// Hub) are retired: a Space profile is now a set of operator-composed feature-block pages,
// each seeded from the ONE universal default (lib/page-editor/templates/space-default.ts,
// generateDefaultSpacePage) and resolved per page in lib/spaces/profile-pages.ts.
//
// The only survivor here is the RENDERABILITY guard: a stored Puck doc is trusted only when
// every block in it is still a known block type against the CURRENT config, so a doc authored
// against a retired block set fails closed and the resolver falls back to the universal default.
// PURE (config is shared/pure), so it is safe to import from the profile-pages resolver, the
// edit-page + layout server actions, and the tests alike.
// ─────────────────────────────────────────────────────────────────────────────

// The set of block keys the current Puck config knows how to render.
const KNOWN_BLOCKS = new Set(Object.keys(config.components))

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

/** The types in a Space doc that no longer resolve to a component. PURE. */
export function unknownSpaceDocTypes(data: unknown): string[] {
  const content = (data as Data | null)?.content
  if (!Array.isArray(content)) return []
  const out = new Set<string>()
  for (const b of content) {
    const t = (b as { type?: unknown } | null)?.type
    if (typeof t === 'string' && !KNOWN_BLOCKS.has(t)) out.add(t)
  }
  return [...out]
}

/**
 * Every block resolves against the CURRENT config. Use ONLY to decide whether to seed
 * a brand-new page from a template — NEVER to discard a stored document. PURE.
 */
export function isFullyKnownSpaceDoc(data: unknown): data is Data {
  return isWellFormedSpaceDoc(data) && unknownSpaceDocTypes(data).length === 0
}

/** @deprecated Ambiguous, and every caller meant `isWellFormedSpaceDoc`. See ADR-978. */
export const isRenderableSpaceDoc = isFullyKnownSpaceDoc
