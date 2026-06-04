// Server-side QR image rendering. Wraps the `qrcode` library (pure JS — no native
// `sharp` dependency) behind a tiny, opinionated surface so callers never repeat
// option soup. Used by the admin QR Studio (inline preview), the member "My code"
// page, and the `/api/qr` download endpoint.
//
// SVG is the default: crisp at any print size and renderable inline with zero
// client JS. PNG is offered for surfaces (some label printers, slide decks) that
// want a raster.

import QRCode from 'qrcode'

export type QrFormat = 'svg' | 'png'

// 'M' (~15% recovery) is the sweet spot for short URLs printed on signage: small
// enough to stay legible, tolerant of a scuff or two. margin:1 keeps the quiet
// zone tight for layout while still scanning reliably.
const BASE = { errorCorrectionLevel: 'M' as const, margin: 1 }

/** A QR code for `text` as a standalone inline SVG string. */
export function renderQrSvg(text: string, size = 256): Promise<string> {
  return QRCode.toString(text, { ...BASE, type: 'svg', width: size })
}

/** A QR code for `text` as a PNG buffer. */
export function renderQrPng(text: string, size = 512): Promise<Buffer> {
  return QRCode.toBuffer(text, { ...BASE, type: 'png', width: size })
}
