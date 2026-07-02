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

// The set of block keys the current Puck config knows how to render. A stored doc
// is only trusted when every block in it is still a known block type (the same
// guard the marketing loader uses, lib/page-editor/templates/index.ts isRenderable).
const KNOWN_BLOCKS = new Set(Object.keys(config.components))

/**
 * Is `data` a renderable Puck document against the CURRENT config? True only when
 * it has a non-empty `content` array AND every block is a known block type. A doc
 * authored against a retired block set fails this, so the resolver falls back to the
 * universal default page rather than trying to render an unknown component. PURE.
 */
export function isRenderableSpaceDoc(data: unknown): data is Data {
  const content = (data as Data | null)?.content
  if (!Array.isArray(content) || content.length === 0) return false
  return content.every(
    (b) =>
      b != null &&
      typeof (b as { type?: unknown }).type === 'string' &&
      KNOWN_BLOCKS.has((b as { type: string }).type),
  )
}
