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

// Corner radii (module units) for the eye frame's outer (7×7) + middle (5×5) ring.
const FRAME_RADII: Record<EyeShape, [outer: number, mid: number]> = {
  square: [0, 0],
  rounded: [1.75, 1.1],
  circle: [3.5, 2.5],
}
// Corner radius for the pupil (3×3).
const PUPIL_RADII: Record<EyeShape, number> = { square: 0, rounded: 0.7, circle: 1.5 }

function eyeSvg(gx: number, gy: number, frame: EyeShape, pupil: EyeShape, fill: string, bg: string): string {
  const [ro, rm] = FRAME_RADII[frame]
  const ri = PUPIL_RADII[pupil]
  return (
    `<rect x="${gx}" y="${gy}" width="7" height="7" rx="${ro}" ry="${ro}" fill="${fill}"/>` +
    `<rect x="${gx + 1}" y="${gy + 1}" width="5" height="5" rx="${rm}" ry="${rm}" fill="${bg}"/>` +
    `<rect x="${gx + 2}" y="${gy + 2}" width="3" height="3" rx="${ri}" ry="${ri}" fill="${fill}"/>`
  )
}

/** Render a QR for `text` as a designed inline SVG string. `size` is the pixel
 *  width; height follows automatically when a CTA frame is present. `transparent`
 *  omits the outer background field (for a transparent PNG export). */
export function renderStyledQrSvg(
  text: string,
  style: QrStyle,
  size = 256,
  opts?: { transparent?: boolean },
): string {
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

  // Background — a rounded card when framed, a plain fill otherwise. A transparent export
  // (the PNG download) omits the outer field entirely, so only the code and its structural
  // quiet bits (the eye middles + the logo halo, both still drawn in style.bg) paint and the
  // modules stay scannable on any surface.
  if (hasFrame) {
    parts.push(
      `<rect x="0" y="0" width="${W}" height="${H}" rx="2.5" fill="${style.bg}" stroke="${eyeFill}" stroke-width="0.4"/>`,
    )
  } else if (!opts?.transparent) {
    parts.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="${style.bg}"/>`)
  }

  const inEye = (r: number, c: number) =>
    (r < 7 && c < 7) || (r < 7 && c >= N - 7) || (r >= N - 7 && c < 7)
  const isDark = (r: number, c: number) => !!qr.modules.get(r, c) && !inEye(r, c)

  // Data modules (the three eye regions are drawn as shapes below).
  if (style.moduleShape === 'connected') {
    // Merge adjacent modules into rounded-end bars (horizontal + vertical runs),
    // so the code reads as smooth connected strokes with rounded caps.
    for (let r = 0; r < N; r++) {
      let c = 0
      while (c < N) {
        if (!isDark(r, c)) { c++; continue }
        const start = c
        while (c < N && isDark(r, c)) c++
        parts.push(
          `<rect x="${ox + start}" y="${oy + r}" width="${c - start}" height="1" rx="0.5" ry="0.5" fill="${moduleFill}"/>`,
        )
      }
    }
    for (let c = 0; c < N; c++) {
      let r = 0
      while (r < N) {
        if (!isDark(r, c)) { r++; continue }
        const start = r
        while (r < N && isDark(r, c)) r++
        if (r - start >= 2) {
          parts.push(
            `<rect x="${ox + c}" y="${oy + start}" width="1" height="${r - start}" rx="0.5" ry="0.5" fill="${moduleFill}"/>`,
          )
        }
      }
    }
  } else {
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        if (!isDark(r, c)) continue
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
  }

  // Finder eyes (frame + pupil styled independently).
  parts.push(eyeSvg(ox, oy, style.eyeShape, style.pupilShape, eyeFill, style.bg))
  parts.push(eyeSvg(ox + N - 7, oy, style.eyeShape, style.pupilShape, eyeFill, style.bg))
  parts.push(eyeSvg(ox, oy + N - 7, style.eyeShape, style.pupilShape, eyeFill, style.bg))

  // Center logo — carved quiet area, square/circle crop, optional color/gradient tint.
  if (style.logo) {
    const lw = N * 0.22
    const cx = ox + N / 2
    const cy = oy + N / 2
    const padBox = lw + 1.2
    const lx = round(cx - lw / 2)
    const ly = round(cy - lw / 2)
    const lwR = round(lw)
    const circle = style.logoShape === 'circle'

    // Quiet area behind the logo, matching the crop shape.
    parts.push(
      circle
        ? `<circle cx="${round(cx)}" cy="${round(cy)}" r="${round(padBox / 2)}" fill="${style.bg}"/>`
        : `<rect x="${round(cx - padBox / 2)}" y="${round(cy - padBox / 2)}" width="${round(padBox)}" height="${round(padBox)}" rx="1" fill="${style.bg}"/>`,
    )

    const clipId = 'qrlogoclip'
    parts.push(
      `<clipPath id="${clipId}">` +
        (circle
          ? `<circle cx="${round(cx)}" cy="${round(cy)}" r="${round(lw / 2)}"/>`
          : `<rect x="${lx}" y="${ly}" width="${lwR}" height="${lwR}" rx="${round(lw * 0.12)}"/>`) +
        `</clipPath>`,
    )

    const img = `<image href="${escapeXml(style.logo)}" x="${lx}" y="${ly}" width="${lwR}" height="${lwR}" preserveAspectRatio="xMidYMid ${circle ? 'slice' : 'meet'}"/>`

    if (style.logoTint === 'none') {
      parts.push(`<g clip-path="url(#${clipId})">${img}</g>`)
    } else {
      // Recolor: use the logo's alpha as a mask, fill with the module color or the
      // (cohesive) module gradient. Great for monochrome / transparent marks.
      const tintFill = style.logoTint === 'gradient' && style.gradient ? 'url(#qrgrad)' : style.fg
      const maskId = 'qrlogomask'
      parts.push(`<mask id="${maskId}" mask-type="alpha">${img}</mask>`)
      parts.push(
        `<rect x="${lx}" y="${ly}" width="${lwR}" height="${lwR}" fill="${tintFill}" mask="url(#${maskId})" clip-path="url(#${clipId})"/>`,
      )
    }
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
