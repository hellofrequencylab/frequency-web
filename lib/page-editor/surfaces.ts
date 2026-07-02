import type { Data } from '@/lib/page-editor/types'
import { generateDefaultSpacePage } from '@/lib/page-editor/templates/space-default'
import { generateDefaultProfilePage } from '@/lib/page-editor/templates/profile-default'
import { linktreePreset } from '@/lib/page-editor/templates/linktree'

// ─────────────────────────────────────────────────────────────────────────────
// THE SURFACE REGISTRY — the typed, documented catalog of the FOUR surfaces that
// render the ONE shared block library (lib/page-editor/config.tsx). It makes
// "templates across the board" explicit and extensible: every surface names where its
// content lives, the block-library categories it leads with, how its public render
// resolves a Puck `Data` document, and its default starter template.
//
// The GUIDING PRINCIPLE (owner): ONE shared block library; per-surface templates that
// render the SAME content DISTINCTLY; content read from the same store; server-resolved
// values (live counts, friend faces) injected via Puck `metadata`, NEVER stored. See
// docs/DECISIONS.md ADR-500.
//
// This module is DOCUMENTATION + wiring, not an enforcement point: `contentSource` and
// `resolver` are human-readable notes on today's data paths, `blockPreset` is validated
// against config.categories by surfaces.test.ts, and `defaultTemplate` is the pure starter
// each editable surface seeds from. PURE: no server/Next imports (only pure templates + the
// Data type), so it is safe to import from the client editor and the RSC render alike.
// ─────────────────────────────────────────────────────────────────────────────

/** The four surfaces that compose the shared block library. */
export type SurfaceKey = 'website' | 'space' | 'spotlight' | 'user'

export interface SurfaceDef {
  key: SurfaceKey
  label: string
  /** Where this surface's content lives today (documentation, not enforced). */
  contentSource: string
  /** The block-library categories this surface leads with (subset of config.categories keys). */
  blockPreset: string[]
  /** How the public render resolves its Puck Data (documentation of the resolver). */
  resolver: string
  /** The default starter template (a pure () => Data), or null when resolved elsewhere. */
  defaultTemplate: (() => Data) | null
}

export const SURFACES: Record<SurfaceKey, SurfaceDef> = {
  // ── WEBSITE — the marketing / public site pages. Each editable page ships its OWN designed
  // starter in the templates map, so there is no single per-surface default here (resolved by slug).
  website: {
    key: 'website',
    label: 'Website',
    contentSource: 'pages table (published_data, site-scoped, space_id null)',
    blockPreset: ['sections', 'content', 'media', 'productStory', 'dynamic', 'layout'],
    resolver: 'getPublishedData(slug) -> getTemplate(slug) -> legacy bespoke render (lib/page-editor/data.ts)',
    defaultTemplate: null,
  },

  // ── SPACE — an operator-composed, multi-page profile (ADR-491). Each page stores its own Puck
  // doc; a new page (or a reset) seeds from the ONE universal Space starter.
  space: {
    key: 'space',
    label: 'Space',
    contentSource: 'spaces.preferences.pageDocs (one doc per page, space-scoped; legacy preferences.puck)',
    blockPreset: ['profile', 'spaceContent', 'dynamic', 'content', 'media'],
    resolver:
      'lib/spaces/profile-pages.ts readPageDoc (seeded from generateDefaultSpacePage), rendered by components/spaces/space-landing.tsx',
    defaultTemplate: () => generateDefaultSpacePage(''),
  },

  // ── SPOTLIGHT — the member Signal page (bio-link). The stored SpotlightLayout is bridged into a
  // Puck doc; an empty layout seeds the link-tree preset. Server values ride metadata.spotlight.
  spotlight: {
    key: 'spotlight',
    label: 'Spotlight',
    contentSource: 'profiles.meta.spotlight (SpotlightLayout)',
    resolver:
      'lib/spotlight/puck/resolve.ts spotlightPuckDoc({seedWhenEmpty:true}) + spotlightRenderMeta, rendered by components/spotlight/puck-render.tsx',
    blockPreset: ['linkTree', 'content', 'media'],
    defaultTemplate: () => linktreePreset(),
  },

  // ── USER — the member's own public page (people/[handle]). Phase B additively renders the member's
  // published Spotlight body in the in-app profile style (bespoke profile stays the primary render);
  // Phase C routes it through the SAME shared resolver as spotlight, so the two surfaces show the
  // SAME content and can never drift. Its default starter is the identity-led member page.
  user: {
    key: 'user',
    label: 'Member page',
    contentSource: 'profiles.meta.spotlight (same store as spotlight — the additive bridge, ADR-500 Phase B; no separate user store)',
    resolver:
      'lib/spotlight/puck/resolve.ts spotlightPuckDoc() (seedWhenEmpty:false) + spotlightRenderMeta, rendered by components/profile/profile-links-section.tsx under the bespoke people/[handle] profile',
    blockPreset: ['profile', 'linkTree', 'dynamic'],
    defaultTemplate: () => generateDefaultProfilePage(''),
  },
}

/** Look up a surface by key. Throws on an unknown key so a typo fails loud, never silently. */
export function getSurface(key: SurfaceKey): SurfaceDef {
  const surface = SURFACES[key]
  if (!surface) throw new Error(`Unknown surface: ${key}`)
  return surface
}
