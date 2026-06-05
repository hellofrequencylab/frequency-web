// The flyer composer (ADR-126, docs/ENTRY-POINTS.md). Builds a print-ready,
// on-brand poster as an SVG string: brand frame + headline/subhead slots + the
// styled QR (lib/qr/render-styled.ts) + a CTA. Output is true vector — it scales to
// any print size and opens editable in a crew member's design tools, which is the
// whole "download a vector file for their art" ask.
//
// Isomorphic (no node-only APIs): the builder preview (client) and the download
// route (server) produce identical output. Text renders with system fonts wherever
// the SVG opens. (A PNG export needs a bundled font for the rasterizer — a follow-up;
// the QR itself already downloads as PNG via /api/qr.)

import { renderStyledQrSvg } from '@/lib/qr/render-styled'
import { DEFAULT_STYLE, type QrStyle } from '@/lib/qr/style'
import { FLYER_BRAND, FLYER_WORDMARK } from './brand'

export type FlyerLayout = 'poster' | 'card'

export interface FlyerSlots {
  headline: string
  subhead: string
  footer: string
}

export interface FlyerInput {
  layout: FlyerLayout
  slots: FlyerSlots
  /** The QR style (the code's saved style); the flyer drops the QR's own CTA frame. */
  qrStyle?: QrStyle
  /** Absolute /q/<slug> short link the QR encodes. */
  url: string
  /** Short human label shown under the QR (e.g. the slug or domain). */
  shortLabel?: string
  /** Pixel width of the exported SVG (height follows the layout aspect). */
  size?: number
}

const escapeXml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Greedy word-wrap to at most `maxLines` lines of ~`maxChars` each (trailing … ). */
function wrap(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ''
  for (const w of words) {
    const next = line ? `${line} ${w}` : w
    if (next.length > maxChars && line) {
      lines.push(line)
      line = w
      if (lines.length === maxLines - 1) break
    } else {
      line = next
    }
  }
  if (line && lines.length < maxLines) lines.push(line)
  // If words remain past the cap, ellipsize the last line.
  const used = lines.join(' ').split(/\s+/).filter(Boolean).length
  if (used < words.length && lines.length) {
    lines[lines.length - 1] = lines[lines.length - 1].replace(/\s*$/, '') + '…'
  }
  return lines
}

interface LayoutSpec {
  w: number
  h: number
  pad: number
  wordmarkY: number
  headlineSize: number
  headlineMax: number
  headlineLines: number
  subheadSize: number
  subheadMax: number
  subheadLines: number
  qBox: number
}

const SPECS: Record<FlyerLayout, LayoutSpec> = {
  poster: { w: 1080, h: 1350, pad: 72, wordmarkY: 118, headlineSize: 86, headlineMax: 15, headlineLines: 3, subheadSize: 34, subheadMax: 40, subheadLines: 2, qBox: 460 },
  card: { w: 1080, h: 1080, pad: 64, wordmarkY: 104, headlineSize: 64, headlineMax: 18, headlineLines: 2, subheadSize: 30, subheadMax: 44, subheadLines: 2, qBox: 380 },
}

/** Compose the flyer as an SVG string. */
export function buildEntryFlyerSvg(input: FlyerInput): string {
  const s = SPECS[input.layout] ?? SPECS.poster
  const size = input.size ?? s.w
  const B = FLYER_BRAND
  const qrStyle = input.qrStyle ?? DEFAULT_STYLE

  const parts: string[] = []

  // Background card + inset accent frame.
  parts.push(`<rect x="0" y="0" width="${s.w}" height="${s.h}" rx="40" fill="${B.canvas}"/>`)
  parts.push(
    `<rect x="20" y="20" width="${s.w - 40}" height="${s.h - 40}" rx="28" fill="none" stroke="${B.primary}" stroke-width="3"/>`,
  )

  // Wordmark.
  parts.push(
    `<text x="${s.w / 2}" y="${s.wordmarkY}" text-anchor="middle" font-family="'Helvetica Neue', Arial, sans-serif" font-size="34" font-weight="800" letter-spacing="10" fill="${B.ink}">${FLYER_WORDMARK}</text>`,
  )
  parts.push(`<rect x="${s.w / 2 - 36}" y="${s.wordmarkY + 22}" width="72" height="4" rx="2" fill="${B.primary}"/>`)

  // Headline (uppercase) — top-anchored block.
  const headLines = wrap(input.slots.headline.toUpperCase(), s.headlineMax, s.headlineLines)
  const headTop = s.wordmarkY + 96
  const headLH = Math.round(s.headlineSize * 1.06)
  headLines.forEach((ln, i) => {
    parts.push(
      `<text x="${s.w / 2}" y="${headTop + i * headLH}" text-anchor="middle" font-family="'Helvetica Neue', Arial, sans-serif" font-size="${s.headlineSize}" font-weight="800" fill="${B.ink}">${escapeXml(ln)}</text>`,
    )
  })

  // Subhead.
  const cursor = headTop + headLines.length * headLH + 18
  const subLines = wrap(input.slots.subhead, s.subheadMax, s.subheadLines)
  const subLH = Math.round(s.subheadSize * 1.3)
  subLines.forEach((ln, i) => {
    parts.push(
      `<text x="${s.w / 2}" y="${cursor + i * subLH}" text-anchor="middle" font-family="'Helvetica Neue', Arial, sans-serif" font-size="${s.subheadSize}" font-weight="400" fill="${B.muted}">${escapeXml(ln)}</text>`,
    )
  })

  // CTA pill — bottom-anchored.
  const ctaH = 92
  const ctaW = Math.min(s.w - s.pad * 2, 720)
  const ctaX = (s.w - ctaW) / 2
  const ctaY = s.h - s.pad - ctaH
  parts.push(`<rect x="${ctaX}" y="${ctaY}" width="${ctaW}" height="${ctaH}" rx="${ctaH / 2}" fill="${B.primary}"/>`)
  parts.push(
    `<text x="${s.w / 2}" y="${ctaY + ctaH / 2 + 14}" text-anchor="middle" font-family="'Helvetica Neue', Arial, sans-serif" font-size="38" font-weight="800" fill="${B.onPrimary}">${escapeXml(input.slots.footer)}</text>`,
  )

  // Short link label above the CTA.
  let stackBottom = ctaY - 28
  if (input.shortLabel) {
    parts.push(
      `<text x="${s.w / 2}" y="${stackBottom}" text-anchor="middle" font-family="'Helvetica Neue', Arial, sans-serif" font-size="26" font-weight="600" fill="${B.muted}">${escapeXml(input.shortLabel)}</text>`,
    )
    stackBottom -= 44
  }

  // QR card — bottom-anchored above the link/CTA, in a white rounded tile.
  const qCard = s.qBox
  const qCardX = (s.w - qCard) / 2
  const qCardY = stackBottom - qCard
  parts.push(
    `<rect x="${qCardX}" y="${qCardY}" width="${qCard}" height="${qCard}" rx="32" fill="${B.surface}" stroke="${B.hairline}" stroke-width="2"/>`,
  )
  const qPad = 36
  const qPx = qCard - qPad * 2
  // Drop the QR's own CTA frame — the flyer provides the call to action.
  const qr = renderStyledQrSvg(input.url, { ...qrStyle, frameLabel: null }, qPx)
  parts.push(qr.replace('<svg ', `<svg x="${qCardX + qPad}" y="${qCardY + qPad}" `))

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${s.w} ${s.h}" width="${size}" height="${Math.round((size * s.h) / s.w)}">` +
    parts.join('') +
    `</svg>`
  )
}
