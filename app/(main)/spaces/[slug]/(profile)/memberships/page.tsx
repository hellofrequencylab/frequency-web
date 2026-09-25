import type { Metadata } from 'next'
import { Suspense } from 'react'
import { notFound, redirect } from 'next/navigation'
import { getMyProfileId } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { setActiveSpace } from '@/lib/spaces/active-space'
import { spaceProfileMetadata } from '@/lib/spaces/profile-metadata'
import { spaceFunctionDef, spaceFunctionEnabled } from '@/lib/spaces/functions'
import { MembershipJoin } from '@/components/spaces/membership-join'
import { ProfileBodySkeleton } from '@/components/spaces/profile-body-skeleton'

// THE MEMBERSHIPS TAB — the Space's own door for someone who wants to join it.
//
// Lives inside the (profile) group so the cover, identity row and tab menu come from the layout.
// This file is only the body, so it never carries a second <h1> (check:headers proves it).
//
// 🔴 IT INVENTS NO SURFACE, AND THAT IS THE WHOLE DESIGN. `MembershipJoin` is the same server
// component `/book` mounts for a membership-Focus Space: the same tier read, the same capacity and
// included-event reads, the same Stripe path, the same already-a-member and waitlist states, and
// the same operator prompt at zero tiers. This route is a DOOR onto it, not a second copy of it.
//
// WHY THE DOOR HAD TO EXIST. `/book` is reachable from exactly one link: the profile's single
// header CTA. That button is operator-overridable (lib/spaces/header-cta.ts), so an operator who
// repoints it at contact / offerings / their own URL silently orphans their own memberships —
// live tiers, a working checkout, and nothing on the Space that leads to them. A tab does not
// depend on what the header button happens to say.
//
// THE `/book` ROUTE IS UNTOUCHED. It still renders the type-branched action surface and still takes
// the header CTA's default. This is an ADDITIONAL door, so nothing that resolves today stops
// resolving.
//
// WHY IT IS INDEXABLE. What a Space charges for membership is exactly the commercial content an
// answer engine wants for "how much is X" or "can I join X", and it exposes nothing a visitor could
// not already read at /book. `/people` noindexes because a roster is not public; a price the
// operator published is.

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  return spaceProfileMetadata(slug, {
    segment: 'memberships',
    label: 'Memberships',
    describe: (brandName) => `Join ${brandName}. See the membership tiers, what each includes, and what it costs.`,
  })
}

export default async function SpaceMembershipsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const viewerProfileId = await getMyProfileId()
  const space = await getVisibleSpaceBySlug(slug, viewerProfileId)
  if (!space) notFound()
  // ROOT never offers it: the platform tenant sells its own plans at /pricing, and this is the same
  // leak class every other tab in this group closes.
  if (space.type === 'root') redirect(`/spaces/${slug}`)
  // The `memberships` function is a hard off for everyone, manager included (see the gate's note):
  // a Space that switched memberships off has said it does not sell them. A missing def reads as
  // ENABLED, the same fail-open the nav and every sibling route use.
  const def = spaceFunctionDef('memberships')
  if (def && !spaceFunctionEnabled(space, def)) redirect(`/spaces/${slug}`)
  setActiveSpace(space)

  return (
    <section className="space-y-6">
      {/* The heading is rendered here rather than by MembershipJoin, at the role the rest of this
          Space uses, with `font-section` resolving the Space THEME's heading face (ADR-578) — the
          same pairing /book's own mount uses, so a themed Space gets its own typography on both. */}
      <h2 className="px-1 font-section text-page-title font-bold text-text">Become a member</h2>
      <Suspense fallback={<ProfileBodySkeleton />}>
        <MembershipJoin spaceId={space.id} slug={space.slug} ownerProfileId={space.ownerProfileId} />
      </Suspense>
    </section>
  )
}
