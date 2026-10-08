import { NextResponse } from 'next/server'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { resolveSpaceManageAccess } from '@/lib/spaces/entitlements'
import { readWebsitePublished } from '@/lib/spaces/website'
import { boundSiteDomain } from '@/lib/sites/site-domain'
import { siteBaseUrl } from '@/lib/sites/seo'
import { appOrigin } from '@/lib/sites/host'
import { signSiteAdminPass, siteAdminView } from '@/lib/sites/site-admin-pass'

// THE WEBSITE ADMIN HANDOFF, FREQUENCY SIDE (LIVE-864). The website's Admin link, and the Leadership page's
// buttons, land here: /spaces/<slug>/manage/leadership/open?to=overview|calendar.
//
// SECURITY: gated like every console page. Signed out goes to sign-in and comes back. The Space must be
// visible to the caller and the caller one of its managers (owner / admin / editor), or platform staff
// previewing read-only; anyone else gets a 404, so the route does not reveal itself. Only then is a pass
// minted, for this Space and its website's own host, and the person sent to that host's /admin/enter.
export const dynamic = 'force-dynamic'

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const url = new URL(req.url)
  const view = siteAdminView(url.searchParams.get('to')) ?? 'overview'
  const origin = appOrigin()
  const caller = await getCallerProfile()
  if (!caller) {
    const back = `/spaces/${encodeURIComponent(slug)}/manage/leadership/open?to=${view}`
    return NextResponse.redirect(new URL(`/sign-in?next=${encodeURIComponent(back)}`, origin), 303)
  }
  const space = await getVisibleSpaceBySlug(slug, caller.id)
  if (!space) return new NextResponse('Not found', { status: 404 })
  const { canManage, staffViewing } = await resolveSpaceManageAccess(space, caller.id, caller.webRole)
  if (!canManage && !staffViewing) return new NextResponse('Not found', { status: 404 })

  const leadership = new URL(`/spaces/${encodeURIComponent(space.slug)}/manage/leadership?site=off`, origin)
  if (!readWebsitePublished(space.preferences)) return NextResponse.redirect(leadership, 303)
  const base = siteBaseUrl(space.slug, await boundSiteDomain(space), origin)
  const host = /^https:\/\/([^/]+)$/.exec(base)?.[1]
  const pass = host ? signSiteAdminPass({ spaceId: space.id, host, profileId: caller.id, staff: !canManage }) : null
  if (!host || !pass) return NextResponse.redirect(leadership, 303)
  const res = NextResponse.redirect(`${base}/admin/enter?to=${view}&pass=${encodeURIComponent(pass)}`, 303)
  res.headers.set('Cache-Control', 'no-store')
  res.headers.set('Referrer-Policy', 'no-referrer')
  return res
}
