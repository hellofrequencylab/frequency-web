import { NextResponse } from 'next/server'
import { appOrigin, isShortLinkHost } from '@/lib/sites/host'
import { publicShareUrl } from '@/lib/qr/public-url'
import { isPreviewFetcher, isShareSlug, shortenablePath } from '@/lib/share/short-link'
import { openShareLink } from '@/lib/share/short-link-store'

export const dynamic = 'force-dynamic'

// /s/<slug>: a short share link (LIVE-1960). It counts the open (a person, not a link-preview fetcher),
// then sends the visitor to the stored PUBLIC page with the sharer's ?ref attached, so the proxy's
// referral cookie and onboarding credit run exactly as they do for a long share link. The destination is
// re-checked on every open, and the redirect is always built on this origin, so a bad row cannot send
// anyone off-site or to a private page. No visitor data is read or stored.
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  // On freq.ie the visitor always lands on Frequency's own origin, never on the short host.
  const requestUrl = new URL(request.url)
  const origin = isShortLinkHost(request.headers.get('host')) ? appOrigin() : requestUrl.origin
  const gone = NextResponse.redirect(new URL('/code-unavailable', origin))
  if (!isShareSlug(slug)) return gone

  const link = await openShareLink(slug, !isPreviewFetcher(request.headers.get('user-agent')))
  const path = link ? shortenablePath(link.path) : null
  if (!link || !path) return gone

  const { url } = publicShareUrl(origin, path, { ref: link.sharerProfileId })
  return NextResponse.redirect(url, 307)
}
