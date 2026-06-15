// Theme token VALIDATION — pure + SECURITY-CRITICAL. Admin-entered token values get
// rendered straight into a server `<style>` tag (lib/theme/css.ts), so everything that
// crosses this boundary is validated STRICTLY here first: an allowlist of token NAMES a
// theme may set, and tight per-type VALUE validators that reject anything that could break
// out of `name: value;` into the surrounding stylesheet (no `;{}<>`, no `url(`, no
// comments, no backslashes/newlines). `validateThemeTokens` never throws on bad data — it
// drops the unsafe entries and returns only the safe subset, so a malformed/hostile row can
// at worst contribute fewer tokens, never injected CSS.
//
// The allowlist is the exact set of semantic DAWN tokens a theme is allowed to retune,
// derived from app/globals.css (:root): the --color-* palette/state tokens, the feel axis
// (radius/motion/density), and the generation feel tokens (type-scale/ornament/tap-min).
// Anything not listed here is silently dropped.

import { z } from 'zod'

/**
 * The exact semantic token names a theme may set. Derived from the DAWN baseline in
 * app/globals.css (:root). NO other custom property may be written by a theme — names
 * outside this set are dropped by `validateThemeTokens`.
 */
export const TOKEN_ALLOWLIST: ReadonlySet<string> = new Set([
  // ── Surfaces ──
  '--color-canvas',
  '--color-marketing-canvas',
  '--color-surface',
  '--color-surface-elevated',
  // ── Borders ──
  '--color-border',
  '--color-border-strong',
  // ── Text ──
  '--color-text',
  '--color-text-muted',
  '--color-text-subtle',
  // ── Ink (dark bands) ──
  '--color-ink',
  '--color-ink-elevated',
  '--color-ink-border',
  '--color-on-ink',
  '--color-on-ink-muted',
  '--color-on-ink-subtle',
  // ── Brand: primary ──
  '--color-primary',
  '--color-primary-hover',
  '--color-primary-strong',
  '--color-primary-bg',
  '--color-text-on-primary',
  // ── Brand: signal ──
  '--color-signal',
  '--color-signal-strong',
  '--color-signal-bg',
  '--color-text-on-signal',
  // ── Brand: broadcast ──
  '--color-broadcast',
  '--color-broadcast-strong',
  '--color-broadcast-bg',
  '--color-text-on-broadcast',
  // ── Semantic states ──
  '--color-success',
  '--color-success-bg',
  '--color-warning',
  '--color-warning-bg',
  '--color-danger',
  '--color-danger-bg',
  '--color-info',
  '--color-info-bg',
  // ── Focus ──
  '--color-focus-ring',
  // ── Feel axis: radius ──
  '--radius-control',
  '--radius-card',
  '--radius-pill',
  // ── Feel axis: motion ──
  '--motion-fast',
  '--motion-base',
  '--motion-slow',
  // ── Feel axis: density ──
  '--density-root',
  // ── Generation feel tokens ──
  '--type-scale',
  '--ornament',
  '--tap-min',
])

// Characters/sequences that must NEVER appear in a value — they are the building blocks of
// a CSS injection (closing the declaration, opening a rule/comment, an HTML break-out, a
// remote fetch, an IE expression, an escape, or a newline). Checked before any positive
// match, so even a "valid-looking" value carrying one of these is rejected.
const FORBIDDEN = /[;{}<>\\\n\r]|url\(|expression|\/\*/i

// A small keyword allowlist for color values that aren't hex/functional.
const COLOR_KEYWORDS = new Set(['transparent', 'currentColor'])

// Functional color notations whose args are strictly numeric (with %, decimals, the modern
// `/ alpha` slash form, commas and spaces) — no nested functions, no var(), no url().
const NUMERIC_FUNC_COLOR = /^(?:rgb|rgba|hsl|hsla)\(\s*[0-9.,%/\s]+\)$/i

// Hex color: #rgb, #rrggbb, or #rrggbbaa (3, 6, or 8 hex digits).
const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i

// A length/scale: a number with an optional px/rem/em/% unit (e.g. `0.5rem`, `48px`,
// `112.5%`, `1`). Unitless numbers are allowed (e.g. --type-scale, --ornament).
const LENGTH_OR_SCALE = /^-?(?:\d+\.?\d*|\.\d+)(?:px|rem|em|%)?$/

// A time/duration: a non-negative number with a required ms/s unit (e.g. `260ms`, `0.7s`).
// Used for the --motion-* tokens, which a length validator would otherwise drop.
const DURATION = /^(?:\d+\.?\d*|\.\d+)(?:ms|s)$/

/** Is this raw string a safe COLOR value (hex / numeric-arg function / allowed keyword)? */
function isSafeColor(value: string): boolean {
  if (FORBIDDEN.test(value)) return false
  if (COLOR_KEYWORDS.has(value)) return true
  return HEX_COLOR.test(value) || NUMERIC_FUNC_COLOR.test(value)
}

/** Is this raw string a safe LENGTH/SCALE value (`<number>(px|rem|em|%)?`)? */
function isSafeLength(value: string): boolean {
  if (FORBIDDEN.test(value)) return false
  return LENGTH_OR_SCALE.test(value)
}

/** Is this raw string a safe DURATION value (`<number>(ms|s)`)? */
function isSafeDuration(value: string): boolean {
  if (FORBIDDEN.test(value)) return false
  return DURATION.test(value)
}

// The feel tokens split by value type: durations (--motion-*) take ms/s, the rest take a
// length/scale; everything else is a color. A token can only be written if its name is in the
// allowlist AND its value passes the matching check.
const DURATION_TOKENS: ReadonlySet<string> = new Set([
  '--motion-fast',
  '--motion-base',
  '--motion-slow',
])
const LENGTH_TOKENS: ReadonlySet<string> = new Set([
  '--radius-control',
  '--radius-card',
  '--radius-pill',
  '--density-root',
  '--type-scale',
  '--ornament',
  '--tap-min',
])

/** Is this allowlisted token's value safe for its type (duration / length / color)? */
function isSafeValue(name: string, value: string): boolean {
  if (DURATION_TOKENS.has(name)) return isSafeDuration(value)
  if (LENGTH_TOKENS.has(name)) return isSafeLength(value)
  return isSafeColor(value)
}

/** A `tokens` block: token-name → raw value. Unknown keys/values are dropped, never thrown on. */
const blockSchema = z.record(z.string(), z.string()).catch({})

// The full `themes.tokens` shape. Every field optional + coerced to {} on bad input, so a
// missing/garbage block degrades to empty rather than throwing.
const tokensSchema = z
  .object({
    light: blockSchema.optional(),
    dark: blockSchema.optional(),
    feel: blockSchema.optional(),
  })
  .catch({ light: {}, dark: {}, feel: {} })

/** Keep only allowlisted names whose values pass the matching validator. */
function sanitizeBlock(block: Record<string, string> | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  if (!block) return out
  for (const [name, value] of Object.entries(block)) {
    if (typeof value !== 'string') continue
    if (!TOKEN_ALLOWLIST.has(name)) continue
    if (!isSafeValue(name, value)) continue
    out[name] = value
  }
  return out
}

/**
 * Validate a raw `themes.tokens` value (unknown shape) into the safe subset that may be
 * rendered. Zod-parses the {light,dark,feel} shape, then drops any token name not in the
 * allowlist and any value failing its validator. NEVER throws on bad data — returns only the
 * safe tokens (worst case: three empty blocks).
 */
export function validateThemeTokens(input: unknown): {
  light: Record<string, string>
  dark: Record<string, string>
  feel: Record<string, string>
} {
  const parsed = tokensSchema.parse(input ?? {})
  return {
    light: sanitizeBlock(parsed.light),
    dark: sanitizeBlock(parsed.dark),
    feel: sanitizeBlock(parsed.feel),
  }
}

/**
 * Is this slug safe to interpolate into a `[data-skin="<slug>"]` selector? Lowercase
 * alphanumerics + hyphens, 1–40 chars. Used by lib/theme/css.ts before building the
 * selector so a hostile slug can never break out of the attribute string.
 */
export function isSafeSlug(slug: string): boolean {
  return /^[a-z0-9-]{1,40}$/.test(slug)
}
