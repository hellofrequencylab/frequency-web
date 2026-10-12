import { normalizeHost } from '@/lib/sites/host'

// PER-SPACE MEMBERSHIP IDENTITY ON A WEBSITE (LIVE-699). A Space website is served anonymously and cached
// (lib/core/anonymous-render.ts), on its own host, so the page itself never knows who is reading it. The
// header carries a small client island instead (components/sites/site-member-badge.tsx) that asks
// Frequency, with the reader's own session, for the reader's membership in THIS Space alone
// (app/api/sites/[slug]/membership). The answer is one tier name: nothing about any other Space travels.
//
// The browser only sends Frequency's session on that call from a same-site page, which the free
// `<slug>.frequencylocal.com` address is; on a custom domain the call answers "no membership" and the
// header stays as it was. The two pure decisions below are what the route and the badge read.

export interface SiteMembershipView {
  tierName: string
  status: 'active' | 'waitlist'
}

/** The line the header shows a signed-in reader, or null when there is nothing to show. */
export function siteMembershipLine(membership: SiteMembershipView | null | undefined): string | null {
  if (!membership) return null
  const tier = membership.tierName.trim()
  if (!tier) return null
  return membership.status === 'waitlist' ? `Waitlist · ${tier}` : `Member · ${tier}`
}

/** The one origin the membership route may answer with credentials: the request's Origin, only when it is
 *  https on one of the Space's own website hosts. Anything else gets no CORS grant at all. */
export function siteMemberOrigin(origin: string | null | undefined, siteHosts: (string | null | undefined)[]): string | null {
  if (!origin) return null
  let url: URL
  try { url = new URL(origin) } catch { return null }
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null
  const host = normalizeHost(url.host)
  if (!host) return null
  return siteHosts.some((h) => h && normalizeHost(h) === host) ? `https://${host}` : null
}
