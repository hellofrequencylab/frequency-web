import { getMyProfileId } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { readProfileData } from '@/lib/spaces/profile-data'
import { buildSpaceVcf } from '@/lib/vcard'
import { SITE_URL } from '@/lib/site'

export const dynamic = 'force-dynamic'

// Public "Save contact" vCard for a SPACE (business/org). The business analog of the member vCard
// (app/(main)/people/[handle]/vcard): a Space has no per-member `vcard` opt-in blob, so it always
// offers a card built from what it already stores — brand name + tagline + logo, plus the public
// profile-data contact fields (phone / email / website). No new schema (ADR-246 fields ride the
// Space read + preferences). The Space profile's "Save contact" affordance links here.
//
// TENANCY / PRIVACY: resolved through getVisibleSpaceBySlug (fail-closed on a Private space — a
// non-member visitor gets 404, no existence leak), viewer-aware so an owner/member can still pull
// their own private Space's card.
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const viewerProfileId = await getMyProfileId()
  const space = await getVisibleSpaceBySlug(slug, viewerProfileId)
  if (!space) return new Response('Not found', { status: 404 })

  const contact = readProfileData(space.preferences)
  const vcf = buildSpaceVcf({
    name: space.brandName ?? space.name,
    tagline: space.tagline,
    profileUrl: `${SITE_URL}/spaces/${space.slug}`,
    logoUrl: space.brandLogoUrl,
    phone: contact.phone ?? null,
    email: contact.email ?? null,
    website: contact.website ?? null,
  })
  if (!vcf) return new Response('No contact card', { status: 404 })

  return new Response(vcf, {
    headers: {
      'Content-Type': 'text/vcard; charset=utf-8',
      'Content-Disposition': `attachment; filename="${space.slug}.vcf"`,
      'Cache-Control': 'public, max-age=300',
    },
  })
}
