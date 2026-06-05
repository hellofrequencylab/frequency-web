// The "beautiful" layer: the style config persisted on qr_codes.style (jsonb) and
// consumed by the styled renderer. Kept pure + isomorphic (no DB, no node-only
// APIs) so it runs identically in the live editor preview (client) and on the
// server (Studio list + downloads). Everything here is sanitized: a code's style
// comes from operator input, and it ends up inlined into an SVG, so colors, URLs,
// and labels are all validated before they render.

export type ModuleShape = 'square' | 'rounded' | 'dots' | 'connected'
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
  /** Outer finder-eye frame shape. */
  eyeShape: EyeShape
  /** Inner finder-eye pupil shape (defaults to the frame shape). */
  pupilShape: EyeShape
  /** Distinct color for the finder eyes, or null to match the modules. */
  eyeColor: string | null
  /** Center logo — an https or data:image URL, or null. */
  logo: string | null
  /** Logo crop shape. */
  logoShape: 'square' | 'circle'
  /** Recolor the logo: none (original), solid (module color), gradient (module gradient). */
  logoTint: 'none' | 'solid' | 'gradient'
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
  pupilShape: 'square',
  eyeColor: null,
  logo: null,
  logoShape: 'square',
  logoTint: 'none',
  frameLabel: null,
  margin: 2,
}

export interface StylePreset {
  key: string
  label: string
  style: QrStyle
}

// A curated, tasteful set of starting points — one per distinct look (mono, dots,
// gradient, connected, dark). Every field stays editable afterwards. NOTE: the
// member-code defaults (lib/qr/member-codes.ts) reference `sunset`/`forest`/
// `midnight` by key, so keep those keys stable.
export const STYLE_PRESETS: StylePreset[] = [
  { key: 'classic', label: 'Classic', style: { ...DEFAULT_STYLE } },
  {
    key: 'midnight',
    label: 'Midnight',
    style: { ...DEFAULT_STYLE, fg: '#0b1220', moduleShape: 'dots', eyeShape: 'circle', pupilShape: 'circle' },
  },
  {
    key: 'sunset',
    label: 'Sunset',
    style: {
      ...DEFAULT_STYLE,
      moduleShape: 'rounded',
      eyeShape: 'rounded',
      pupilShape: 'rounded',
      gradient: { from: '#f97316', to: '#db2777', angle: 45 },
    },
  },
  {
    key: 'forest',
    label: 'Forest',
    style: {
      ...DEFAULT_STYLE,
      fg: '#065f46',
      moduleShape: 'rounded',
      eyeShape: 'rounded',
      pupilShape: 'circle',
      eyeColor: '#0b3b2e',
    },
  },
  {
    key: 'ocean',
    label: 'Ocean',
    style: {
      ...DEFAULT_STYLE,
      moduleShape: 'connected',
      eyeShape: 'rounded',
      pupilShape: 'circle',
      gradient: { from: '#0ea5e9', to: '#2563eb', angle: 90 },
    },
  },
  {
    key: 'gold',
    label: 'Gold',
    style: {
      ...DEFAULT_STYLE,
      bg: '#0b0b0c',
      moduleShape: 'rounded',
      eyeShape: 'rounded',
      pupilShape: 'rounded',
      gradient: { from: '#fde68a', to: '#d97706', angle: 60 },
    },
  },
]

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i
const MODULE_SHAPES: ModuleShape[] = ['square', 'rounded', 'dots', 'connected']
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
  // Pupil defaults to the frame shape, so codes saved before this field keep their look.
  const pupilShape = EYE_SHAPES.includes(r.pupilShape as EyeShape) ? (r.pupilShape as EyeShape) : eyeShape

  const logo = typeof r.logo === 'string' && isSafeLogoSrc(r.logo) ? r.logo.trim() : null
  const logoShape = r.logoShape === 'circle' ? 'circle' : 'square'
  const logoTint =
    r.logoTint === 'solid' || r.logoTint === 'gradient' ? r.logoTint : 'none'

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
    pupilShape,
    eyeColor: typeof r.eyeColor === 'string' && HEX.test(r.eyeColor) ? r.eyeColor : null,
    logo,
    logoShape,
    logoTint,
    frameLabel,
    margin,
  }
}
