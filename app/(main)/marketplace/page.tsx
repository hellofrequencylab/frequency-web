import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { COMMERCE_LAST_COOKIE, commerceSurfaceHref, parseCommerceSurface } from '@/lib/marketplace/last-visited'

// /marketplace — the member commerce umbrella's landing door (ADR-868). The left rail's
// single "Marketplace" row points here; this server page reads the `commerce_last` cookie
// (written client-side by CommerceLastVisited on the Classifieds and Market surfaces),
// validates it against the whitelist, and redirects to the member's last commerce surface,
// defaulting to Classifieds for a first visit or an unknown value.
//
// This is deliberately a temporary (307) redirect: the destination changes per member and
// per visit, so it must never be cached as permanent. The PERMANENT (308) redirects for the
// retired /marketplace/housing and /marketplace/events paths live in next.config.ts and run
// before this page, so the two mechanisms coexist: fixed old paths 308 to their new homes,
// while the /marketplace index stays a live, cookie-driven door.
export const dynamic = 'force-dynamic'

export default async function MarketplaceHubRedirect() {
  const jar = await cookies()
  const surface = parseCommerceSurface(jar.get(COMMERCE_LAST_COOKIE)?.value)
  redirect(commerceSurfaceHref(surface))
}
