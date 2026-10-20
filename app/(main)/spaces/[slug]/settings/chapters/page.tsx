import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { buttonClasses } from '@/components/ui/button'
import { isCollectivePlan, isNetworkPlan } from '@/lib/collective/member-spaces'
import { ConsoleFocusTemplate } from '@/components/templates/console-templates'
import { getMyProfileId } from '@/lib/auth'
import { getSpaceBySlug } from '@/lib/spaces/store'
import { formatEventWhen } from '@/lib/time/zone'
import { NETWORK_PLAN, SPACE_PLAN_LABEL, asSpacePlan } from '@/lib/pricing/plans'
import { loadChaptersArea, networkToolsAccess } from '@/lib/collective/network-tools-store'
import { ChaptersEditor } from './editor'

export const metadata = { title: 'Chapters' }

// SCAN-983: the Network parent's Chapters area. The owner and the central admins run it; a chapter leader
// is an admin of their own chapter only and gets a 404 here, the same as any visitor.
export default async function ChaptersPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const [callerId, space] = await Promise.all([getMyProfileId(), getSpaceBySlug(slug)])
  if (!space) notFound()
  const access = await networkToolsAccess(space.id, callerId)
  // The menu row (LIVE-939) opens this page on every plan, so an owner below Network reads what the plan
  // adds, and a Collective owner is sent to its member Spaces. Anyone else still finds nothing here.
  const ownerBelowNetwork = !access && !!callerId && callerId === space.ownerProfileId && !isNetworkPlan(space.plan)
  if (ownerBelowNetwork && isCollectivePlan(space.plan)) redirect(`/spaces/${slug}/settings/billing`)
  if (ownerBelowNetwork) {
    return (
      <ConsoleFocusTemplate title="Chapters" description="Chapters come with the Network plan: three member Spaces to start, up to 25 under one home, chapter leaders, central admins, one membership that works everywhere, and an approval queue before a chapter event goes network-wide."
        back={{ href: `/spaces/${slug}/manage?section=settings`, label: 'Settings' }}>
        <p className="text-body-sm text-muted">Your Space is on the {SPACE_PLAN_LABEL[asSpacePlan(space.plan)]} plan. Pick Network under Plan and billing and your chapters appear here.</p>
        <Link href={`/spaces/${slug}/settings/billing`} className={buttonClasses('primary', 'sm')}>See plans</Link>
      </ConsoleFocusTemplate>
    )
  }
  if (!access) notFound()
  const area = await loadChaptersArea(access.parent)
  return (
    <ConsoleFocusTemplate title="Chapters" description="Your chapters and their leaders, the central admins who help run every chapter, and the chapter events waiting for a yes before they go network-wide."
      back={{ href: `/spaces/${slug}/network`, label: 'Network home' }}>
      <ChaptersEditor parentId={space.id} isOwner={access.isOwner} centralAdminLimit={NETWORK_PLAN.centralAdmins}
        area={{ ...area, pending: area.pending.map(row => ({ ...row, when: formatEventWhen(row.starts_at, row.time_zone) })) }} />
    </ConsoleFocusTemplate>
  )
}
