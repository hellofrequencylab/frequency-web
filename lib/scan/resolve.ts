// Resolving scanned QR text into an in-app destination (ADR-235). Pure and
// unit-tested: the scanner only ever NAVIGATES same-site — every Frequency code
// is a URL on our own domain (/q/<slug> resolver, /n/<nodeId> node claim,
// /people/<handle> connect codes), and those existing flows do all paying and
// cookie-setting. A foreign QR is reported, never followed.

export type ScanResolution =
  | { ok: true; path: string }
  | { ok: false; reason: 'foreign'; host: string }
  | { ok: false; reason: 'unreadable' }

/** Hosts that count as "ours" besides the current origin (scans of printed
 *  production codes while on a preview deploy still resolve). */
const HOME_HOSTS = new Set(['frequencylocal.com', 'www.frequencylocal.com'])

export function resolveScannedText(raw: string, currentHost: string): ScanResolution {
  const text = (raw ?? '').trim()
  if (!text) return { ok: false, reason: 'unreadable' }

  // Bare same-site path (some NFC tags encode just the path).
  if (text.startsWith('/') && !text.startsWith('//')) {
    return { ok: true, path: text }
  }

  let url: URL
  try {
    url = new URL(text)
  } catch {
    return { ok: false, reason: 'unreadable' }
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { ok: false, reason: 'unreadable' }
  }

  const host = url.host.toLowerCase()
  if (host === currentHost.toLowerCase() || HOME_HOSTS.has(host)) {
    return { ok: true, path: `${url.pathname}${url.search}` }
  }
  return { ok: false, reason: 'foreign', host }
}
