import { notFound } from 'next/navigation'
import { ConsoleFocusTemplate } from '@/components/templates/console-templates'
import { getMyProfileId } from '@/lib/auth'
import { getSpaceBySlug } from '@/lib/spaces/store'
import { formatEventWhen } from '@/lib/time/zone'
import { NETWORK_PLAN } from '@/lib/pricing/plans'
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
