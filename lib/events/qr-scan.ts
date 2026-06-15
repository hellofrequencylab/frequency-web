// On-device QR decode for the poster capture flow (browser only).
//
// Posters increasingly print a QR that IS the booking / RSVP link, and a vision
// model can't reliably read a QR pattern. So we decode it ourselves, on-device,
// with the native BarcodeDetector — present in Chromium / Android (the main
// capture target) and absent on iOS Safari, where this degrades to "no links
// found" and any printed URL the model read still stands. Zero added bundle,
// zero network: the same doctrine as the rest of the capture pipeline (downscale,
// deskew, crops all happen on the client).
//
// The two parsing helpers (qrPayloadToUrl, classifyLink) are pure and unit-tested
// in qr-scan.test.ts; decodePosterLinks is the thin browser wrapper.

import type { EventLink } from './types'

interface DetectedBarcode {
  rawValue: string
}
interface BarcodeDetectorInstance {
  detect: (source: CanvasImageSource | Blob | ImageBitmap) => Promise<DetectedBarcode[]>
}
type BarcodeDetectorCtor = new (opts?: { formats?: string[] }) => BarcodeDetectorInstance

/**
 * Pull a usable http(s) URL out of a raw QR payload, or null. QR codes also
 * carry wifi / vcard / tel / plain text — we only want a booking link. A bare
 * "www.x.com" or "x.com/tickets" gets an https:// prefix; a non-link scheme
 * (mailto:, tel:, WIFI:) or anything that isn't domain-shaped is dropped.
 */
export function qrPayloadToUrl(raw: unknown): string | null {
  const s = typeof raw === 'string' ? raw.trim() : ''
  if (!s || /\s/.test(s)) return null
  let candidate = s
  if (!/^https?:\/\//i.test(candidate)) {
    // A non-http scheme (mailto:, tel:, WIFI:, geo:, ...) is not a booking link.
    if (/^[a-z][\w+.-]*:/i.test(candidate)) return null
    // Otherwise it must look like a bare domain before we promote it to https.
    if (!/^[\w-]+(\.[\w-]+)+(\/|$|\?)/.test(candidate)) return null
    candidate = `https://${candidate}`
  }
  try {
    const u = new URL(candidate)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    return u.toString()
  } catch {
    return null
  }
}

/** Classify a booking URL into the EventLink kind + a plain label. */
export function classifyLink(url: string): { kind: EventLink['kind']; label: string } {
  const u = url.toLowerCase()
  if (/eventbrite|ticketmaster|\btix\b|ticket|dice\.fm|seetickets|ra\.co|showclix|ticketweb/.test(u))
    return { kind: 'tickets', label: 'Tickets' }
  if (/rsvp|meetup\.com|lu\.ma|\bluma\b|partiful/.test(u)) return { kind: 'rsvp', label: 'RSVP' }
  if (/instagram\.com|instagr\.am/.test(u)) return { kind: 'instagram', label: 'Instagram' }
  return { kind: 'website', label: 'More info' }
}

/**
 * Decode any QR codes in the image into booking-ready EventLinks (deduped,
 * classified). Returns [] when the browser can't decode or nothing usable is
 * found; the caller folds these into details.links.
 */
export async function decodePosterLinks(
  source: HTMLImageElement | HTMLCanvasElement,
): Promise<EventLink[]> {
  const Ctor = (globalThis as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector
  if (!Ctor) return []
  try {
    const detector = new Ctor({ formats: ['qr_code'] })
    const codes = await detector.detect(source)
    const out: EventLink[] = []
    const seen = new Set<string>()
    for (const c of codes) {
      const url = qrPayloadToUrl(c.rawValue)
      if (!url || seen.has(url)) continue
      seen.add(url)
      const { kind, label } = classifyLink(url)
      out.push({ label, url, kind })
      if (out.length >= 6) break
    }
    return out
  } catch {
    return []
  }
}
