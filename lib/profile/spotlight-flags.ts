// Spotlight = a member's opt-in public mini-site (the linktree/"Spotlight page").
// The whole feature is OFF for everyone by default; it turns on per user. This is
// the SINGLE source of truth for where those flags live in profiles.meta and how
// to read/merge them — every reader and writer imports from here so a flag path is
// never spelled out as a loose string literal twice (a typo would silently fail).
//
// Two independent flags, BOTH default-false:
//   • meta.spotlight.enabled   — the page exists in draft / is being set up
//     (an admin flips this per user; the owner manages once it's on).
//   • meta.spotlight.published — the page is live at the public URL.
// Keeping them separate means "turned on to mess with" never implies "public".
//
// "Spotlight" is the locked member-facing name (docs/NAMING.md). It is NOT "Studio"
// (reserved for the creation tool + the future Calm/Studio mode axis) and NOT
// "Signal" (a retired rank name).

/** The shape we care about inside the opaque profiles.meta jsonb. */
type SpotlightMeta = {
  spotlight?: { enabled?: boolean; published?: boolean }
} & Record<string, unknown>

/** Is the member's Spotlight turned on (draft/setup)? Default false for null/undefined/{}. */
export function readSpotlightEnabled(meta: unknown): boolean {
  return (meta as SpotlightMeta | null | undefined)?.spotlight?.enabled === true
}

/** Is the member's Spotlight page live at its public URL? Default false. */
export function readSpotlightPublished(meta: unknown): boolean {
  return (meta as SpotlightMeta | null | undefined)?.spotlight?.published === true
}

/**
 * Merge a new `enabled` value into the (opaque) meta blob WITHOUT disturbing any
 * other key. The existing codebase updates profiles.meta by read-modify-write
 * (see app/(main)/checkin-actions.ts); this keeps that pattern but isolates the
 * spotlight sub-object so streak/checkin/persona keys are preserved verbatim.
 * Turning Spotlight off never auto-unpublishes here — callers decide.
 */
export function withSpotlightEnabled(meta: unknown, enabled: boolean): Record<string, unknown> {
  const base = (meta ?? {}) as SpotlightMeta
  return { ...base, spotlight: { ...(base.spotlight ?? {}), enabled } }
}

/** Merge a new `published` value into meta, preserving every other key. */
export function withSpotlightPublished(meta: unknown, published: boolean): Record<string, unknown> {
  const base = (meta ?? {}) as SpotlightMeta
  return { ...base, spotlight: { ...(base.spotlight ?? {}), published } }
}

/** Read the raw (UNVALIDATED) editor layout/background out of meta. Callers MUST run
 *  the validator (lib/spotlight/blocks/validate.ts) before rendering — this is just the
 *  accessor. */
export function readSpotlightLayoutRaw(meta: unknown): unknown {
  return (meta as { spotlight?: { layout?: unknown } } | null | undefined)?.spotlight?.layout
}
export function readSpotlightBackgroundRaw(meta: unknown): unknown {
  return (meta as { spotlight?: { background?: unknown } } | null | undefined)?.spotlight?.background
}
export function readSpotlightThemeRaw(meta: unknown): unknown {
  return (meta as { spotlight?: { theme?: unknown } } | null | undefined)?.spotlight?.theme
}

/** Merge a new layout into meta, preserving enabled/published/background. */
export function withSpotlightLayout(meta: unknown, layout: unknown): Record<string, unknown> {
  const base = (meta ?? {}) as SpotlightMeta
  return { ...base, spotlight: { ...(base.spotlight ?? {}), layout } }
}
/** Merge a new background into meta, preserving everything else. */
export function withSpotlightBackground(meta: unknown, background: unknown): Record<string, unknown> {
  const base = (meta ?? {}) as SpotlightMeta
  return { ...base, spotlight: { ...(base.spotlight ?? {}), background } }
}
/** Merge a new custom theme (colours/gradient/fonts/card) into meta, preserving everything else. */
export function withSpotlightTheme(meta: unknown, theme: unknown): Record<string, unknown> {
  const base = (meta ?? {}) as SpotlightMeta
  return { ...base, spotlight: { ...(base.spotlight ?? {}), theme } }
}

// ── Saved theme slots (a member keeps up to THREE of their own looks) ─────────────────
// An additive JSONB node at meta.spotlight.themes: an array (max 3) of named looks the member
// can switch between. Each slot bundles a full theme (colours/gradient/fonts/card) AND the page
// background, so "apply" restores the whole look. Like every other Spotlight node this is the
// read-side security boundary: a tampered blob can reach the public renderer once applied, so
// every slot is VALIDATED on read AND write (theme via validateSpotlightTheme, background via
// validateSpotlightBackground pinned to the owner). Never trust the stored array shape.

import { validateSpotlightTheme, type SpotlightTheme } from '@/lib/spotlight/theme'
import { validateSpotlightBackground } from '@/lib/spotlight/blocks/validate'
import type { SpotlightBackground } from '@/lib/spotlight/blocks/schema'

/** The most saved theme slots a member may keep. */
export const MAX_SPOTLIGHT_THEMES = 3
/** A slot name is trimmed and clamped to this length on write (no HTML — plain text label). */
export const SPOTLIGHT_THEME_NAME_MAX = 40

/** A single saved look: a stable id, a display name, and the full theme + background it restores. */
export interface SpotlightThemeSlot {
  id: string
  name: string
  theme: SpotlightTheme
  background: SpotlightBackground
}

/** Trim + clamp a slot name to a safe plain-text label. Empty → a friendly default. */
export function clampSpotlightThemeName(raw: unknown): string {
  const s = typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ') : ''
  const clamped = s.slice(0, SPOTLIGHT_THEME_NAME_MAX).trim()
  return clamped || 'My theme'
}

/**
 * Read the member's saved theme slots, VALIDATED. Each slot's theme + background are run through
 * their validators (the same boundary the public renderer enforces), the id is kept only when it
 * is a non-empty string, the name is clamped, and the array is capped at MAX_SPOTLIGHT_THEMES.
 * Anything malformed is dropped — never trusted. `ownerAuthUserId` pins each background's asset
 * path to the owner's own folder (matching validateSpotlightBackground everywhere else).
 */
export function readSpotlightThemes(meta: unknown, ownerAuthUserId: string): SpotlightThemeSlot[] {
  const raw = (meta as { spotlight?: { themes?: unknown } } | null | undefined)?.spotlight?.themes
  if (!Array.isArray(raw)) return []
  const out: SpotlightThemeSlot[] = []
  for (const entry of raw) {
    if (out.length >= MAX_SPOTLIGHT_THEMES) break
    if (!entry || typeof entry !== 'object') continue
    const e = entry as Record<string, unknown>
    const id = typeof e.id === 'string' && e.id.trim() ? e.id.trim() : null
    if (!id) continue
    out.push({
      id,
      name: clampSpotlightThemeName(e.name),
      theme: validateSpotlightTheme(e.theme),
      background: validateSpotlightBackground(e.background, ownerAuthUserId),
    })
  }
  return out
}

/**
 * Merge a new set of theme slots into meta, preserving every other key. The list is VALIDATED +
 * capped here too (write-side boundary): each slot's theme/background is re-validated, the name
 * clamped, and only the first MAX_SPOTLIGHT_THEMES kept — so a caller can never persist more than
 * the max or an unsafe blob. `ownerAuthUserId` pins each background to the owner's folder.
 */
export function withSpotlightThemes(
  meta: unknown,
  next: unknown,
  ownerAuthUserId: string,
): Record<string, unknown> {
  const base = (meta ?? {}) as SpotlightMeta
  const list = Array.isArray(next) ? next : []
  const safe: SpotlightThemeSlot[] = []
  for (const entry of list) {
    if (safe.length >= MAX_SPOTLIGHT_THEMES) break
    if (!entry || typeof entry !== 'object') continue
    const e = entry as Record<string, unknown>
    const id = typeof e.id === 'string' && e.id.trim() ? e.id.trim() : null
    if (!id) continue
    safe.push({
      id,
      name: clampSpotlightThemeName(e.name),
      theme: validateSpotlightTheme(e.theme),
      background: validateSpotlightBackground(e.background, ownerAuthUserId),
    })
  }
  return { ...base, spotlight: { ...(base.spotlight ?? {}), themes: safe } }
}

// ── Draft working copy (draft vs publish split) ───────────────────────────────────────
// An additive JSONB node at meta.spotlight.draft: the member's WORKING copy of their page
// (layout + theme + background) that the editor loads + autosaves. The PUBLISHED live nodes
// (meta.spotlight.layout / theme / background + published) stay exactly what the public page
// renders — a deliberate Publish promotes the draft to those live nodes. The public read path
// NEVER reads this node, so an in-progress draft can never leak. Unvalidated accessor (like
// readSpotlightLayoutRaw): callers validate each part before use.

/** The raw (UNVALIDATED) draft node, or undefined when no draft has been saved yet. */
export function readSpotlightDraftRaw(meta: unknown): { layout?: unknown; theme?: unknown; background?: unknown } | undefined {
  const draft = (meta as { spotlight?: { draft?: unknown } } | null | undefined)?.spotlight?.draft
  return draft && typeof draft === 'object' ? (draft as { layout?: unknown; theme?: unknown; background?: unknown }) : undefined
}

/** Merge a working-copy draft (layout + theme + background) into meta, preserving every other key
 *  INCLUDING the live published nodes — this only ever touches meta.spotlight.draft. */
export function withSpotlightDraft(
  meta: unknown,
  draft: { layout: unknown; theme: unknown; background: unknown },
): Record<string, unknown> {
  const base = (meta ?? {}) as SpotlightMeta
  return { ...base, spotlight: { ...(base.spotlight ?? {}), draft } }
}

/** Clear the draft node (e.g. after promoting it to the live nodes on Publish), preserving
 *  every other key. Sets it to undefined so the editor falls back to the published state. */
export function clearSpotlightDraft(meta: unknown): Record<string, unknown> {
  const base = (meta ?? {}) as SpotlightMeta
  const spot = { ...(base.spotlight ?? {}) } as Record<string, unknown>
  delete spot.draft
  return { ...base, spotlight: spot }
}
