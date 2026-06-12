// The canonical destinations our QR codes encode. Pure string builders — no
// `qrcode` import here, so this stays trivially unit-testable and safe to use on
// both the server and (if ever needed) the client.
//
// Every code is DYNAMIC by construction: the printed image only ever encodes a
// stable Frequency URL (a node id, a member handle). What that URL *does* —
// reward, offer, validity window, retire — is edited in the backend with no
// reprint. That indirection is the whole point of routing scans through us.

import { SITE_URL } from '@/lib/site'

/** Absolute URL a physical-node QR/NFC encodes — the capture landing page
 *  (`app/(main)/n/[nodeId]`) that runs the verified earn pipeline. When the node
 *  requires a signed payload, the secret rides along as `?s=` so a forged URL
 *  (from just the node id) can't claim it — verifyCapture checks the match. */
export function nodeUrl(nodeId: string, secret?: string | null): string {
  const base = `${SITE_URL}/n/${nodeId}`
  return secret ? `${base}?s=${encodeURIComponent(secret)}` : base
}

/** Absolute URL a member's personal "connect" code points at — their public
 *  profile (`app/(main)/people/[handle]`), where a scanner can friend/message.
 *  Still used for the in-app profile link; the SCANNABLE connect code now lands on
 *  the splash instead (see personalCodeTargetUrl). */
export function connectUrl(handle: string): string {
  return `${SITE_URL}/people/${handle}`
}

/** Where a member's personal "connect" QR now lands a scanner: the home splash —
 *  the front door to sign up for the beta. The scan still routes through the `/q`
 *  resolver first, which logs it and drops the owner's `fq_ref` referral cookie, so
 *  the owner is credited (and earns zaps) if the scanner signs up. This is the ONE
 *  place to retarget every personal code in the future (e.g. a seasonal campaign
 *  landing) with no reprint — the printed image encodes `/q/<slug>`, not this URL. */
export function personalCodeTargetUrl(): string {
  return `${SITE_URL}/`
}

/** Absolute short link a managed dynamic code encodes — the retargetable resolver
 *  (`app/q/[slug]`) that logs the scan then redirects to the code's destination. */
export function shortLinkUrl(slug: string): string {
  return `${SITE_URL}/q/${slug}`
}

/** True when `text` is one of our own links (absolute apex URL or a root-relative
 *  path). The QR endpoint refuses anything else, so it can't be used as an open
 *  generator for arbitrary third-party content. */
export function isSiteLink(text: string): boolean {
  return text.startsWith('/') || text.startsWith(`${SITE_URL}/`)
}

/** Resolve a same-site `text` (absolute or root-relative) to an absolute URL. */
export function toAbsoluteSiteUrl(text: string): string {
  return text.startsWith('/') ? `${SITE_URL}${text}` : text
}

/** The scan medium a code's URL is tagged with. 'qr' is the default (a printed
 *  code) and carries no marker; 'nfc' appends `?m=nfc` so the `/q` resolver can
 *  attribute the tap. Used when writing a tag — the same code, channel-stamped. */
export type ScanMedium = 'qr' | 'nfc'

/** Stamp a code URL with its scan medium for attribution. NFC tags encode the
 *  result so a tap records `medium='nfc'`; QR returns the URL unchanged. */
export function withMedium(url: string, medium: ScanMedium): string {
  if (medium !== 'nfc') return url
  return `${url}${url.includes('?') ? '&' : '?'}m=nfc`
}
