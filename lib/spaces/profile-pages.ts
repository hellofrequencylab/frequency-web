import type { Data } from '@measured/puck'
import { isRenderableSpaceDoc } from '@/lib/page-editor/templates/space'
import { generateDefaultSpacePage } from '@/lib/page-editor/templates/space-default'

// ─────────────────────────────────────────────────────────────────────────────
// SPACE PROFILE PAGES — the operator-defined multi-page nav + per-page Puck docs.
//
// A Space profile is a set of freely-arranged Puck feature-block pages. The nav is
// operator-defined: `home` is the required index; the operator adds / renames / reorders /
// deletes further pages. Each page stores its OWN Puck document. The model lives on the
// existing `spaces.preferences` JSONB (additive, no new column):
//
//   preferences.pages    : ProfilePage[]                 // ordered nav; home first, required
//   preferences.pageDocs : Record<pageSlug, PuckData>    // one doc per page
//
// BACKWARD COMPATIBILITY (lazy migration, no SQL): before this model, a Space stored ONE
// landing doc at `preferences.puck`. `readPageDoc(prefs, 'home')` falls back to that legacy
// doc when `pageDocs.home` is absent, so every existing Space keeps rendering; the first
// per-page publish writes `pageDocs.home` and the profile moves onto the new model.
//
// PURE: no Supabase / Next imports. Every reader is tolerant (a malformed blob yields the
// fail-safe default), and every mutator returns a NEW preferences object (immutable), so the
// server actions can read-modify-write without side effects. Slugs are validated against a
// RESERVED set so a page can never shadow an owner route (/manage, /settings, /crm, /edit-page).
// ─────────────────────────────────────────────────────────────────────────────

export interface ProfilePage {
  /** URL segment under /spaces/<space>/<slug>. `home` renders at the profile index. */
  slug: string
  /** The nav label shown in the profile nav bar. */
  label: string
  /** The required, non-deletable index page (only `home`). */
  system?: boolean
}

/** The index page slug (renders at /spaces/<space>, no extra segment). */
export const HOME_SLUG = 'home'

/** The most pages a Space may expose in its nav (research guardrail: keep nav small). */
export const MAX_PROFILE_PAGES = 6

/** Slugs a custom page may NOT use: `home` (the system index) + the owner-route segments a
 *  page would otherwise shadow. Kept lowercase; matching is case-insensitive via validation. */
export const RESERVED_PAGE_SLUGS: ReadonlySet<string> = new Set([
  HOME_SLUG,
  'manage',
  'settings',
  'crm',
  'edit-page',
  'api',
])

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const MAX_SLUG_LEN = 40
const MAX_LABEL_LEN = 40

/** The default nav for a Space with no configured pages: just the required Home index. */
export function defaultProfilePages(): ProfilePage[] {
  return [{ slug: HOME_SLUG, label: 'Home', system: true }]
}

/** A slug is reserved when it is `home` or an owner-route segment. */
export function isReservedSlug(slug: string): boolean {
  return RESERVED_PAGE_SLUGS.has(slug.trim().toLowerCase())
}

/** A valid CUSTOM page slug: lowercase kebab, url-safe, 1..40 chars, and NOT reserved.
 *  (The `home` slug is valid as the system page but never as an operator-created one, so it
 *  is reserved here.) */
export function isValidPageSlug(slug: string): boolean {
  const s = slug.trim().toLowerCase()
  if (s.length === 0 || s.length > MAX_SLUG_LEN) return false
  if (!SLUG_RE.test(s)) return false
  return !isReservedSlug(s)
}

/** Derive a url-safe slug from a human label (lowercase, kebab, stripped). Empty when the
 *  label has no url-safe characters (the caller then rejects or asks for a slug). */
export function slugifyLabel(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LEN)
    .replace(/-+$/g, '')
}

function asRecord(preferences: unknown): Record<string, unknown> | null {
  if (!preferences || typeof preferences !== 'object' || Array.isArray(preferences)) return null
  return preferences as Record<string, unknown>
}

function cleanLabel(label: unknown, fallback: string): string {
  const s = typeof label === 'string' ? label.trim() : ''
  return s ? s.slice(0, MAX_LABEL_LEN) : fallback
}

/**
 * Read the ordered nav from preferences. Tolerant + total: filters invalid rows, dedupes by
 * slug, and GUARANTEES the required Home index leads the list (synthesized if absent). Falls
 * back to the default nav for any malformed blob. Never returns more than MAX_PROFILE_PAGES.
 */
export function readProfilePages(preferences: unknown): ProfilePage[] {
  const rec = asRecord(preferences)
  const raw = rec?.pages
  if (!Array.isArray(raw)) return defaultProfilePages()

  const seen = new Set<string>()
  const custom: ProfilePage[] = []
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue
    const slug = String((row as { slug?: unknown }).slug ?? '').trim().toLowerCase()
    if (slug === HOME_SLUG) continue // home is synthesized below, always first
    if (!isValidPageSlug(slug) || seen.has(slug)) continue
    seen.add(slug)
    custom.push({ slug, label: cleanLabel((row as { label?: unknown }).label, slug) })
    if (custom.length >= MAX_PROFILE_PAGES - 1) break
  }

  // Home always leads; its label may be customized on the stored home row.
  const homeRow = raw.find(
    (r) => r && typeof r === 'object' && String((r as { slug?: unknown }).slug ?? '').toLowerCase() === HOME_SLUG,
  )
  const homeLabel = cleanLabel((homeRow as { label?: unknown } | undefined)?.label, 'Home')
  return [{ slug: HOME_SLUG, label: homeLabel, system: true }, ...custom]
}

/** Read the raw pageDocs map (or null). */
function readPageDocs(preferences: unknown): Record<string, unknown> | null {
  const rec = asRecord(preferences)
  const docs = rec?.pageDocs
  if (!docs || typeof docs !== 'object' || Array.isArray(docs)) return null
  return docs as Record<string, unknown>
}

/**
 * The stored, VALID Puck doc for a page, or null. Reads `preferences.pageDocs[slug]`; for the
 * Home page it FALLS BACK to the legacy single doc at `preferences.puck` (lazy migration) when
 * no `pageDocs.home` exists, so pre-model Spaces keep rendering. PURE.
 */
export function readPageDoc(preferences: unknown, slug: string): Data | null {
  const docs = readPageDocs(preferences)
  const raw = docs?.[slug]
  if (isRenderableSpaceDoc(raw)) return raw
  if (slug === HOME_SLUG) {
    // Legacy fallback: the pre-model single landing doc.
    const legacy = asRecord(preferences)?.puck
    if (isRenderableSpaceDoc(legacy)) return legacy
  }
  return null
}

/**
 * Resolve the Puck doc for a page: the stored valid doc wins, else the ONE universal default
 * page (seeded with the Space name). FAIL-SAFE: a missing / malformed / stale-block doc all
 * fall through to the default, so every page always renders. PURE.
 */
export function resolveSpacePageDoc(preferences: unknown, name: string, slug: string): Data {
  return readPageDoc(preferences, slug) ?? generateDefaultSpacePage(name)
}

/** Does a page with this slug exist in the nav? (home always does.) */
export function hasPage(preferences: unknown, slug: string): boolean {
  const s = slug.trim().toLowerCase()
  if (s === HOME_SLUG) return true
  return readProfilePages(preferences).some((p) => p.slug === s)
}

// ── Pure mutators (read-modify-write helpers for the server actions) ─────────────────────
// Each returns a NEW preferences object; none mutate the input. They keep `pages` + `pageDocs`
// consistent (a removed page drops its doc; a new page seeds nothing until published).

function baseRecord(preferences: unknown): Record<string, unknown> {
  return { ...(asRecord(preferences) ?? {}) }
}

/** Persist a page's Puck doc. */
export function withPageDoc(preferences: unknown, slug: string, doc: Data): Record<string, unknown> {
  const next = baseRecord(preferences)
  const docs = { ...(readPageDocs(preferences) ?? {}) }
  docs[slug] = doc
  next.pageDocs = docs
  return next
}

/** Add a new custom page (validated slug, non-reserved, under the cap, no duplicate). Returns
 *  the input unchanged when the add is invalid (the action surfaces the reason separately). */
export function addPage(preferences: unknown, slug: string, label: string): Record<string, unknown> {
  const s = slug.trim().toLowerCase()
  const pages = readProfilePages(preferences)
  if (!isValidPageSlug(s) || pages.some((p) => p.slug === s) || pages.length >= MAX_PROFILE_PAGES) {
    return baseRecord(preferences)
  }
  const next = baseRecord(preferences)
  next.pages = [...pages, { slug: s, label: cleanLabel(label, s) }]
  return next
}

/** Rename any page's nav label (including Home). */
export function renamePage(preferences: unknown, slug: string, label: string): Record<string, unknown> {
  const s = slug.trim().toLowerCase()
  const next = baseRecord(preferences)
  next.pages = readProfilePages(preferences).map((p) =>
    p.slug === s ? { ...p, label: cleanLabel(label, p.label) } : p,
  )
  return next
}

/** Remove a custom page (never Home) and drop its stored doc. */
export function removePage(preferences: unknown, slug: string): Record<string, unknown> {
  const s = slug.trim().toLowerCase()
  if (s === HOME_SLUG) return baseRecord(preferences)
  const next = baseRecord(preferences)
  next.pages = readProfilePages(preferences).filter((p) => p.slug !== s)
  const docs = readPageDocs(preferences)
  if (docs && s in docs) {
    const nextDocs = { ...docs }
    delete nextDocs[s]
    next.pageDocs = nextDocs
  }
  return next
}

/** Reorder the nav to the given slug order. Home is always pinned first regardless of input;
 *  unknown / missing slugs are dropped, and any pages omitted from `order` keep their relative
 *  order after the listed ones. */
export function reorderPages(preferences: unknown, order: string[]): Record<string, unknown> {
  const pages = readProfilePages(preferences)
  const bySlug = new Map(pages.map((p) => [p.slug, p]))
  const wanted = order.map((s) => s.trim().toLowerCase()).filter((s) => s !== HOME_SLUG && bySlug.has(s))
  const seen = new Set(wanted)
  const rest = pages.filter((p) => p.slug !== HOME_SLUG && !seen.has(p.slug)).map((p) => p.slug)
  const home = pages.find((p) => p.slug === HOME_SLUG)!
  const next = baseRecord(preferences)
  next.pages = [home, ...[...wanted, ...rest].map((s) => bySlug.get(s)!)]
  return next
}
