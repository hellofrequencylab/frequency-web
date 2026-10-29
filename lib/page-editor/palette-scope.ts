// PER-SURFACE PALETTE SCOPE — which block CATEGORIES an editor surface may offer.
//
// One shared block library (lib/page-editor/config.tsx, 87 components in 11 categories)
// feeds every editor, so with no filter a marketing page's "Add block" palette offered
// the entire Space profile set. Measured against the live config on 2026-08-24: of the 20
// blocks in the `profile` + `spaceContent` categories, 13 render EXACTLY NOTHING on a page
// with no `metadata.space` (a silent no-op section an operator can place, save and
// publish), 3 render an empty wrapper, and 5 render from their own props. Nothing throws —
// the cost is a dead section plus a palette far longer than the surface can use.
//
// The fix is an ALLOWLIST OF CATEGORY KEYS per surface: the offer is narrowed by DATA, the
// same shape as the entity-block registry's curated palettes (EMAIL_PALETTE_BLOCK_IDS /
// KIND_PALETTE_EXCLUSIONS in lib/entity-blocks/registry.ts), never by a conditional in the
// render. Adding a surface or moving a category is a row edit here, not an editor edit.
//
// PURE + framework-free (no React, no Puck runtime, no Next), like block-limits.ts beside
// it, so the desktop palette, the phone palette and the tests all read ONE policy.
//
// SCOPE NOTE: this narrows what a palette OFFERS. It never touches the renderer, so a
// document that already contains an out-of-scope block still renders exactly as before —
// narrowing can hide a block from the picker, it can never drop one from a saved page.

/** The editor surfaces that mount the shared block library today.
 *  • `marketing` — the janitor page editor at /edit/[slug] (the `pages` table, space_id NULL).
 *  • `space`     — a Space's own page editor at /spaces/[slug]/edit-page (spaces.preferences.pageDocs).
 *  A new surface adds a member here AND a row in SURFACE_CATEGORIES: the exhaustive Record
 *  below makes forgetting the row a TYPE ERROR rather than a silently empty palette. */
export type EditorSurface = 'marketing' | 'space' | 'website'

/** The category keys (lib/page-editor/config.tsx `categories`) each surface may offer.
 *
 *  Every key in the config belongs to at least one surface — palette-scope.test.ts asserts the
 *  union is EXACTLY the config's key set, so adding a category to the library fails the suite
 *  until it is placed here. That is the anti-drift half: a new category can never quietly appear
 *  on every surface, nor quietly appear on none.
 *
 *  Why each Space-only category is off the marketing list (all three measured, see the header):
 *   • `profile` + `spaceContent` — every dynamic one reads `puck.metadata.space`, which only the
 *     Space landing render path injects (components/spaces/space-landing.tsx:117).
 *   • `linkTree` — the member Spotlight / brand-Space link-tree set; it reads the same Space
 *     identity metadata and has no marketing page to bind to.
 *  And why `circles` is off the Space list: those blocks read `puck.metadata.circlesIndex`, which
 *  only app/(main)/circles/page.tsx injects, so on a Space page they render nothing.
 *
 *  The generic kit (blocks, layout, content, sections, productStory, media, dynamic) renders from
 *  its own props on every surface — verified block by block — so both surfaces keep all of it. */
export const SURFACE_CATEGORIES: Record<EditorSurface, readonly string[]> = {
  website: ['blocks', 'layout', 'content', 'sections', 'productStory', 'media', 'dynamic', 'profile', 'spaceContent', 'wildheart', 'network', 'networkKit', 'temple', 'templeKit', 'midnight', 'midnightPractice', 'designer', 'freeHuman'],
  marketing: [
    'blocks',
    'layout',
    'content',
    'sections',
    'productStory',
    'media',
    'dynamic',
    'circles',
  ],
  space: [
    'blocks',
    'layout',
    'content',
    'sections',
    'productStory',
    'media',
    'dynamic',
    'profile',
    'spaceContent',
    'linkTree',
  ],
}

/** The category keys `surface` may offer, or `null` for "do not scope at all".
 *
 *  FAIL-SAFE DIRECTION — deliberately OPEN, never closed. An unrecognised surface (only
 *  reachable past the type system, e.g. a cast or a value crossing a serialization boundary)
 *  returns `null`, so the caller offers the FULL palette. An editor with a wide palette is a
 *  cosmetic problem; an editor with an EMPTY palette cannot author anything at all, and would
 *  present as "the editor is broken" with no way for an operator to recover.
 *
 *  The open direction is not silent: `SURFACE_CATEGORIES` is an exhaustive `Record` over
 *  `EditorSurface`, so a real new surface with no row fails `tsc`; both editor components take a
 *  REQUIRED `surface` prop, so a new mount cannot omit it; and palette-scope.test.ts pins both
 *  call sites at the source level, so deleting the argument fails the suite. */
export function categoryKeysForSurface(surface: EditorSurface): ReadonlySet<string> | null {
  const keys = SURFACE_CATEGORIES[surface] as readonly string[] | undefined
  return keys ? new Set(keys) : null
}

/** The theme-named block families (config categories), and the website theme that styles each (LIVE-1854). A family's
 *  CSS lives in its own theme's sheet, so on any other theme its blocks render bare (docs/THEME-COHESION.md, the
 *  2026-10-28 audit: 4 to 25 percent of their themed classes have a rule off-theme). `network` is the exception, its
 *  island sheet styles it on every theme, so it is portable and offered everywhere. Keys are WebsiteTheme values. */
const FAMILY_OWNER: Record<string, string> = {
  wildheart: 'Wildheart',
  networkKit: 'NetworkKit',
  temple: 'Temple',
  templeKit: 'TempleKit',
  midnight: 'Midnight',
  midnightPractice: 'Midnight',
  designer: 'Designer',
  freeHuman: 'FreeHuman',
}

/** Every family category the palette scopes by theme. palette-scope.test.ts pins this against the config, so a new
 *  family cannot join without an owner. */
export const THEME_FAMILY_CATEGORIES: readonly string[] = Object.keys(FAMILY_OWNER)

/** The family categories a website theme may offer. A theme this build does not know offers none, so the palette
 *  never shows a block that cannot be styled. Pass nothing to scope by surface alone (existing callers). */
export function categoriesForTheme(theme: string | null | undefined): ReadonlySet<string> {
  return new Set(THEME_FAMILY_CATEGORIES.filter((key) => FAMILY_OWNER[key] === theme))
}

/** `categoryKeysForSurface`, narrowed to the theme: a family appears only on its own theme. Hides from the picker only;
 *  a saved block of any family keeps rendering exactly as before. */
export function categoryKeysForSurfaceAndTheme(surface: EditorSurface, theme: string | null | undefined): ReadonlySet<string> | null {
  const base = categoryKeysForSurface(surface)
  if (!base || theme === undefined) return base
  const own = categoriesForTheme(theme)
  return new Set([...base].filter((key) => !THEME_FAMILY_CATEGORIES.includes(key) || own.has(key)))
}
