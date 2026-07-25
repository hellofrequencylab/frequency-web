// Space-scoped Conversation Workspace (ADR-812) — the per-tenant ticketed inbox. Every Business Space
// gets the SAME technology as the platform operator inbox: support/outreach/replies as one assignable,
// status-tracked thread, scoped to THIS space's conversations. Gated by space-manage access (a platform
// staffer gets a read-only preview); the thread reader is tenancy-checked so a manager can only open their
// own space's threads. Reuses <ConversationWorkspace> with the space-bound reply/triage actions injected.

import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { Inbox, MailQuestion, Users } from 'lucide-react'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { resolveSpaceManageAccess } from '@/lib/spaces/entitlements'
import { isConsoleSpaceType } from '@/lib/spaces/types'
import { DashboardTemplate } from '@/components/templates'
import { StatCard } from '@/components/ui/stat-card'
import { StaffPreviewBanner } from '@/components/spaces/staff-preview-banner'
import {
  listWorkspaceConversations,
  getWorkspaceThread,
  listSpaceAssignableAgents,
  type ConversationScope,
} from '@/lib/comms/workspace'
import { ConversationWorkspace } from '@/components/admin/crm/conversation-workspace'
import { SpaceConversationCompose } from '@/components/spaces/crm/space-conversation-compose'
import {
  sendSpaceConversationReplyAction,
  setSpaceConversationTriageAction,
  startSpaceConversationAction,
} from '../conversations-actions'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Conversations',
  description: 'Every ticketed conversation with your members and leads, in one place.',
  robots: { index: false, follow: false },
}

const SCOPES: ConversationScope[] = ['mine', 'unassigned', 'all']

export default async function SpaceConversationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ scope?: string; status?: string; id?: string }>
}) {
  const { slug } = await params
  const caller = await getCallerProfile()
  const viewerProfileId = caller?.id ?? null

  const space = await getVisibleSpaceBySlug(slug, viewerProfileId)
  if (!space) notFound()
  const { canManage, staffViewing } = await resolveSpaceManageAccess(space, viewerProfileId, caller?.webRole)
  if (!canManage && !staffViewing) notFound()
  if (!isConsoleSpaceType(space.type)) notFound()

  const sp = await searchParams
  const scope: ConversationScope = SCOPES.includes(sp.scope as ConversationScope) ? (sp.scope as ConversationScope) : 'all'
  const status = sp.status || undefined
  const viewer = viewerProfileId ?? ''

  const [rows, agents, rawThread] = await Promise.all([
    listWorkspaceConversations({ scope, viewerProfileId: viewer, spaceId: space.id, status, limit: 300 }),
    listSpaceAssignableAgents(space.id, space.ownerProfileId ?? null),
    sp.id ? getWorkspaceThread(sp.id) : Promise.resolve(null),
  ])
  // TENANCY: the reader reads through the service-role client, so scope it to this space's own threads.
  const thread = rawThread && rawThread.spaceId === space.id ? rawThread : null
  const awaiting = rows.filter((r) => r.awaitingReply).length

  return (
    <DashboardTemplate
      eyebrow="Resonance"
      title="Conversations"
      width="wide"
      adminBar={false}
      description="Every ticketed conversation with your members and leads. Reply as your space, assign it to a teammate, and their reply comes back to the same thread."
      back={{ href: `/spaces/${space.slug}/manage?section=resonance`, label: 'Back to Resonance' }}
      actions={canManage ? <SpaceConversationCompose startAction={startSpaceConversationAction.bind(null, space.slug)} /> : undefined}
      banner={staffViewing ? <StaffPreviewBanner spaceName={space.brandName ?? space.name} /> : undefined}
      stats={
        <>
          <StatCard label="Conversations" value={rows.length} icon={Inbox} bordered />
          <StatCard label="Awaiting reply" value={awaiting} icon={MailQuestion} bordered />
          <StatCard label="Your team" value={agents.length} icon={Users} bordered />
        </>
      }
    >
      <ConversationWorkspace
        rows={rows}
        thread={thread}
        agents={agents}
        scope={scope}
        status={status}
        basePath={`/spaces/${space.slug}/crm/conversations`}
        readOnly={!canManage}
        actions={{
          sendAction: sendSpaceConversationReplyAction.bind(null, space.slug),
          triageAction: setSpaceConversationTriageAction.bind(null, space.slug),
        }}
      />
    </DashboardTemplate>
  )
}
