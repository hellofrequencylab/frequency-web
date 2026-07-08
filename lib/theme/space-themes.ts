// The SPACE PAGE THEME registry (ADR-578) — the single typed place a "space theme" is declared. A space
// theme is the TYPOGRAPHY + SHAPE + RHYTHM feel of a Space's public profile: a display + body font pairing
// plus a few feel tokens (radius), applied via a `[data-space-theme="<id>"]` attribute on the profile's
// AccentScope wrapper. It is ORTHOGONAL to colour — a theme sets NO `--color-*` tokens, so the DAWN palette
// and the Space's own brand accent (painted by AccentScope) carry through unchanged. This is deliberately a
// LIGHTER axis than the member Spotlight theme (lib/spotlight/theme.ts): no custom palettes, backgrounds, or
// surfaces, only the type + shape identity.
//
// This registry is the typed mirror of the CSS: every id here MUST have a matching
// `[data-space-theme="<id>"]` block in app/globals.css. The guardrail test in space-themes.test.ts reads
// globals.css from disk and enforces that pairing, so the CSS and the registry can never quietly drift.
//
// PERSISTENCE: the chosen id lives on `spaces.preferences.theme` (jsonb, no migration — same pattern as
// preferences.profileLayout / moduleMenu). `parseSpaceTheme` is the one fail-safe reader.

/** The set of authored space-theme ids. Add a theme = author its CSS block AND extend this union. */
export type SpaceThemeId = 'bold' | 'editorial' | 'classic' | 'playful' | 'accessible'

/** The full declaration of a space theme — its id, human copy, and the two font faces it pairs (named so
 *  the picker reads like a real font menu, not an abstract token). */
export interface SpaceThemeDef {
  /** Stable id, the `[data-space-theme]` value and the `preferences.theme` value. */
  id: SpaceThemeId
  /** Short, brand-appropriate label (docs/NAMING.md, docs/CONTENT-VOICE.md). */
  label: string
  /** One plain sentence on the feel (voice: plain, no em dashes). */
  description: string
  /** The display (heading) face, by name, for the picker. */
  displayFont: string
  /** The body (reading) face, by name, for the picker. */
  bodyFont: string
}

/** Every registered space theme. `bold` (today's look) is first; it is the no-op default everywhere. */
export const SPACE_THEMES: readonly SpaceThemeDef[] = [
  {
    id: 'bold',
    label: 'Bold',
    description: 'The house look: condensed caps headlines over clean, friendly body text.',
    displayFont: 'Anton',
    bodyFont: 'Nunito',
  },
  {
    id: 'editorial',
    label: 'Editorial',
    description: 'Quiet and considered: a light serif headline, square edges, and roomy rhythm.',
    displayFont: 'Fraunces',
    bodyFont: 'Nunito',
  },
  {
    id: 'classic',
    label: 'Classic',
    description: 'Established and bookish: a serif display over a serif body, with a longer reading line.',
    displayFont: 'Playfair Display',
    bodyFont: 'PT Serif',
  },
  {
    id: 'playful',
    label: 'Playful',
    description: 'Rounded and warm: a chunky rounded headline, big corners, and pill buttons.',
    displayFont: 'Fredoka',
    bodyFont: 'Nunito',
  },
  {
    id: 'accessible',
    label: 'Accessible',
    description: 'Readability first: a clear display over a character-disambiguating body face.',
    displayFont: 'Lexend',
    bodyFont: 'Atkinson Hyperlegible',
  },
]

/** The fallback theme id. An unknown or missing `preferences.theme` value resolves to this — and it is
 *  today's look, so every existing Space (which has no theme set) renders exactly as before. */
export const DEFAULT_SPACE_THEME: SpaceThemeId = 'bold'

/** Type guard: is this raw string a known space-theme id? */
export function isSpaceThemeId(id: string): id is SpaceThemeId {
  return SPACE_THEMES.some((t) => t.id === id)
}

/** Turn a raw id (or null/undefined) into a safe SpaceThemeId, else DEFAULT_SPACE_THEME. */
export function resolveSpaceTheme(id: string | null | undefined): SpaceThemeId {
  return id != null && isSpaceThemeId(id) ? id : DEFAULT_SPACE_THEME
}

/**
 * Fail-safe read of the Space's chosen theme off `spaces.preferences` (the untyped jsonb blob, ADR-246).
 * Reads `preferences.theme`, validates it against the registry, and falls back to DEFAULT_SPACE_THEME for
 * any missing / malformed / unknown value. Pure + total: a bad blob never throws and never breaks the page.
 */
export function parseSpaceTheme(preferences: unknown): SpaceThemeId {
  if (!preferences || typeof preferences !== 'object' || Array.isArray(preferences)) return DEFAULT_SPACE_THEME
  const raw = (preferences as Record<string, unknown>).theme
  return typeof raw === 'string' ? resolveSpaceTheme(raw) : DEFAULT_SPACE_THEME
}
