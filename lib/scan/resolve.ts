// Resolving scanned QR text into an in-app destination (ADR-235). Pure and
// unit-tested: the scanner only ever NAVIGATES same-site — every Frequency code
// is a URL on our own domain (/q/<slug> resolver, /n/<nodeId> node claim,
// /people/<handle> connect codes), and those existing flows do all paying and
// cookie-setting. A foreign QR is reported, never followed.

import { safeNextPath } from '@/lib/auth/safe-next'

type ScanResolution =
  | { ok: true; path: string }
  | { ok: false; reason: 'foreign'; host: string }
  | { ok: false; reason: 'unreadable' }

/** Hosts that count as "ours" besides the current origin (scans of printed
 *  production codes while on a preview deploy still resolve). */
const HOME_HOSTS = new Set(['frequencylocal.com', 'www.frequencylocal.com'])

export function resolveScannedText(raw: string, currentHost: string): ScanResolution {
  const text = (raw ?? '').trim()
  if (!text) return { ok: false, reason: 'unreadable' }

  // Bare same-site path (some NFC tags encode just the path). One rule for "same-origin path"
  // (lib/auth/safe-next.ts): a browser reads `/\host` as `//host`, so a tag holding `/\evil.com`
  // passed the old starts-with check and left the site with no foreign-host warning (SEC-041).
  if (text.startsWith('/')) {
    const path = safeNextPath(text)
    return path ? { ok: true, path } : { ok: false, reason: 'unreadable' }
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
