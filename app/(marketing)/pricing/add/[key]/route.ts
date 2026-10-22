// The add-on buttons on /pricing land here. A visitor has no Space yet and a Space owner has one or several, so
// the right page depends on who is asking; lib/pricing/addon-links.ts decides, this only looks the person up.
import { NextResponse, type NextRequest } from 'next/server'
import { getMyProfileId } from '@/lib/auth'
import { resolveAddOn } from '@/lib/pricing/addon-links'
import { listOperatedSpaces } from '@/lib/spaces/operated'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, ctx: { params: Promise<{ key: string }> }) {
  const { key } = await ctx.params
  const profileId = await getMyProfileId()
  const spaces = profileId ? await listOperatedSpaces(profileId) : []
  const to = resolveAddOn(key, { signedIn: Boolean(profileId), spaceSlugs: spaces.map((s) => s.slug) })
  return NextResponse.redirect(new URL(to ?? '/pricing#addons', req.url))
}
