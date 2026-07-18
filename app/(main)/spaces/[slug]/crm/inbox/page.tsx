import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { Inbox, MessageSquare, MailQuestion } from 'lucide-react'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { resolveSpaceManageAccess } from '@/lib/spaces/entitlements'
import { isConsoleSpaceType } from '@/lib/spaces/types'
import { listInboxThreads } from '@/lib/crm/inbox'
import { DashboardTemplate } from '@/components/templates'
import { StatCard } from '@/components/ui/stat-card'
import { StaffPreviewBanner } from '@/components/spaces/staff-preview-banner'
import { InboxWorkspace } from '@/components/admin/crm/inbox-workspace'
import { sendSpaceInboxReplyAction } from '../inbox-actions'

// The SPACE 2-way Inbox (ADR-786): a space-owner's conversation view, the space-scoped sibling of the
// admin Resonance inbox. Threads are read scoped to THIS space's contacts (listInboxThreads({ spaceId }));
// the reply composer routes through the space-gated send action. It is the "communication" half of the
// Resonance category (the CRM being the "people" half). Gated like /manage: a manager or staff preview.

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Inbox',
  description: 'Every contact conversation for your space in one place.',
  robots: { index: false, follow: false },
}

export default async function SpaceInboxPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const caller = await getCallerProfile()
  const viewerProfileId = caller?.id ?? null

  const space = await getVisibleSpaceBySlug(slug, viewerProfileId)
  if (!space) notFound()

  const { canManage, staffViewing } = await resolveSpaceManageAccess(space, viewerProfileId, caller?.webRole)
  if (!canManage && !staffViewing) notFound()
  if (!isConsoleSpaceType(space.type)) notFound()

  // Scope the conversations to THIS space's contacts (the read helper takes a spaceId).
  const threads = await listInboxThreads({ spaceId: space.id, limit: 400 })
  const awaiting = threads.filter((t) => t.awaitingReply).length
  const messageCount = threads.reduce((n, t) => n + t.count, 0)

  return (
    <DashboardTemplate
      eyebrow="Resonance"
      title="Inbox"
      width="wide"
      adminBar={false}
      description="Every contact conversation for your space. Read the thread, then reply. Replies go out through the consent gate."
      back={{ href: `/spaces/${space.slug}/manage?section=resonance`, label: 'Back to Resonance' }}
      banner={staffViewing ? <StaffPreviewBanner spaceName={space.brandName ?? space.name} /> : undefined}
      stats={
        <>
          <StatCard label="Conversations" value={threads.length} icon={MessageSquare} />
          <StatCard label="Awaiting reply" value={awaiting} icon={MailQuestion} />
          <StatCard label="Messages" value={messageCount} icon={Inbox} />
        </>
      }
    >
      {/* The slug is bound server-side, so the client workspace only passes { contactId, subject, body }. */}
      <InboxWorkspace threads={threads} sendReply={sendSpaceInboxReplyAction.bind(null, space.slug)} />
    </DashboardTemplate>
  )
}
