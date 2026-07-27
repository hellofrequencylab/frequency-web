import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { Suspense } from 'react'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { resolveSpaceManageAccess } from '@/lib/spaces/entitlements'
import { isConsoleSpaceType } from '@/lib/spaces/types'
import { DashboardTemplate } from '@/components/templates'
import { StaffPreviewBanner } from '@/components/spaces/staff-preview-banner'
import { Skeleton } from '@/components/ui/skeleton'
import { SpaceBroadcastSection } from './space-broadcast-section'

// THE SPACE MESSAGE CENTER (ADR-858): one console where a Space messages its people —
// all members, one paid tier, one of its circles, or one event's RSVPs — and says exactly
// where it goes: Email, Direct Message, Dispatch, and (when provisioned) Text. Gated by
// space-manage like the Conversations console next door; a staff PREVIEW sees the surface,
// the action refuses the send. The composer streams behind Suspense so the shell is instant
// (PAGE-FRAMEWORK §5).

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Message center',
  description: 'Message your members, circles, and event guests, on the channels you choose.',
  robots: { index: false, follow: false },
}

export default async function SpaceMessagesPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const caller = await getCallerProfile()
  const viewerProfileId = caller?.id ?? null

  const space = await getVisibleSpaceBySlug(slug, viewerProfileId)
  if (!space) notFound()
  const { canManage, staffViewing } = await resolveSpaceManageAccess(space, viewerProfileId, caller?.webRole)
  if (!canManage && !staffViewing) notFound()
  if (!isConsoleSpaceType(space.type)) notFound()

  const spaceName =
    (space as { brand_name?: string | null }).brand_name ?? (space as { name?: string | null }).name ?? 'Your space'

  return (
    <DashboardTemplate
      title="Message center"
      description="One message, delivered where your people actually are. Pick who it reaches and how it travels."
    >
      {staffViewing && !canManage && <StaffPreviewBanner spaceName={spaceName} />}
      <Suspense
        fallback={
          <div className="space-y-3">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-40 w-full rounded-2xl" />
          </div>
        }
      >
        <SpaceBroadcastSection spaceId={space.id} slug={slug} spaceName={spaceName} />
      </Suspense>
    </DashboardTemplate>
  )
}
