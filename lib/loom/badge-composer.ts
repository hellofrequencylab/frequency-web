// Deterministic house-style badge/trophy composer (ADR-492). NOT AI: given a template + glyph +
// palette + labels, it assembles a flat, on-brand SVG the same way every time — warm, filled, DAWN
// brand colors. The Loom rasterizes the result to a PNG on save (SVG <text> is outside the element
// sanitizer's allowlist, and badges are used as raster art anyway). Pure + framework-free so it is
// unit-testable and safe to import on client or server. See docs/LOOM-DESIGN-LANGUAGE.md.

export type BadgeTemplate = 'medallion' | 'ribbon' | 'seal' | 'shield'
export type BadgeGlyph =
  | 'lotus' | 'moon' | 'sun' | 'star' | 'sparkle' | 'flame' | 'leaf' | 'summit' | 'heart' | 'drop'
export type BadgePaletteId = 'amber' | 'sage' | 'slate' | 'sky'

export type BadgeSpec = {
  template: BadgeTemplate
  glyph: BadgeGlyph
  palette: BadgePaletteId
  /** Big label, e.g. "100 DAYS". */
  title: string
  /** Small label under it, e.g. "MEDITATION". */
  subtitle: string
}

type Palette = { id: BadgePaletteId; label: string; ring: string; face: string; deep: string; ink: string; on: string }

// DAWN brand tokens as fixed hex (app/globals.css). Fixed, not token classes, because the badge is
// rasterized to a flat PNG — canvas can't resolve CSS variables.
export const BADGE_PALETTES: Palette[] = [
  { id: 'amber', label: 'Amber', ring: '#E2912F', face: '#FBEFD9', deep: '#9A5E12', ink: '#3D352A', on: '#FFFFFF' },
  { id: 'sage', label: 'Sage', ring: '#0F8E78', face: '#D2EDE6', deep: '#0A5C4D', ink: '#04231E', on: '#FFFFFF' },
  { id: 'slate', label: 'Slate', ring: '#3D352A', face: '#FAF6EC', deep: '#141210', ink: '#211D17', on: '#FBF8F1' },
  { id: 'sky', label: 'Sky', ring: '#1EB6C5', face: '#D8F2F5', deep: '#0E808D', ink: '#04231E', on: '#FFFFFF' },
]

export const BADGE_TEMPLATES: { id: BadgeTemplate; label: string }[] = [
  { id: 'medallion', label: 'Medallion' },
  { id: 'ribbon', label: 'Ribbon' },
  { id: 'seal', label: 'Seal' },
  { id: 'shield', label: 'Shield' },
]

export const BADGE_GLYPHS: { id: BadgeGlyph; label: string }[] = [
  { id: 'lotus', label: 'Lotus' },
  { id: 'moon', label: 'Moon' },
  { id: 'sun', label: 'Sun' },
  { id: 'star', label: 'Star' },
  { id: 'sparkle', label: 'Sparkle' },
  { id: 'flame', label: 'Flame' },
  { id: 'leaf', label: 'Leaf' },
  { id: 'summit', label: 'Summit' },
  { id: 'heart', label: 'Heart' },
  { id: 'drop', label: 'Drop' },
]

export const DEFAULT_BADGE_SPEC: BadgeSpec = {
  template: 'medallion',
  glyph: 'lotus',
  palette: 'amber',
  title: '100 DAYS',
  subtitle: 'MEDITATION',
}

// ── geometry helpers ──────────────────────────────────────────────────────────────────────────
const r2 = (n: number) => Math.round(n * 100) / 100

/** A regular star polygon's points (centered), used for stars, sparkles + seal edges. */
function starPoints(cx: number, cy: number, spikes: number, outer: number, inner: number, rotDeg = -90): string {
  const step = Math.PI / spikes
  let a = (rotDeg * Math.PI) / 180
  const pts: string[] = []
  for (let i = 0; i < spikes * 2; i++) {
    const rad = i % 2 === 0 ? outer : inner
    pts.push(`${r2(cx + Math.cos(a) * rad)},${r2(cy + Math.sin(a) * rad)}`)
    a += step
  }
  return pts.join(' ')
}

function esc(s: string): string {
  return s.replace(/[<>&]/g, (c) => (c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&amp;'))
}

// ── glyphs (drawn in a 100×100 box, filled `c`) ─────────────────────────────────────────────────
function glyphMarkup(glyph: BadgeGlyph, c: string, soft: string): string {
  switch (glyph) {
    case 'lotus': {
      // A center petal + four side petals (rotated ellipses) rising from a small base.
      const petal = (rot: number, rx: number, ry: number) =>
        `<ellipse cx="50" cy="52" rx="${rx}" ry="${ry}" fill="${c}" transform="rotate(${rot} 50 70)"/>`
      return (
        petal(0, 11, 34) +
        petal(-32, 10, 30) +
        petal(32, 10, 30) +
        petal(-60, 9, 24) +
        petal(60, 9, 24) +
        `<ellipse cx="50" cy="78" rx="30" ry="8" fill="${soft}"/>`
      )
    }
    case 'moon':
      return `<path d="M64 18 A40 40 0 1 0 64 90 A32 32 0 1 1 64 18 Z" fill="${c}"/>`
    case 'sun': {
      let rays = ''
      for (let i = 0; i < 12; i++) {
        const a = (i * 30 * Math.PI) / 180
        const x1 = r2(50 + Math.cos(a) * 30)
        const y1 = r2(50 + Math.sin(a) * 30)
        const x2 = r2(50 + Math.cos(a) * 46)
        const y2 = r2(50 + Math.sin(a) * 46)
        rays += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${c}" stroke-width="6" stroke-linecap="round"/>`
      }
      return rays + `<circle cx="50" cy="50" r="22" fill="${c}"/>`
    }
    case 'star':
      return `<polygon points="${starPoints(50, 50, 5, 46, 18)}" fill="${c}"/>`
    case 'sparkle':
      return `<polygon points="${starPoints(50, 50, 4, 46, 13)}" fill="${c}"/>`
    case 'flame':
      return `<path d="M50 14 C 70 40 72 58 60 72 C 50 84 34 78 32 62 C 31 50 40 46 42 32 C 50 40 46 54 55 56 C 64 52 60 34 50 14 Z" fill="${c}"/>`
    case 'leaf':
      return (
        `<path d="M50 16 C 74 30 74 64 50 84 C 26 64 26 30 50 16 Z" fill="${c}"/>` +
        `<line x1="50" y1="28" x2="50" y2="78" stroke="${soft}" stroke-width="4" stroke-linecap="round"/>`
      )
    case 'summit':
      return (
        `<polygon points="14,80 40,34 54,54 68,28 90,80" fill="${c}"/>` +
        `<polygon points="62,38 68,28 76,44" fill="${soft}"/>`
      )
    case 'heart':
      return `<path d="M50 82 C 16 58 18 28 40 28 C 49 28 50 37 50 42 C 50 37 51 28 60 28 C 82 28 84 58 50 82 Z" fill="${c}"/>`
    case 'drop':
      return `<path d="M50 14 C 68 40 74 56 62 70 C 52 82 38 80 34 66 C 31 54 40 44 50 14 Z" fill="${c}"/>`
    default:
      return ''
  }
}

/** Just the glyph, in a 100×100 SVG — for the picker swatches. Pass 'currentColor' to inherit. */
export function glyphSvg(glyph: BadgeGlyph, color = '#3D352A'): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">${glyphMarkup(glyph, color, color)}</svg>`
}

// ── templates ────────────────────────────────────────────────────────────────────────────────
/** A two-tone banner hanging BEHIND a round badge (drawn before it), notched at the bottom. Kept
 *  above the text zone so the labels stay clear. */
function ribbonBanner(p: Palette): string {
  return (
    `<polygon points="164,150 164,300 200,280 200,150" fill="${p.deep}"/>` +
    `<polygon points="236,150 236,300 200,280 200,150" fill="${p.ring}"/>`
  )
}

function roundBadge(p: Palette, glyph: BadgeGlyph, cx: number, cy: number, R: number): string {
  const face = R - 24
  const gScale = (face * 1.15) / 100
  const gx = cx - (100 * gScale) / 2
  const gy = cy - 62 * gScale
  return (
    `<circle cx="${cx}" cy="${cy}" r="${R}" fill="${p.ring}"/>` +
    `<circle cx="${cx}" cy="${cy}" r="${R - 12}" fill="${p.deep}"/>` +
    `<circle cx="${cx}" cy="${cy}" r="${face}" fill="${p.face}"/>` +
    `<g transform="translate(${r2(gx)} ${r2(gy)}) scale(${r2(gScale)})">${glyphMarkup(glyph, p.deep, p.ring)}</g>`
  )
}

function textBlock(p: Palette, title: string, subtitle: string, cy: number): string {
  const t = esc(title.toUpperCase()).slice(0, 22)
  const s = esc(subtitle.toUpperCase()).slice(0, 26)
  const font = `font-family="'Helvetica Neue', Arial, sans-serif"`
  let out = ''
  if (t) out += `<text x="200" y="${cy}" text-anchor="middle" ${font} font-weight="800" font-size="42" letter-spacing="1" fill="${p.ink}">${t}</text>`
  if (s) out += `<text x="200" y="${cy + 32}" text-anchor="middle" ${font} font-weight="700" font-size="19" letter-spacing="3" fill="${p.deep}">${s}</text>`
  return out
}

/** Compose the badge into a standalone SVG string (400×440). */
export function composeBadge(spec: BadgeSpec): string {
  const p = BADGE_PALETTES.find((x) => x.id === spec.palette) ?? BADGE_PALETTES[0]
  const glyph = spec.glyph
  let body = ''

  if (spec.template === 'medallion') {
    body = roundBadge(p, glyph, 200, 150, 130) + textBlock(p, spec.title, spec.subtitle, 340)
  } else if (spec.template === 'ribbon') {
    // Banner hangs behind the badge (drawn first); labels sit below both, clear of the notch.
    body = ribbonBanner(p) + roundBadge(p, glyph, 200, 138, 104) + textBlock(p, spec.title, spec.subtitle, 356)
  } else if (spec.template === 'seal') {
    const burst = `<polygon points="${starPoints(200, 150, 28, 140, 122)}" fill="${p.ring}"/>`
    body =
      burst +
      `<circle cx="200" cy="150" r="118" fill="${p.deep}"/>` +
      `<circle cx="200" cy="150" r="106" fill="${p.face}"/>` +
      `<g transform="translate(140 90) scale(1.2)">${glyphMarkup(glyph, p.deep, p.ring)}</g>` +
      textBlock(p, spec.title, spec.subtitle, 340)
  } else {
    // shield
    const shield = `<path d="M200 26 L 344 66 L 344 214 C 344 300 276 352 200 384 C 124 352 56 300 56 214 L 56 66 Z" fill="${p.ring}"/>`
    const inner = `<path d="M200 46 L 326 80 L 326 210 C 326 286 266 332 200 360 C 134 332 74 286 74 210 L 74 80 Z" fill="${p.face}"/>`
    body =
      shield +
      inner +
      `<g transform="translate(140 78) scale(1.2)">${glyphMarkup(glyph, p.deep, p.ring)}</g>` +
      textBlock(p, spec.title, spec.subtitle, 300)
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 440" width="400" height="440">${body}</svg>`
}
