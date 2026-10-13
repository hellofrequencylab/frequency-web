// The SPACE PAGE THEME registry (ADR-578) — the single typed place a "space theme" is declared.
//
// 🔴 A SPACE THEME IS TYPOGRAPHY. It is a display + body font pairing plus the per-role treatment of
// weight, case, tracking and leading, applied via a `[data-space-theme="<id>"]` attribute on the
// profile's AccentScope wrapper. It sets NO `--color-*` tokens (the DAWN palette and the Space's own
// brand accent carry through unchanged) and, since 2026-09-01, NO SHAPE TOKENS EITHER.
//
// This sentence used to read "the TYPOGRAPHY + SHAPE + RHYTHM feel … plus a few feel tokens (radius)".
// The shape half is gone by owner directive: every Space now renders one radius (card 24px, control
// 14px, cover 24px), pinned on `[data-space-theme]` in globals.css. It went because 13 of 21 live
// Spaces sat on a theme that squared their chrome, which their operators had not knowingly chosen —
// they picked a theme for its fonts and got near-square buttons, tabs and cards with it.
//
// So when adding a theme: author its FONTS and its type treatment. Do not re-introduce a radius
// override — space-themes.test.ts fails if one comes back.
//
// This is deliberately a LIGHTER axis than the member Spotlight theme (lib/spotlight/theme.ts): no
// custom palettes, backgrounds, or surfaces.
//
// This registry is the typed mirror of the CSS: every id here MUST have a matching
// `[data-space-theme="<id>"]` block in app/globals.css. The guardrail test in space-themes.test.ts reads
// globals.css from disk and enforces that pairing, so the CSS and the registry can never quietly drift.
//
// PERSISTENCE: the chosen id lives on `spaces.preferences.theme` (jsonb, no migration — same pattern as
// preferences.profileLayout / moduleMenu). `parseSpaceTheme` is the one fail-safe reader.

/** The set of authored space-theme ids. Add a theme = author its CSS block AND extend this union. */
export type SpaceThemeId = 'frequency' | 'editorial' | 'classic' | 'playful' | 'accessible' | 'modern' | 'menswork'

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

/** Every registered font set. `frequency` (the house look) is first; it is the default everywhere.
 *
 *  OWNER RENAME 2026-10-11 (ADR-1726): the site THEMES are now Frequency and Bold (lib/theme/site-style.ts),
 *  and these ids are the FONT SETS a theme wears. The old Anton `bold` set folded into `frequency`
 *  (a stored `bold` still reads as `frequency`, resolveSpaceTheme), and `menswork` keeps its id (the CSS
 *  attribute and every stored value) under its new label, Bold. */
export const SPACE_THEMES: readonly SpaceThemeDef[] = [
  {
    id: 'frequency',
    label: 'Default', // ADR-1736: the id stays, the label follows the site theme it belongs to
    description: 'The house look: an elegant serif headline over clean, modern body text.',
    displayFont: 'Playfair Display',
    bodyFont: 'Space Grotesk',
  },
  {
    id: 'editorial',
    label: 'Editorial',
    description: 'Quiet and considered: a light serif headline over clean body text, with a roomy rhythm.',
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
    description: 'Rounded and warm: a chunky rounded headline over friendly body text.',
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
  {
    id: 'modern',
    label: 'Modern',
    description: 'Clean and current: a crisp geometric headline over friendly body text.',
    displayFont: 'Lexend',
    bodyFont: 'Nunito',
  },
  {
    // The one theme that also dresses the WEBSITE end to end (lib/theme/menswork.ts): on the Space page it
    // is fonts like every other theme; on the Space's website it brings its own palette and shapes too.
    id: 'menswork',
    label: 'Bold',
    description: 'Grounded and direct: tall condensed caps over plain body text.',
    displayFont: 'Sofia Sans Extra Condensed',
    bodyFont: 'Barlow',
  },
]

/** The fallback font set. An unknown or missing `preferences.theme` value resolves to this. */
export const DEFAULT_SPACE_THEME: SpaceThemeId = 'frequency'

/** Type guard: is this raw string a known space-theme id? */
export function isSpaceThemeId(id: string): id is SpaceThemeId {
  return SPACE_THEMES.some((t) => t.id === id)
}

/** Turn a raw id (or null/undefined) into a safe SpaceThemeId, else DEFAULT_SPACE_THEME. */
export function resolveSpaceTheme(id: string | null | undefined): SpaceThemeId {
  // `bold` was the Anton set, folded into Frequency (ADR-1726); a stored `bold` reads as the default.
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
