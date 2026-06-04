// The "beautiful" layer: the style config persisted on qr_codes.style (jsonb) and
// consumed by the styled renderer. Kept pure + isomorphic (no DB, no node-only
// APIs) so it runs identically in the live editor preview (client) and on the
// server (Studio list + downloads). Everything here is sanitized: a code's style
// comes from operator input, and it ends up inlined into an SVG, so colors, URLs,
// and labels are all validated before they render.

export type ModuleShape = 'square' | 'rounded' | 'dots'
export type EyeShape = 'square' | 'rounded' | 'circle'

export interface QrGradient {
  from: string
  to: string
  /** Degrees, 0 = left→right. */
  angle: number
}

export interface QrStyle {
  /** Module color (ignored when `gradient` is set). */
  fg: string
  bg: string
  gradient: QrGradient | null
  moduleShape: ModuleShape
  eyeShape: EyeShape
  /** Distinct color for the finder eyes, or null to match the modules. */
  eyeColor: string | null
  /** Center logo — an https or data:image URL, or null. */
  logo: string | null
  /** Call-to-action label under a card frame, or null for no frame. */
  frameLabel: string | null
  /** Quiet-zone width in modules. */
  margin: number
}

export const DEFAULT_STYLE: QrStyle = {
  fg: '#0b0b0c',
  bg: '#ffffff',
  gradient: null,
  moduleShape: 'square',
  eyeShape: 'square',
  eyeColor: null,
  logo: null,
  frameLabel: null,
  margin: 2,
}

export interface StylePreset {
  key: string
  label: string
  style: QrStyle
}

// A few tasteful starting points; every field stays editable afterwards.
export const STYLE_PRESETS: StylePreset[] = [
  { key: 'classic', label: 'Classic', style: { ...DEFAULT_STYLE } },
  {
    key: 'midnight',
    label: 'Midnight dots',
    style: { ...DEFAULT_STYLE, fg: '#0b1220', moduleShape: 'dots', eyeShape: 'circle' },
  },
  {
    key: 'sunset',
    label: 'Sunset',
    style: {
      ...DEFAULT_STYLE,
      moduleShape: 'rounded',
      eyeShape: 'rounded',
      gradient: { from: '#f97316', to: '#db2777', angle: 45 },
    },
  },
  {
    key: 'forest',
    label: 'Forest',
    style: { ...DEFAULT_STYLE, fg: '#065f46', moduleShape: 'rounded', eyeShape: 'rounded', eyeColor: '#0b3b2e' },
  },
]

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i
const MODULE_SHAPES: ModuleShape[] = ['square', 'rounded', 'dots']
const EYE_SHAPES: EyeShape[] = ['square', 'rounded', 'circle']

function color(value: unknown, fallback: string): string {
  return typeof value === 'string' && HEX.test(value.trim()) ? value.trim() : fallback
}

/** A logo src is safe to inline only if it's an https URL or a data:image URL. */
export function isSafeLogoSrc(src: string): boolean {
  const s = src.trim()
  return /^https:\/\//i.test(s) || /^data:image\/(png|jpeg|jpg|gif|svg\+xml|webp);/i.test(s)
}

/** Coerce arbitrary stored/edited JSON into a valid, safe QrStyle (defaults fill
 *  the gaps; anything malformed is dropped). */
export function parseStyle(raw: unknown): QrStyle {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>

  let gradient: QrGradient | null = null
  if (r.gradient && typeof r.gradient === 'object') {
    const g = r.gradient as Record<string, unknown>
    if (typeof g.from === 'string' && typeof g.to === 'string' && HEX.test(g.from) && HEX.test(g.to)) {
      const angle = Number(g.angle)
      gradient = { from: g.from, to: g.to, angle: Number.isFinite(angle) ? ((angle % 360) + 360) % 360 : 45 }
    }
  }

  const moduleShape = MODULE_SHAPES.includes(r.moduleShape as ModuleShape)
    ? (r.moduleShape as ModuleShape)
    : DEFAULT_STYLE.moduleShape
  const eyeShape = EYE_SHAPES.includes(r.eyeShape as EyeShape)
    ? (r.eyeShape as EyeShape)
    : DEFAULT_STYLE.eyeShape

  const logo = typeof r.logo === 'string' && isSafeLogoSrc(r.logo) ? r.logo.trim() : null

  const frameLabel =
    typeof r.frameLabel === 'string' && r.frameLabel.trim() ? r.frameLabel.trim().slice(0, 28) : null

  const marginRaw = Number(r.margin)
  const margin = Number.isFinite(marginRaw) ? Math.min(Math.max(Math.round(marginRaw), 0), 8) : DEFAULT_STYLE.margin

  return {
    fg: color(r.fg, DEFAULT_STYLE.fg),
    bg: color(r.bg, DEFAULT_STYLE.bg),
    gradient,
    moduleShape,
    eyeShape,
    eyeColor: typeof r.eyeColor === 'string' && HEX.test(r.eyeColor) ? r.eyeColor : null,
    logo,
    frameLabel,
    margin,
  }
}
