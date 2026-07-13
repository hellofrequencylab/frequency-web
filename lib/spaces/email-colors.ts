// PER-SPACE EMAIL PALETTE (Email in the Business CRM, P1 · deliverable 1).
//
// A business Space's emails should read in the Space's OWN brand, not the platform amber. This module is the
// pure resolver that turns a Space (its picked brand accent + any operator-tuned overrides) into the concrete
// `EmailColors` hex set the email renderer / shell paint with. It is the single seam the Marketing editor,
// its live preview, the send compile, and the Email-style settings surface all read, so a Space's emails and
// the editor that authors them always agree on the palette.
//
// LAYERING (per-field, lowest wins to highest):
//   1. DEFAULT_EMAIL_COLORS   — the warm DAWN email palette (the platform default, always the base).
//   2. brand-derived          — the Space's `brand_accent` mapped onto the PRIMARY family (button / link /
//                               eyebrow ink), when the accent is a hex the owner picked.
//   3. operator override      — the Email-style settings surface (spaces.preferences.emailStyle), a sparse
//                               per-field hex map the owner tuned. The PER-EMAIL override still wins at RENDER
//                               time (a block's own `style` beats the doc palette), so this is only the SEED.
//
// PURE + framework-free (no React / Supabase / Next imports): trivially unit-testable and safe to import from a
// Server Component, a server action, and a client editor alike. Every returned value is a literal 6-digit hex,
// because a mail client cannot resolve CSS variables (mirrors lib/email-studio/render.ts DEFAULT_EMAIL_COLORS).

import { DEFAULT_EMAIL_COLORS, type EmailColors } from '@/lib/email-studio/render'

/** A 6-digit hex (`#rrggbb`). The only shape the brand color picker emits and the only shape this module
 *  derives from or stores, so the client, the server gate, and the renderer agree. */
const HEX = /^#[0-9a-fA-F]{6}$/

/** The keys of EmailColors an operator may override on the Email-style surface (every slot the renderer
 *  reads). A sparse subset of these persists to `preferences.emailStyle`; absent = "use the brand-derived /
 *  default value for this slot". */
export const EMAIL_COLOR_KEYS: readonly (keyof EmailColors)[] = [
  'canvas',
  'surface',
  'surfaceElevated',
  'border',
  'text',
  'muted',
  'subtle',
  'primary',
  'primaryStrong',
  'primaryBg',
  'onPrimary',
  'success',
  'info',
  'danger',
]

/** A sparse operator override of the email palette (spaces.preferences.emailStyle): each present key is a
 *  6-digit hex that wins over the brand-derived / default value for that slot. */
export type SpaceEmailStyle = Partial<Record<keyof EmailColors, string>>

// ── hex math (pure; the email renderer needs real hex, not CSS color-mix) ────────────────────────────────────

/** Parse a `#rrggbb` to its [r,g,b] channels (0..255), or null when it is not a strict 6-digit hex. */
function channels(hex: string): [number, number, number] | null {
  if (!HEX.test(hex)) return null
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]
}

/** Clamp to a 0..255 byte and format one channel as a 2-digit hex. */
function toHexByte(n: number): string {
  return Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')
}

/** Mix a hex toward a target color by `amount` (0..1 of the target). `amount` 0 returns the source, 1 the
 *  target. Used to darken (toward black) and tint (toward white). Pure. */
function mix(hex: string, target: [number, number, number], amount: number): string {
  const c = channels(hex)
  if (!c) return hex
  const [r, g, b] = c
  const [tr, tg, tb] = target
  return `#${toHexByte(r + (tr - r) * amount)}${toHexByte(g + (tg - g) * amount)}${toHexByte(b + (tb - b) * amount)}`
}

const BLACK: [number, number, number] = [0, 0, 0]
const WHITE: [number, number, number] = [255, 255, 255]

/** Readable ink to sit ON a hex accent: near-black on a light accent, white on a dark one, by sRGB relative
 *  luminance (the WCAG 0.2126/0.7152/0.0722 weighting; 0.179 is the black/white crossover). Mirrors the app
 *  accent's `readableTextOn` (lib/spaces/accent.ts) so a Space's email button ink matches its on-page button. */
function readableTextOn(hex: string): string {
  const c = channels(hex)
  if (!c) return DEFAULT_EMAIL_COLORS.onPrimary
  const lin = (v: number) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  const [r, g, b] = c
  const luminance = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
  return luminance > 0.179 ? '#141414' : '#ffffff'
}

/**
 * The PRIMARY family a Space's brand accent contributes to the email palette. Derived ONLY from a hex accent
 * (the owner's picked brand color); a token accent (a DAWN palette name like `--color-signal`) has no email
 * hex here, so it contributes nothing and the default amber primary stands. Pure + total.
 *
 * primary       = the accent itself.
 * primaryStrong = 28% toward black (the pressed / eyebrow-ink shade; mirrors accent.ts `-strong`).
 * primaryBg     = 88% toward white (a soft opaque tint that reads on the email surface, not a translucent CSS
 *                 mix — an email needs a real hex).
 * onPrimary     = the luminance-picked readable ink for a button filled with the accent.
 */
export function brandEmailColors(brandAccent: string | null | undefined): SpaceEmailStyle {
  if (!brandAccent || !HEX.test(brandAccent)) return {}
  return {
    primary: brandAccent,
    primaryStrong: mix(brandAccent, BLACK, 0.28),
    primaryBg: mix(brandAccent, WHITE, 0.88),
    onPrimary: readableTextOn(brandAccent),
  }
}

/** Read + validate the operator's persisted email-style override from a raw `spaces.preferences` blob. Tolerant
 *  of any shape: a tampered / stale value is dropped, never thrown. Only strict 6-digit hex values for known
 *  EmailColors keys survive. PURE. */
export function readSpaceEmailStyle(preferences: unknown): SpaceEmailStyle {
  if (!preferences || typeof preferences !== 'object' || Array.isArray(preferences)) return {}
  const node = (preferences as Record<string, unknown>).emailStyle
  if (!node || typeof node !== 'object' || Array.isArray(node)) return {}
  const raw = node as Record<string, unknown>
  const out: SpaceEmailStyle = {}
  for (const key of EMAIL_COLOR_KEYS) {
    const v = raw[key]
    if (typeof v === 'string' && HEX.test(v)) out[key] = v
  }
  return out
}

/** Sanitize a client-supplied email-style bag down to a safe, sparse override (never trust the wire). Returns
 *  an empty object when nothing survives (the caller clears the node). PURE + total. */
export function sanitizeSpaceEmailStyle(raw: unknown): SpaceEmailStyle {
  return readSpaceEmailStyle({ emailStyle: raw })
}

/** Compute the next `preferences` blob for an email-style change. Non-destructive: only the `emailStyle` node
 *  is written, every other key preserved. An empty override CLEARS the node (back to brand-derived / default).
 *  PURE. Mirrors nextHeroPreferences (lib/spaces/hero-config.ts). */
export function nextEmailStylePreferences(
  current: Record<string, unknown>,
  style: SpaceEmailStyle,
): Record<string, unknown> {
  if (Object.keys(style).length === 0) {
    const { emailStyle: _drop, ...rest } = current
    void _drop
    return rest
  }
  return { ...current, emailStyle: style }
}

/** The minimal Space shape this resolver reads (so callers can pass a full `Space` or a lightweight stub). */
export interface SpaceEmailColorInput {
  brandAccent?: string | null
  preferences?: unknown
}

/**
 * THE RESOLVER. The concrete `EmailColors` a Space's emails seed from: DEFAULT_EMAIL_COLORS, with the Space's
 * brand accent mapped onto the primary family, with the operator's Email-style override on top. Per-FIELD
 * fallback throughout (an absent brand-derived or override slot keeps the default). Every value is a literal
 * hex. PURE + total, so the editor, the live preview, and the send compile always paint the same palette.
 */
export function spaceEmailColors(space: SpaceEmailColorInput | null | undefined): EmailColors {
  const brand = brandEmailColors(space?.brandAccent)
  const override = readSpaceEmailStyle(space?.preferences)
  return { ...DEFAULT_EMAIL_COLORS, ...brand, ...override }
}

/** The brand-derived seed the Email-style surface resets a field back TO (default with the brand primary family
 *  folded in, but NO operator override). So "reset" returns a slot to its brand default, not the operator's
 *  last tuned value. PURE. */
export function spaceEmailColorDefaults(space: SpaceEmailColorInput | null | undefined): EmailColors {
  return { ...DEFAULT_EMAIL_COLORS, ...brandEmailColors(space?.brandAccent) }
}
