// Scannability guardrails (ADR-113). A pure, isomorphic heuristic over a QrStyle
// that flags design choices likely to make a printed/rendered code fail to scan —
// surfaced as warnings in the editor BEFORE anyone prints a batch. Advisory only;
// it never blocks saving. The big real-world killers are low contrast, an inverted
// (light-on-dark) code, and too small a quiet zone.

import type { QrStyle } from './style'

/** Parse #rgb / #rrggbb → [r,g,b] 0–255, or null. */
function toRgb(hex: string): [number, number, number] | null {
  const s = hex.trim().replace('#', '')
  const full = s.length === 3 ? s.split('').map((c) => c + c).join('') : s
  if (full.length !== 6 || /[^0-9a-f]/i.test(full)) return null
  return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)]
}

/** WCAG relative luminance (0 = black, 1 = white). */
function luminance([r, g, b]: [number, number, number]): number {
  const lin = [r, g, b].map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]
}

/** WCAG contrast ratio (1–21) between two colors. */
export function contrastRatio(a: string, b: string): number {
  const ra = toRgb(a)
  const rb = toRgb(b)
  if (!ra || !rb) return 21 // unknown → don't false-alarm
  const la = luminance(ra)
  const lb = luminance(rb)
  const [hi, lo] = la > lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

/** Advisory warnings for a code's design — empty array means it looks scannable. */
export function scannabilityWarnings(style: QrStyle): string[] {
  const out: string[] = []

  // Contrast: compare the WORST module color (darker gradient stop, or fg) to bg.
  const moduleColors = style.gradient ? [style.gradient.from, style.gradient.to] : [style.fg]
  const worstContrast = Math.min(...moduleColors.map((c) => contrastRatio(c, style.bg)))
  if (worstContrast < 4) {
    out.push(
      'Low contrast between the code and its background — many phones will struggle. Use a dark code on a light background.',
    )
  }

  // Inverted: light modules on a dark background scan poorly on a lot of cameras.
  const bg = toRgb(style.bg)
  const fg = toRgb(style.gradient ? style.gradient.from : style.fg)
  if (bg && fg && luminance(bg) < luminance(fg)) {
    out.push('Light code on a dark background scans poorly on many phones — prefer dark modules on a light background.')
  }

  // Quiet zone: QR needs a clear margin to be located.
  if (style.margin < 2) {
    out.push('Quiet-zone margin is small — set it to at least 2 so scanners can find the code.')
  }

  // A logo eats into the data; fine at the high error-correction we use, but compounds
  // with weak contrast. Only nudge when both are in play.
  if (style.logo && worstContrast < 6) {
    out.push('A center logo plus modest contrast is risky — bump the contrast or test-scan before printing.')
  }

  return out
}
