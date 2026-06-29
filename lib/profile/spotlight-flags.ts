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
