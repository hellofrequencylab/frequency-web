import {
  primitiveValues,
  safeUrl,
  type FieldDef,
} from '@/lib/entity-blocks/block-content'
import {
  readHeaderCtaPreference,
  resolveHeaderCta,
  type HeaderCtaPreference,
  type ResolvedHeaderCta,
} from '@/lib/spaces/header-cta'

// THE EDITABLE TOP-PAGE HERO (the profile COVER hero at the top of a Space page). PR: editable-top-hero.
// The cover hero — the full-bleed band with the eyebrow / name / tagline / avatar / actions at the top of
// `/spaces/<slug>` — is now an EDITABLE SECTION, pinned as the FIXED first section of the rail arranger
// (always at the top, editable, but not deletable or reorderable like a normal block). This module is the
// hero's own FIELD SCHEMA + persistence, declared with the shared primitive field types (ADR-569 C6) so the
// hero reuses the SAME data-driven control surface every block uses — no bespoke panel JSX.
//
// PURE + data-only (no React / Supabase / Next imports), so the schema, the normalizer, and the resolver are
// trivially unit-testable and safe to import from the public layout (a Server Component), the rail arranger,
// the write action, and a no-auth showcase alike. FRAMING only, never a gate.
//
// PERSISTENCE (no migration): the hero settings live in a NEW `spaces.preferences.hero` jsonb bag (a sibling
// of profileLayout / headerCta / coverScrim), sparse by design. The hero's CTA continues to reuse the EXISTING
// `preferences.headerCta` node + the header-cta model (ADR-563) — item 5 relocates the EDITING of that button
// into the hero section, it does NOT fork the storage. The hero's HEADING + CONTENT fall back to the Space's
// canonical `brand_name` / `tagline` columns when the operator has not overridden them here, so a Space that
// never opens the hero editor renders exactly as before.
//
// COPY NOTE (NAMING + CONTENT-VOICE §10): every field label + placeholder is a plain phrase, sentence case,
// no em dashes, no hype.

// ── The hero HEIGHT (3-way, reusing the `height` primitive) ───────────────────────────────────────────────
// Short / Medium / Tall map to the three cover-band heights the render frame paints. `medium` is the default
// (the current shipped Hero height), so a Space that never touches the control renders unchanged.

export type HeroHeight = 'short' | 'medium' | 'tall'

/** The Tailwind height utility (responsive) for each hero height. Token-driven spacing scale, no hardcoded
 *  pixels beyond the rem steps the existing cover used. `medium` matches the shipped `h-72 sm:h-[22rem]`.
 *  The three tiers are deliberately WELL SPACED (desktop 224 / 352 / 576px) so Short, Medium, and Tall read
 *  as obviously different bands on the live page AND in the rail's shape-accurate preview — a close ladder
 *  (the old 288/352/512) made Short and Medium look identical. */
const HERO_HEIGHT_CLASS: Record<HeroHeight, string> = {
  short: 'h-48 sm:h-56',
  medium: 'h-72 sm:h-[22rem]',
  tall: 'h-[24rem] sm:h-[36rem]',
}

/** The responsive height utility for a resolved hero height. Pure + total. */
export function heroHeightClass(height: HeroHeight): string {
  return HERO_HEIGHT_CLASS[height]
}

// ── The hero ASPECT RATIO (width / height) at each height ──────────────────────────────────────────────────
// The rail's crop preview must be the same SHAPE (width / height) as the LIVE header at the chosen height, so
// "this preview matches your header height" is literally true whatever the rail width. Previewing at a FIXED
// pixel height read far too TALL in the narrow rail (an `h-72` box is short beside a wide hero but nearly
// square beside a ~320px rail), so we drive the preview by the ratio instead.
//
// THE REAL HEADER WIDTH (the bug this had ~5 times): the live header does NOT paint at 1344px. The `sizes`
// hint on the cover <Image> ("… , 1344px") is only a resolution hint for the browser's image picker — it is
// NOT the layout width. The header (DetailTemplate `hero`, a `w-full` band) renders INSIDE the profile's
// CENTER COLUMN, wedged between the global left nav and the community right rail. At the shell's widest
// (app-shell.tsx: `max-w-[105rem]` = 1680px container, `px-8` = 32px gutters, `gap-10` = 40px, left rail
// `w-48` = 192px, right rail `w-72` = 288px + `lg:ml-3` = 12px), the center column — and thus the header —
// tops out at 1680 - 64 - 192 - 288 - 12 - (2 * 40) = 1044px. Earlier "fixes" measured against 1344, so every
// preview was ~29% too WIDE (too short), which is exactly why the owner kept seeing a mismatch. We compute the
// ratio against the REAL 1044px maximum instead.
//
// Desktop band heights (heroHeightClass at `sm` and up, unchanged): short sm:h-56 = 14rem = 224px, medium
// sm:h-[22rem] = 352px, tall sm:h-[36rem] = 576px. The three ratios stay well separated so Short / Medium /
// Tall visibly step in the preview when you switch tiers.
const HERO_HEADER_MAX_WIDTH = 1044 // px — real center-column max (see derivation above), NOT the 1344 sizes hint
const HERO_ASPECT: Record<HeroHeight, number> = {
  short: HERO_HEADER_MAX_WIDTH / 224, // ≈ 4.66
  medium: HERO_HEADER_MAX_WIDTH / 352, // ≈ 2.97
  tall: HERO_HEADER_MAX_WIDTH / 576, // ≈ 1.81
}

/** The width:height aspect ratio of the Hero cover at a resolved height, for a shape-accurate crop preview
 *  (the rail's header-image focus picker). Pure + total. */
export function heroAspect(height: HeroHeight): number {
  return HERO_ASPECT[height]
}

// ── The hero BUTTON ORIENTATION (reusing the `buttonOrientation` primitive) ───────────────────────────────
// `row` (default) lays the hero action buttons side by side (the shipped desktop row); `stacked` lays them
// in a column. The render frame maps this onto the flex direction of the action cluster.

export type HeroButtonOrientation = 'row' | 'stacked'

/** The flat working bag the rail seeds the hero from (height + orientation are the only fields the editor
 *  still exposes, item 5; the copy/CTA fields remain for back-compat render + the bundle seed). */
export interface HeroEditorValues {
  height?: string
  buttonOrientation?: string
  eyebrow?: string
  heading?: string
  tagline?: string
  ctaLabel?: string
  ctaUrl?: string
}

// ── The hero-config field schema (drives the editor + the sanitizer) ──────────────────────────────────────
// One declaration the rail arranger's field kit renders and the sanitizer validates, exactly like a block's
// `fieldsForBlock`. The CTA sub-fields are declared here too so the whole hero (look + copy + button) edits in
// ONE panel; the CTA is stored under `headerCta` (see toHeaderCtaPreference), the rest under `hero`.

/** One field the hero editor renders. Uses ONLY the shared FieldType union (text / textarea / url / height /
 *  buttonOrientation), so the arranger's existing FieldEditor dispatches on `type` with no new control JSX. */
export const HERO_FIELDS: readonly FieldDef[] = [
  // Look controls (the ADR-569 C6 primitives).
  { key: 'height', label: 'Height', type: 'height', defaultValue: 'medium' },
  { key: 'buttonOrientation', label: 'Buttons', type: 'buttonOrientation', defaultValue: 'row' },
  // Copy overrides (fall back to the Space's canonical fields when blank).
  { key: 'eyebrow', label: 'Eyebrow', type: 'text', placeholder: 'Small label above your name' },
  { key: 'heading', label: 'Name', type: 'text', placeholder: 'Your name (leave blank to use your brand name)' },
  { key: 'tagline', label: 'Tagline', type: 'textarea', placeholder: 'One plain line that says what you do' },
  // The hero CTA (the one dominant button). Label + link, using the button field pattern (#1595): the button
  // always shows once labelled. An empty label falls back to the per-type default CTA (resolveHeroCta).
  { key: 'ctaLabel', label: 'Button label', type: 'text', placeholder: 'Book now' },
  { key: 'ctaUrl', label: 'Button link', type: 'url', placeholder: 'https:// or /' },
] as const

const MAX_HERO_TEXT = 200
const MAX_HERO_TAGLINE = 400

/** Read + bound a hero text field, or undefined when blank. Pure + total. */
function heroStr(raw: unknown, max: number): string | undefined {
  if (typeof raw !== 'string') return undefined
  const v = raw.trim().slice(0, max)
  return v.length ? v : undefined
}

/** Validate one enum-primitive hero value against its declared allowlist, dropping it when it matches the
 *  declared default (sparse blob). Mirrors sanitizeBlockContent's primitive branch. */
function heroEnum(field: FieldDef, raw: unknown): string | undefined {
  const allowed = primitiveValues(field)
  const def = field.defaultValue ?? allowed?.[0]
  if (typeof raw === 'string' && allowed?.includes(raw) && raw !== def) return raw
  return undefined
}

/** The operator's persisted hero overrides (spaces.preferences.hero). Sparse: an absent field means "use the
 *  default" (medium height, row buttons, the Space's brand name / tagline). The CTA is NOT stored here — it
 *  reuses preferences.headerCta (item 5), so the hero and the header CTA can never drift. */
export interface HeroConfig {
  height?: HeroHeight
  buttonOrientation?: HeroButtonOrientation
  eyebrow?: string
  /** A NAME override; blank falls back to the Space's `brand_name`. */
  heading?: string
  /** A TAGLINE override; blank falls back to the Space's `tagline` column. */
  tagline?: string
}

/** Normalize a raw `spaces.preferences` blob into a typed HeroConfig (sparse; every field validated). Tolerant
 *  of any shape — a tampered / stale value is dropped, never thrown. PURE. */
export function readHeroConfig(raw: unknown): HeroConfig {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const node = (raw as Record<string, unknown>).hero
  if (!node || typeof node !== 'object' || Array.isArray(node)) return {}
  const n = node as Record<string, unknown>
  const out: HeroConfig = {}
  const height = heroEnum(HERO_FIELDS[0], n.height)
  if (height) out.height = height as HeroHeight
  const orientation = heroEnum(HERO_FIELDS[1], n.buttonOrientation)
  if (orientation) out.buttonOrientation = orientation as HeroButtonOrientation
  const eyebrow = heroStr(n.eyebrow, MAX_HERO_TEXT)
  if (eyebrow) out.eyebrow = eyebrow
  const heading = heroStr(n.heading, MAX_HERO_TEXT)
  if (heading) out.heading = heading
  const tagline = heroStr(n.tagline, MAX_HERO_TAGLINE)
  if (tagline) out.tagline = tagline
  return out
}

/** Sanitize a client-supplied hero bag down to a safe, sparse HeroConfig node (never trust the wire). Returns
 *  null when nothing survives (the caller clears the node). PURE + total. Mirrors sanitizeBlockContent. */
export function sanitizeHeroConfig(raw: unknown): HeroConfig | null {
  const wrapped = readHeroConfig({ hero: raw })
  return Object.keys(wrapped).length ? wrapped : null
}

/** Compute the next preferences blob for a hero-config change. Non-destructive: only the `hero` node is
 *  written, every other key preserved. Passing an empty config CLEARS the node (back to the defaults). PURE.
 *  Mirrors nextHeaderCtaPreferences. */
export function nextHeroPreferences(
  current: Record<string, unknown>,
  config: HeroConfig | null,
): Record<string, unknown> {
  if (!config || Object.keys(config).length === 0) {
    const { hero: _drop, ...rest } = current
    void _drop
    return rest
  }
  return { ...current, hero: config }
}

// ── The hero CTA bridge (reuses the header-cta model, item 5) ─────────────────────────────────────────────
// The hero editor exposes the CTA as a plain label + link (the button field pattern, #1595). We map that onto
// the EXISTING HeaderCtaPreference so the storage + resolver stay the single source (ADR-563): a label + a
// custom URL becomes a `custom` override; a label alone tweaks the default label via a `function` override
// pointing at `book` (the reserved transactional surface); blank clears the override (back to the per-type
// default). This is the whole of item 5's "relocate the editing" — the model is untouched.

/** Build the HeaderCtaPreference a hero CTA {label, url} represents, or null to clear it (default CTA). A
 *  url + label → a custom link; a label with no url → the default surface with a custom label; blank → null.
 *  PURE. The write action still re-validates through the header-cta model, so this is client convenience. */
export function heroCtaToPreference(label: string, url: string): HeaderCtaPreference | null {
  const l = label.trim()
  const u = url.trim()
  if (u) {
    // A custom link needs a label; fall back to a neutral one so the button still shows (button model #1595).
    return { kind: 'custom', url: u, label: l || 'Learn more' }
  }
  if (l) return { kind: 'function', function: 'book', label: l }
  return null
}

/** Split a stored HeaderCtaPreference back into the hero editor's {label, url} fields, so the panel opens
 *  showing the current button. A function override contributes only its label (its surface is implicit).
 *  PURE. */
export function heroCtaFromPreference(pref: HeaderCtaPreference | null): { label: string; url: string } {
  if (pref?.kind === 'custom') return { label: pref.label, url: pref.url }
  if (pref?.kind === 'function') return { label: pref.label ?? '', url: '' }
  return { label: '', url: '' }
}

// ── The fully-resolved hero the render layer paints ───────────────────────────────────────────────────────

/** The resolved hero inputs the cover render reads: the effective height + button orientation, the effective
 *  eyebrow / heading / tagline (operator override → Space default), and the resolved CTA (label + href +
 *  external), all in ONE pure result so the layout render, a preview, and a test agree. */
export interface ResolvedHero {
  height: HeroHeight
  buttonOrientation: HeroButtonOrientation
  eyebrow: string | null
  heading: string
  tagline: string | null
  cta: ResolvedHeroCta
}

/** The resolved hero CTA. Wraps the header-cta resolver so both the eyebrow-less "no CTA" case and the button
 *  are one shape. `show` is false only when there is genuinely no button (never today: the default always
 *  resolves), kept so the render can branch cleanly if a future "no button" mode is added. */
export interface ResolvedHeroCta extends ResolvedHeaderCta {
  show: boolean
}

/**
 * Resolve the EFFECTIVE hero for a Space. `config` is the operator's HeroConfig (from readHeroConfig); the
 * remaining inputs are the Space's canonical values. The CTA reuses the existing header-cta resolver over the
 * SAME preferences blob (so a Space that set its header CTA before this feature keeps that button). PURE, total.
 */
export function resolveHero(input: {
  config: HeroConfig
  preferences: unknown
  base: string
  brandName: string
  tagline: string | null
  defaultCtaLabel: string
}): ResolvedHero {
  const { config, preferences, base, brandName, tagline, defaultCtaLabel } = input
  const cta = resolveHeaderCta(readHeaderCtaPreference(preferences), base, defaultCtaLabel)
  return {
    height: config.height ?? 'medium',
    buttonOrientation: config.buttonOrientation ?? 'row',
    eyebrow: config.eyebrow ?? null,
    heading: config.heading ?? brandName,
    tagline: config.tagline ?? tagline,
    cta: { ...cta, show: !!cta.label },
  }
}

/** A safe href for a hero CTA custom URL (defense in depth beside the header-cta validator). Re-exported so a
 *  consumer never reaches for a bespoke check. */
export { safeUrl }
