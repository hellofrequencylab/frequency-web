import { notFound, redirect } from 'next/navigation'
import { Suspense } from 'react'
import { DashboardTemplate } from '@/components/templates'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { isSpaceTeamMember } from '@/lib/spaces/operated'
import { listSpaceSharedContacts } from '@/app/(main)/connections/actions'
import { SharedContactsView } from '@/components/spaces/crm/shared-contacts-view'

// SHARED-WITH-SPACE contacts — the team read view for the 'shared' network-contact tier (ADR-778). A
// member can share a contact's CARD with a Space's team (setVisibility 'shared', gated on operatesSpace);
// this is the surface where that team reads what was shared with them. Registered as the `space.shared`
// menu row (lib/admin/modules/space-modules.ts, per docs/MENU-CONTRACT.md), a CRM sub-view beside Lead
// capture. Composes <DashboardTemplate>; the rail falls through to 'global' in page-chrome (like the CRM
// board + Lead capture). Voice per CONTENT-VOICE §10 (plain, no em dashes).
//
// GATE (broader than the CRM board on purpose): the READ audience for the 'shared' tier is ANY member of
// the Space's TEAM (owner or an active member of any role), NOT just operators — so this page gates on
// isSpaceTeamMember, not on the CRM entitlement/role. A non-team-member is redirected to the Space (they
// see nothing). We still 404 a missing / not-visible Space (the no-existence-leak rule). Defense in depth:
// listSpaceSharedContacts RE-CHECKS isSpaceTeamMember server-side and returns [] to a non-member, and the
// card projection never includes the owner's private notes or tags.

export const metadata = { title: 'Shared with team' }

export default async function SpaceSharedContactsPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const caller = await getCallerProfile()
  const viewerProfileId = caller?.id ?? null

  // Resolve the Space, failing closed on a missing / not-visible Space (no existence leak).
  const space = await getVisibleSpaceBySlug(slug, viewerProfileId)
  if (!space) notFound()

  // Server-side gate: only a member of THIS Space's team may read the cards shared with it. Scoped to the
  // current Space slug, so a member who teams multiple Spaces only sees the one they are viewing. A
  // non-team-member is sent to the Space profile rather than shown an empty operator surface.
  const onTeam = viewerProfileId ? await isSpaceTeamMember(viewerProfileId, space.id) : false
  if (!onTeam) redirect(`/spaces/${space.slug}`)

  const brandName = space.brandName ?? space.name

  return (
    <DashboardTemplate
      eyebrow={brandName}
      title="Shared with team"
      description="Contact cards your members chose to share with the team. You see the card only, never a member's private notes or tags."
      back={{ href: `/spaces/${space.slug}/crm`, label: 'CRM' }}
      width="wide"
    >
      <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-surface-elevated/50" />}>
        <SharedSection spaceId={space.id} />
      </Suspense>
    </DashboardTemplate>
  )
}

async function SharedSection({ spaceId }: { spaceId: string }) {
  // The reader re-checks team membership itself (getCallerProfile + isSpaceTeamMember) and returns the
  // card-only projection, so nothing private is ever fetched here.
  const contacts = await listSpaceSharedContacts(spaceId)
  return <SharedContactsView contacts={contacts} />
}
