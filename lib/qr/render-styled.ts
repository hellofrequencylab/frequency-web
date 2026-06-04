// The styled QR renderer: QR matrix (from `qrcode`) → a designed SVG string.
// Isomorphic (no node-only APIs) so the live editor preview (client) and the
// server (Studio list + /api/qr downloads) produce pixel-identical output.
//
// Scannability is preserved by construction: every dark module is drawn, the three
// finder "eyes" are redrawn as equivalent concentric shapes (tolerated by readers),
// and a center logo bumps error correction to 'H' and carves its own quiet area.

import QRCode from 'qrcode'
import type { QrStyle, EyeShape } from './style'

const escapeXml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const round = (n: number) => Math.round(n * 1000) / 1000

// Corner radii (in module units) for each eye part, per shape.
const EYE_RADII: Record<EyeShape, [outer: number, mid: number, inner: number]> = {
  square: [0, 0, 0],
  rounded: [1.75, 1.1, 0.7],
  circle: [3.5, 2.5, 1.5],
}

function eyeSvg(gx: number, gy: number, shape: EyeShape, fill: string, bg: string): string {
  const [ro, rm, ri] = EYE_RADII[shape]
  return (
    `<rect x="${gx}" y="${gy}" width="7" height="7" rx="${ro}" ry="${ro}" fill="${fill}"/>` +
    `<rect x="${gx + 1}" y="${gy + 1}" width="5" height="5" rx="${rm}" ry="${rm}" fill="${bg}"/>` +
    `<rect x="${gx + 2}" y="${gy + 2}" width="3" height="3" rx="${ri}" ry="${ri}" fill="${fill}"/>`
  )
}

/** Render a QR for `text` as a designed inline SVG string. `size` is the pixel
 *  width; height follows automatically when a CTA frame is present. */
export function renderStyledQrSvg(text: string, style: QrStyle, size = 256): string {
  const ecc = style.logo ? 'H' : 'M'
  const qr = QRCode.create(text, { errorCorrectionLevel: ecc })
  const N = qr.modules.size
  const m = style.margin

  const hasFrame = !!style.frameLabel
  const pad = hasFrame ? 2 : 0
  const labelH = hasFrame ? 5 : 0
  const grid = N + m * 2
  const W = grid + pad * 2
  const H = grid + pad * 2 + labelH

  const moduleFill = style.gradient ? 'url(#qrgrad)' : style.fg
  const eyeFill = style.eyeColor ?? moduleFill
  const ox = pad + m // module (0,0) origin in svg units
  const oy = pad + m

  const parts: string[] = []

  // Gradient definition spanning the QR area at the chosen angle.
  if (style.gradient) {
    const rad = (style.gradient.angle * Math.PI) / 180
    const cx = ox + N / 2
    const cy = oy + N / 2
    const half = N / 2
    const x1 = round(cx - Math.cos(rad) * half)
    const y1 = round(cy - Math.sin(rad) * half)
    const x2 = round(cx + Math.cos(rad) * half)
    const y2 = round(cy + Math.sin(rad) * half)
    parts.push(
      `<defs><linearGradient id="qrgrad" gradientUnits="userSpaceOnUse" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">` +
        `<stop offset="0%" stop-color="${style.gradient.from}"/>` +
        `<stop offset="100%" stop-color="${style.gradient.to}"/>` +
        `</linearGradient></defs>`,
    )
  }

  // Background — a rounded card when framed, a plain fill otherwise.
  if (hasFrame) {
    parts.push(
      `<rect x="0" y="0" width="${W}" height="${H}" rx="2.5" fill="${style.bg}" stroke="${eyeFill}" stroke-width="0.4"/>`,
    )
  } else {
    parts.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="${style.bg}"/>`)
  }

  const inEye = (r: number, c: number) =>
    (r < 7 && c < 7) || (r < 7 && c >= N - 7) || (r >= N - 7 && c < 7)

  // Data modules (skip the three eye regions; they're drawn as shapes below).
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      if (!qr.modules.get(r, c) || inEye(r, c)) continue
      const x = ox + c
      const y = oy + r
      if (style.moduleShape === 'dots') {
        parts.push(`<circle cx="${x + 0.5}" cy="${y + 0.5}" r="0.45" fill="${moduleFill}"/>`)
      } else if (style.moduleShape === 'rounded') {
        parts.push(`<rect x="${x}" y="${y}" width="1" height="1" rx="0.35" ry="0.35" fill="${moduleFill}"/>`)
      } else {
        parts.push(`<rect x="${x}" y="${y}" width="1" height="1" fill="${moduleFill}"/>`)
      }
    }
  }

  // Finder eyes.
  parts.push(eyeSvg(ox, oy, style.eyeShape, eyeFill, style.bg))
  parts.push(eyeSvg(ox + N - 7, oy, style.eyeShape, eyeFill, style.bg))
  parts.push(eyeSvg(ox, oy + N - 7, style.eyeShape, eyeFill, style.bg))

  // Center logo (with a carved quiet area).
  if (style.logo) {
    const lw = N * 0.22
    const cx = ox + N / 2
    const cy = oy + N / 2
    const padBox = lw + 1.2
    parts.push(
      `<rect x="${round(cx - padBox / 2)}" y="${round(cy - padBox / 2)}" width="${round(padBox)}" height="${round(padBox)}" rx="1" fill="${style.bg}"/>`,
    )
    parts.push(
      `<image href="${escapeXml(style.logo)}" x="${round(cx - lw / 2)}" y="${round(cy - lw / 2)}" width="${round(lw)}" height="${round(lw)}" preserveAspectRatio="xMidYMid meet"/>`,
    )
  }

  // CTA label.
  if (hasFrame && style.frameLabel) {
    parts.push(
      `<text x="${W / 2}" y="${round(grid + pad + labelH * 0.62)}" font-size="2.4" font-family="system-ui, -apple-system, sans-serif" font-weight="700" text-anchor="middle" fill="${style.eyeColor ?? style.fg}">${escapeXml(style.frameLabel)}</text>`,
    )
  }

  const height = Math.round((size * H) / W)
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${size}" height="${height}" shape-rendering="geometricPrecision">` +
    parts.join('') +
    `</svg>`
  )
}
