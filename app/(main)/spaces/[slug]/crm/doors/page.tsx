import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Gauge, Lock } from 'lucide-react'
import { DashboardTemplate } from '@/components/templates'
import { EmptyState } from '@/components/ui/empty-state'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { getSpaceCapabilities, spaceHasEntitlement } from '@/lib/spaces/entitlements'
import { spaceFunctionAccessLive } from '@/lib/spaces/function-access'
import { spaceManageHref } from '@/lib/spaces/types'
import { DoorLinks } from './door-links'

// SPACE CRM — CAPTURE LINKS (CRM-MASTER-BUILD-PLAN §Phase 3). The operator entry point for front doors
// 2 to 5: mint a shareable link for a warm intro, an event check-in, a lead magnet, or a card swap.
// GATE mirrors the CRM board / leads page exactly (plan entitlement + owner/admin/editor via
// spaceFunctionAccessLive('crm')); a viewer without CRM sees a calm locked/upgrade state, not a 404.

export const metadata = { title: 'Capture links' }

export default async function SpaceDoorsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const caller = await getCallerProfile()
  const viewerProfileId = caller?.id ?? null

  const space = await getVisibleSpaceBySlug(slug, viewerProfileId)
  if (!space) notFound()

  const brandName = space.brandName ?? space.name
  const caps = await getSpaceCapabilities(space, viewerProfileId)
  const canUseCrm = await spaceFunctionAccessLive(space, 'crm', caps.role, space.plan)
  const canEdit = caps.canEditProfile
  const hasCrm = spaceHasEntitlement(space, 'crm')

  const boardHref = `/spaces/${space.slug}/crm`

  if (!canUseCrm || !canEdit) {
    return (
      <DashboardTemplate
        eyebrow={brandName}
        title="Capture links"
        description="Make a link for a warm intro, an event, a lead magnet, or a card swap."
        width="default"
      >
        <EmptyState
          icon={hasCrm ? Lock : Gauge}
          variant="permission"
          title={hasCrm ? 'This is a team tool' : 'Do more with your Space CRM'}
          description={
            hasCrm
              ? 'Capture links are for the people who run this space. Ask an admin to bring you onto the team.'
              : 'Capture links come with your Space CRM. They turn a shared link into a lead you can work, with the door they came through kept forever.'
          }
          action={
            <Link
              href={hasCrm ? `/spaces/${space.slug}` : spaceManageHref(space.type, space.slug)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary hover:bg-primary-hover"
            >
              {hasCrm ? `Open ${brandName}` : `Manage ${brandName}`}
            </Link>
          }
        />
      </DashboardTemplate>
    )
  }

  return (
    <DashboardTemplate
      eyebrow={brandName}
      title="Capture links"
      description="One link per door. Share it in an email, a DM, a flyer, or a link in your bio, and whoever opens it lands in your CRM with the door they came through kept forever."
      back={{ href: boardHref, label: 'CRM' }}
      width="default"
    >
      <DoorLinks slug={space.slug} />
    </DashboardTemplate>
  )
}
