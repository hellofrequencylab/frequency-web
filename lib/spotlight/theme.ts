// Spotlight CUSTOM THEME — a member tunes their page's colours, background gradient,
// fonts, and card style. Like the block layout, this is the read-side security boundary:
// a tampered `meta.spotlight.theme` blob can reach the public renderer, so every value is
// VALIDATED here and the page only ever applies STRUCTURED, validated output — never a raw
// CSS string. Colours are strict 6-digit hex; the gradient is built from validated stops
// (the member never supplies the gradient string); fonts + card options are closed
// allowlists. Pure, no IO, FAIL-OPEN (never throws): anything outside the safe subset is
// dropped or defaulted. Mirrors lib/spotlight/blocks/validate.ts and reuses the spirit of
// lib/theme/validate.ts (allowlist names + tight value checks).

import type { CSSProperties } from 'react'

// ── Curated fonts. Real web fonts are self-hosted via next/font in app/layout.tsx and
// exposed as CSS variables on <html> (so they cascade to the public Spotlight route); each
// stack references its variable with a system fallback. No member @font-face — the set is
// a closed allowlist. ──
export type SpotlightFontId = 'sans' | 'serif' | 'rounded' | 'mono' | 'display' | 'script' | 'grotesk'
export const SPOTLIGHT_FONTS: { id: SpotlightFontId; label: string; stack: string }[] = [
  { id: 'sans', label: 'Clean sans', stack: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' },
  { id: 'serif', label: 'Elegant serif', stack: 'var(--font-playfair), Georgia, Cambria, "Times New Roman", serif' },
  { id: 'rounded', label: 'Friendly rounded', stack: 'var(--font-nunito), ui-rounded, "SF Pro Rounded", system-ui, sans-serif' },
  { id: 'mono', label: 'Mono', stack: 'var(--font-geist-mono), ui-monospace, "SF Mono", monospace' },
  { id: 'display', label: 'Bold display', stack: 'var(--font-anton), "Arial Black", Impact, system-ui, sans-serif' },
  { id: 'script', label: 'Handwritten', stack: 'var(--font-caveat), "Bradley Hand", "Comic Sans MS", cursive' },
  { id: 'grotesk', label: 'Modern grotesk', stack: 'var(--font-grotesk), "Helvetica Neue", system-ui, sans-serif' },
]
const FONT_BY_ID = new Map(SPOTLIGHT_FONTS.map((f) => [f.id, f.stack]))

export type CardRadius = 'sm' | 'md' | 'lg' | 'xl'
export type CardShadow = 'none' | 'soft' | 'strong'
export type CardStyle = 'solid' | 'glass'
const RADIUS_PX: Record<CardRadius, string> = { sm: '6px', md: '12px', lg: '18px', xl: '28px' }
const SHADOW_CSS: Record<CardShadow, string> = {
  none: 'none',
  soft: '0 1px 3px rgba(0,0,0,0.08)',
  strong: '0 10px 30px rgba(0,0,0,0.18)',
}

export interface GradientStop { color: string; pos: number }
export interface SpotlightGradient {
  type: 'linear' | 'radial'
  angle: number // 0–360 (linear only)
  stops: GradientStop[] // 2–4
  /** Slowly pan the gradient (CSS keyframe `spotlight-bg-pan` in globals.css). */
  animated: boolean
  /** Animation duration in seconds, 4–40. */
  speed: number
}
export type SpotlightBg =
  | { kind: 'none' }
  | { kind: 'solid'; color: string }
  | { kind: 'gradient'; gradient: SpotlightGradient }

export interface SpotlightCard {
  radius: CardRadius
  shadow: CardShadow
  style: CardStyle
}
export interface SpotlightTheme {
  /** Accent → --color-primary and friends. Null keeps the skin's accent. */
  accent: string | null
  /** Card/surface colour → --color-surface. Null keeps the skin's surface. */
  surface: string | null
  /** Text colour. Null = auto-derive a readable colour from the background. */
  text: string | null
  bg: SpotlightBg
  font: { heading: SpotlightFontId; body: SpotlightFontId }
  card: SpotlightCard
}

export const EMPTY_THEME: SpotlightTheme = {
  accent: null,
  surface: null,
  text: null,
  bg: { kind: 'none' },
  font: { heading: 'sans', body: 'sans' },
  card: { radius: 'lg', shadow: 'soft', style: 'solid' },
}

// One-tap starting points. Each is a partial theme merged over EMPTY_THEME by the editor.
export const THEME_PRESETS: { id: string; label: string; theme: SpotlightTheme }[] = [
  {
    id: 'sunset', label: 'Sunset',
    theme: { accent: '#ff6b6b', surface: '#2b1d33', text: '#fdeff2', font: { heading: 'display', body: 'sans' }, card: { radius: 'xl', shadow: 'strong', style: 'glass' },
      bg: { kind: 'gradient', gradient: { type: 'linear', angle: 160, animated: true, speed: 14, stops: [{ color: '#ff9a3c', pos: 0 }, { color: '#ff6b6b', pos: 50 }, { color: '#7b2ff7', pos: 100 }] } } },
  },
  {
    id: 'vaporwave', label: 'Vaporwave',
    theme: { accent: '#ff71ce', surface: '#1a1033', text: '#eafffd', font: { heading: 'mono', body: 'mono' }, card: { radius: 'md', shadow: 'strong', style: 'glass' },
      bg: { kind: 'gradient', gradient: { type: 'linear', angle: 135, animated: true, speed: 10, stops: [{ color: '#05ffa1', pos: 0 }, { color: '#b967ff', pos: 50 }, { color: '#01cdfe', pos: 100 }] } } },
  },
  {
    id: 'forest', label: 'Forest',
    theme: { accent: '#3fa34d', surface: '#10231a', text: '#eefaf0', font: { heading: 'serif', body: 'serif' }, card: { radius: 'lg', shadow: 'soft', style: 'solid' },
      bg: { kind: 'gradient', gradient: { type: 'linear', angle: 180, animated: false, speed: 12, stops: [{ color: '#0b3d2e', pos: 0 }, { color: '#1b5e3f', pos: 100 }] } } },
  },
  {
    id: 'mono', label: 'Mono',
    theme: { accent: '#111111', surface: '#ffffff', text: '#111111', font: { heading: 'sans', body: 'sans' }, card: { radius: 'sm', shadow: 'none', style: 'solid' },
      bg: { kind: 'solid', color: '#f4f4f5' } },
  },
]

// ── Validation ──
const HEX6 = /^#[0-9a-fA-F]{6}$/
function safeHex(v: unknown): string | null {
  return typeof v === 'string' && HEX6.test(v) ? v.toLowerCase() : null
}
function clampNum(v: unknown, lo: number, hi: number, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : fallback
}
function oneOf<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback
}

function validateGradient(raw: unknown): SpotlightGradient | null {
  if (!raw || typeof raw !== 'object') return null
  const g = raw as Record<string, unknown>
  const rawStops = Array.isArray(g.stops) ? g.stops.slice(0, 4) : []
  const stops: GradientStop[] = []
  for (const s of rawStops) {
    if (!s || typeof s !== 'object') continue
    const color = safeHex((s as Record<string, unknown>).color)
    if (!color) continue
    stops.push({ color, pos: clampNum((s as Record<string, unknown>).pos, 0, 100, 0) })
  }
  if (stops.length < 2) return null // a gradient needs at least two valid stops
  return {
    type: oneOf(g.type, ['linear', 'radial'] as const, 'linear'),
    angle: clampNum(g.angle, 0, 360, 160),
    stops,
    animated: g.animated === true,
    speed: clampNum(g.speed, 4, 40, 12),
  }
}

function validateBg(raw: unknown): SpotlightBg {
  if (!raw || typeof raw !== 'object') return { kind: 'none' }
  const b = raw as Record<string, unknown>
  if (b.kind === 'solid') {
    const color = safeHex(b.color)
    return color ? { kind: 'solid', color } : { kind: 'none' }
  }
  if (b.kind === 'gradient') {
    const gradient = validateGradient(b.gradient)
    return gradient ? { kind: 'gradient', gradient } : { kind: 'none' }
  }
  return { kind: 'none' }
}

/** Validate a raw theme blob into the safe subset. Never throws. */
export function validateSpotlightTheme(raw: unknown): SpotlightTheme {
  if (!raw || typeof raw !== 'object') return EMPTY_THEME
  const t = raw as Record<string, unknown>
  const font = (t.font ?? {}) as Record<string, unknown>
  const card = (t.card ?? {}) as Record<string, unknown>
  return {
    accent: safeHex(t.accent),
    surface: safeHex(t.surface),
    text: safeHex(t.text),
    bg: validateBg(t.bg),
    font: {
      heading: oneOf(font.heading, SPOTLIGHT_FONTS.map((f) => f.id), 'sans'),
      body: oneOf(font.body, SPOTLIGHT_FONTS.map((f) => f.id), 'sans'),
    },
    card: {
      radius: oneOf(card.radius, ['sm', 'md', 'lg', 'xl'] as const, 'lg'),
      shadow: oneOf(card.shadow, ['none', 'soft', 'strong'] as const, 'soft'),
      style: oneOf(card.style, ['solid', 'glass'] as const, 'solid'),
    },
  }
}

// ── Builders (validated → safe CSS) ──

/** Build a CSS gradient string from VALIDATED parts. The member never supplies this string. */
export function buildGradientCss(g: SpotlightGradient): string {
  const stops = g.stops.map((s) => `${s.color} ${s.pos}%`).join(', ')
  return g.type === 'radial'
    ? `radial-gradient(circle at 50% 30%, ${stops})`
    : `linear-gradient(${g.angle}deg, ${stops})`
}

/** Relative luminance (sRGB) of a #rrggbb colour, 0–1. */
function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16)
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2]
}
/** A readable near-black or near-white text colour for the given background. */
export function readableOn(hex: string): string {
  return luminance(hex) > 0.5 ? '#111111' : '#ffffff'
}

/** Translucent rgba() from a #rrggbb colour, for the glass card style. */
function withAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}

export interface SpotlightThemeStyles {
  /** Does the member have any custom theme set? (false → render unchanged.) */
  hasTheme: boolean
  /** CSS custom-property overrides + background for the page wrapper. */
  wrapper: CSSProperties
  /** Inline style for block cards (links/image/gallery/quote/stat pills). Empty when no theme. */
  card: CSSProperties
  /** Font stacks to apply to headings / body, or undefined to keep the default. */
  headingFont?: string
  bodyFont?: string
}

/**
 * Turn a validated theme into the style objects the page applies. Returns `hasTheme:false`
 * with empty styles for the default theme, so a member who hasn't customized renders
 * exactly as before. All values are derived from validated input (hex / enums / built
 * gradient) — there is no path for raw member CSS to reach the DOM.
 */
export function spotlightThemeStyles(theme: SpotlightTheme): SpotlightThemeStyles {
  const isDefault =
    !theme.accent && !theme.surface && !theme.text && theme.bg.kind === 'none' &&
    theme.font.heading === 'sans' && theme.font.body === 'sans' &&
    theme.card.radius === 'lg' && theme.card.shadow === 'soft' && theme.card.style === 'solid'
  if (isDefault) return { hasTheme: false, wrapper: {}, card: {} }

  const wrapper: Record<string, string> = {}

  // Background: solid recolours the canvas; gradient paints over it.
  if (theme.bg.kind === 'solid') {
    wrapper['--color-canvas'] = theme.bg.color
  } else if (theme.bg.kind === 'gradient') {
    wrapper.backgroundImage = buildGradientCss(theme.bg.gradient)
    if (theme.bg.gradient.animated) {
      // Pan a deliberately oversized gradient via the global `spotlight-bg-pan` keyframe.
      wrapper.backgroundSize = '300% 300%'
      wrapper.animation = `spotlight-bg-pan ${theme.bg.gradient.speed}s ease infinite`
    }
  }

  // The background colour we derive readable text against: an explicit solid bg, else the
  // first gradient stop, else the surface (cards), else a neutral.
  const bgRef =
    theme.bg.kind === 'solid' ? theme.bg.color
    : theme.bg.kind === 'gradient' ? theme.bg.gradient.stops[0].color
    : theme.surface ?? '#ffffff'
  const textColor = theme.text ?? readableOn(bgRef)
  wrapper['--color-text'] = textColor
  // Muted/subtle ride the same hue at lower contrast — reuse the same colour (the page
  // uses opacity-bearing utilities sparingly); keeping them equal is safe and legible.
  wrapper['--color-text-muted'] = textColor
  wrapper['--color-text-subtle'] = textColor

  if (theme.surface) {
    wrapper['--color-surface'] = theme.surface
    wrapper['--color-surface-elevated'] = theme.surface
  }
  if (theme.accent) {
    wrapper['--color-primary'] = theme.accent
    wrapper['--color-primary-hover'] = theme.accent
    wrapper['--color-primary-strong'] = theme.accent
    wrapper['--color-primary-bg'] = withAlpha(theme.accent, 0.15)
    wrapper['--color-text-on-primary'] = readableOn(theme.accent)
  }

  const headingFont = FONT_BY_ID.get(theme.font.heading)
  const bodyFont = FONT_BY_ID.get(theme.font.body)
  if (bodyFont) wrapper.fontFamily = bodyFont

  // Card style as inline style on each card (so no-theme members keep their classes).
  const surfaceForCard = theme.surface ?? '#ffffff'
  const card: CSSProperties = {
    borderRadius: RADIUS_PX[theme.card.radius],
    boxShadow: SHADOW_CSS[theme.card.shadow],
  }
  if (theme.card.style === 'glass') {
    card.backgroundColor = withAlpha(surfaceForCard, 0.55)
    card.backdropFilter = 'blur(10px)'
    ;(card as Record<string, unknown>).WebkitBackdropFilter = 'blur(10px)'
  } else if (theme.surface) {
    card.backgroundColor = theme.surface
  }

  return { hasTheme: true, wrapper: wrapper as CSSProperties, card, headingFont, bodyFont }
}
