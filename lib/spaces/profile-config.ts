import type { SpaceType } from '@/lib/spaces/types'

// ─────────────────────────────────────────────────────────────────────────────
// SPACE PROFILE DEFAULTS — the small per-type lookups the retired type-blueprint used to
// bake in (ADR superseding 472/476). When the template system is removed, these are the
// ONLY per-type nuances that survive: a default brand accent, a default primary-CTA label,
// and a default hero stat set. Everything else about a profile is operator-composed.
//
// All three are DEFAULTS ONLY: the operator's own choices win (the `brand_accent` column
// over the accent here; an operator-set primary CTA over the label here; the operator's
// SpaceStats block selection over the stat set here). PURE, self-contained (no blueprint /
// template imports), so deleting the template system leaves this intact.
//
// Tokens only, never a hex (AGENTS.md D6). The accents match the legacy per-role defaults so
// the five roles keep reading visibly distinct after the template system is gone.
// ─────────────────────────────────────────────────────────────────────────────

/** The host default accent (warm amber) — used for `root` and any unknown type. */
export const HOST_ACCENT = '--color-primary'

/** Per-type default brand accent (a validated DAWN token). The operator's `brand_accent`
 *  column overrides this; it is only the fallback. Matches the legacy blueprint defaults. */
const ACCENT_BY_TYPE: Record<SpaceType, string> = {
  root: HOST_ACCENT,
  business: '--color-broadcast',
  nonprofit: '--color-signal',
}

/** The default brand accent token for a Space type (host amber for unknown types). */
export function defaultAccentForType(type: string): string {
  return ACCENT_BY_TYPE[type as SpaceType] ?? HOST_ACCENT
}

/** Per-type default primary-CTA label. A plain verb phrase (sentence case, no em dashes,
 *  NAMING + CONTENT-VOICE). The operator can override the label per Space. */
const CTA_LABEL_BY_TYPE: Record<SpaceType, string> = {
  root: 'Get started',
  business: 'Become a member',
  nonprofit: 'Donate',
}

/** The default primary-CTA label for a Space type ("Get started" for unknown types). */
export function defaultPrimaryCtaLabel(type: string): string {
  return CTA_LABEL_BY_TYPE[type as SpaceType] ?? 'Get started'
}

/** The default hero stat set (metric keys understood by resolveProfileStats). A general,
 *  honest set: any metric that resolves to zero is dropped at render, so this is a
 *  starting order, not a promise. The operator's SpaceStats block selection overrides it. */
export const DEFAULT_HERO_STATS: readonly string[] = ['offerings', 'practices', 'circles', 'members'] as const

/** A mutable copy of the default hero stat set (metric keys). */
export function defaultHeroStats(): string[] {
  return [...DEFAULT_HERO_STATS]
}

// ─────────────────────────────────────────────────────────────────────────────
// PROVISIONABLE SPACE TYPES — the subset a member can stand up (ADR-339), re-homed here
// when the type-driven template/blueprint registry was removed. This is the SOURCE OF
// TRUTH for "which types the create wizard offers", the staff view-as selector, and the
// admin per-type defaults grid. Plain data (types + labels), no blueprint/template import.
// `root` is the platform host and is NEVER provisionable, so it is absent by construction.
// Labels match the legacy blueprint typeLabels so every surface reads the same noun.
// ─────────────────────────────────────────────────────────────────────────────

/** The provisionable Space types in canonical display order, each a `{ value, label }` choice. */
const PROVISIONABLE_TYPES: readonly { value: SpaceType; label: string }[] = [
  { value: 'business', label: 'Business' },
  { value: 'nonprofit', label: 'Non Profit' },
]

/** The provisionable Space types as `{ value, label }` choices, in canonical order. A fresh
 *  array each call (no shared-reference mutation). The create wizard, the staff view-as selector,
 *  and the admin per-type defaults grid all read this. */
export function provisionableTypes(): { value: SpaceType; label: string }[] {
  return PROVISIONABLE_TYPES.map((t) => ({ ...t }))
}

/** Is `type` a provisionable Space type (the subset a member can stand up)? Fails CLOSED for
 *  `root`, an unknown type, or null/undefined, so a forged or stale value never provisions. */
export function isProvisionableType(type: string | null | undefined): type is SpaceType {
  return !!type && PROVISIONABLE_TYPES.some((t) => t.value === type)
}

/** The default theme skin a new Space provisions with (a curated DAWN skin). The retired
 *  per-type blueprint set this uniformly to 'dawn'; it is a constant now, not per-type. */
export const DEFAULT_SPACE_SKIN = 'dawn'
