import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getPublishedSpotlight } from '@/lib/spotlight/data'
import { getCallerProfile, isPlatformStaff } from '@/lib/auth'
import { PageHeading } from '@/components/templates'
import { toMemberEntity } from '@/lib/entity-blocks/member-adapter'
import { MemberProfileModules } from '@/components/widgets/member-profile/member-profile-modules'

// STAFF/SELF-PREVIEW: the module-engine (unified block) render of a member's Spotlight, shown BESIDE the
// live Puck render so the member or platform staff can validate the non-Puck render without changing
// anything live. Nothing here touches the public Spotlight: /spotlight/[handle] still renders through
// Puck (components/spotlight/puck-render.tsx). Mirrors the space preview
// (app/(main)/spaces/[slug]/(profile)/profile-preview/page.tsx).
//
// GATE: the member THEMSELVES (the owner gate the Spotlight editor uses) or platform staff. notFound
// (not a redirect) for everyone else, so the route never leaks existence. Reads only the PUBLISHED
// Spotlight (getPublishedSpotlight, the one reader) — an unpublished page 404s here even for its owner.

export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  title: 'Spotlight preview (block-picker)',
  robots: { index: false, follow: false },
}

export default async function MemberProfilePreviewPage({
  params,
}: {
  params: Promise<{ handle: string }>
}) {
  const { handle } = await params

  // Resolve the member's published Spotlight, failing closed on a missing / unpublished one.
  const data = await getPublishedSpotlight(handle)
  if (!data) notFound()

  // Only the member themselves or a platform staffer may preview; everyone else 404s (route stays hidden).
  const caller = await getCallerProfile()
  const isSelf = caller?.id != null && caller.id === data.profile.id
  const staff = await isPlatformStaff()
  if (!isSelf && !staff) notFound()

  const identity = toMemberEntity(data)

  return (
    <div className="space-y-8">
      <PageHeading
        title="Spotlight preview (block-picker)"
        description={`A module-rendered view of ${identity.displayName}, off Puck. Staff and self preview only, nothing live changes.`}
        adminBar={false}
      />
      <MemberProfileModules member={data} />
    </div>
  )
}
