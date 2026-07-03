// Splash TEMPLATE seed — the code-backed, idempotent catalog of reusable splash starters the Loom
// Studio Splash lane CATALOGS (docs/LOOM-PLATFORM.md §4, docs/PAGE-FRAMEWORK.md §10). Mirrors the
// element/App pattern: code is the source of truth and the Loom indexes it read-only, so the lane
// never drifts into a stale DB copy. These map to the Puck starters in lib/page-editor/templates/*.
//
// 🔴 §10 BOUNDARY: a splash template is CATALOGED here; it is NOT edited in the Loom. Each entry
// carries a `composeHref` that DEEP-LINKS OUT to the real editor (the Puck micro-site editor at
// /edit/<slug>, or the QR studio for the constrained QR splash form). The Loom is never the block
// editor for a splash.
//
// PURE: no Supabase / Next / server-only imports, so this catalog is fully unit-testable and safe to
// type-import from the client lane. VOICE (CONTENT-VOICE §10): plain labels, no narrated feelings,
// no em/en dashes.

/** A splash template kind. Reuses the reserved Loom kinds (lib/library/types.ts): a single reusable
 *  block instance is a `template`; a multi-block fragment (a whole landing) is a `flow`. */
export type SplashTemplateKind = 'template' | 'flow'

/** One cataloged splash template — pure, serializable metadata (the browse-card model). */
export interface SplashTemplate {
  id: string
  /** The card title (voice canon). */
  title: string
  /** template (one block) or flow (a multi-block landing). */
  kind: SplashTemplateKind
  /** Always 'splash' — the Loom `category` this lane manages. */
  category: 'splash'
  /** One plain line: what the template is for. */
  description: string
  /** The Puck starter slug this template seeds from (lib/page-editor/templates/*), when applicable. */
  sourceSlug?: string
  /** DEEP-LINK OUT to the real editor to compose from this template (never edited in the Loom). */
  composeHref: string
  /** A short label for the deep-link affordance. */
  composeLabel: string
}

/** THE seeded splash templates. Idempotent by construction (a fixed, code-defined list); adding one
 *  is a catalog row, not a migration. Each `composeHref` leaves the Loom for the real editor. */
export const SPLASH_TEMPLATES: readonly SplashTemplate[] = [
  {
    id: 'splash-home',
    title: 'Home splash',
    kind: 'flow',
    category: 'splash',
    description:
      'The front-door landing: a hero, the three ways in, live proof, a short FAQ, and one call to action.',
    sourceSlug: 'home',
    composeHref: '/edit/home',
    composeLabel: 'Open in the page editor',
  },
  {
    id: 'splash-landing',
    title: 'Marketing landing',
    kind: 'template',
    category: 'splash',
    description: 'A single marketing page: a hero, a few designed sections, and a call to action.',
    sourceSlug: 'spaces',
    composeHref: '/edit/spaces',
    composeLabel: 'Open in the page editor',
  },
  {
    id: 'splash-qr',
    title: 'QR splash',
    kind: 'template',
    category: 'splash',
    description: 'Where a scan lands: a heading, a short blurb, an image, and up to five links.',
    composeHref: '/admin/qr',
    composeLabel: 'Open the QR studio',
  },
] as const

/** The seeded splash templates (the read helper the lane + tests call). Pure. */
export function listSplashTemplates(): readonly SplashTemplate[] {
  return SPLASH_TEMPLATES
}

/** One splash template by id, or null. Pure. */
export function splashTemplateById(id: string): SplashTemplate | null {
  return SPLASH_TEMPLATES.find((t) => t.id === id) ?? null
}

/** A DEEP-LINK OUT for a where-referenced usage row (the "Used in" index reads public.library_usages
 *  via lib/library/splash-registry). A `page` usage opens the Puck micro-site editor at /edit/<slug>;
 *  the other contexts (space_brand / spotlight / email / other) have no single splash editor route we
 *  can safely target, so they render as a plain label. Never links inside the Loom (§10). Pure. */
export function splashUsageHref(context: string, refId: string | null): string | null {
  if (!refId) return null
  return context === 'page' ? `/edit/${refId}` : null
}
