// FlowWeb draft links as Frequency short links (LIVE-2257). The pure half: which links FlowWeb may shorten.
// Only a page on this site that already carries utm_source=flowweb qualifies, so the endpoint can never
// become a shortener for someone else's page. The write lives in app/api/webhooks/flowweb-link/route.ts.

import { normalizeUtmValue } from '@/lib/growth/link-compose'

export interface FlowwebLinkRequest {
  /** The full tracked link, kept as the short link's destination. */
  url: string
  /** The qr_codes title the link is filed under in the admin link list. */
  title: string
  /** The first-touch source_tag: the link's utm_campaign. */
  sourceTag: string | null
}

const MAX_URL = 2_000
const MAX_TITLE = 120

/** Checks FlowWeb's `{ url, title }` against this site's origin. PURE. */
export function parseLinkRequest(raw: unknown, siteUrl: string): FlowwebLinkRequest | { error: string } {
  if (!raw || typeof raw !== 'object') return { error: 'the body is not a JSON object' }
  const o = raw as Record<string, unknown>
  const url = typeof o.url === 'string' ? o.url.trim() : ''
  if (!url || url.length > MAX_URL) return { error: 'url is missing or too long' }
  let u: URL
  let site: URL
  try {
    u = new URL(url)
    site = new URL(siteUrl)
  } catch {
    return { error: 'url is not a link' }
  }
  if (u.protocol !== 'https:' || u.host !== site.host) return { error: `url must be a page on ${site.host}` }
  if (u.searchParams.get('utm_source') !== 'flowweb') return { error: 'url must carry utm_source=flowweb' }
  if (u.pathname.startsWith('/q/') || u.pathname.startsWith('/s/')) return { error: 'url is already a short link' }
  const name = typeof o.title === 'string' ? o.title.replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE) : ''
  const campaign = normalizeUtmValue(u.searchParams.get('utm_campaign') ?? '')
  return { url: u.toString(), title: `FlowWeb draft: ${name || 'link'}`, sourceTag: campaign || null }
}
