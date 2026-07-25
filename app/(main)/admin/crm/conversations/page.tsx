// The unified Conversation Workspace (ADR-812, Phase 3) — the operator inbox over the comms_* spine:
// support, CRM outreach, leader notes, and inbound replies as ONE assignable, ticketed thread. Reads the
// spine (lib/comms/workspace.ts), gates like its CRM siblings, and composes the AdminTemplate shell with a
// StatCard row + the workspace body. Selection + segments are URL-state (?scope, ?status, ?id).

import { Inbox, MailQuestion, UserCheck } from 'lucide-react'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { StatCard } from '@/components/ui/stat-card'
import { requireAdmin } from '@/lib/admin/guard'
import { isStaff } from '@/lib/core/roles'
import { listAssignableAgents } from '@/lib/support/store'
import {
  listWorkspaceConversations,
  getWorkspaceThread,
  conversationStatusCounts,
  type ConversationScope,
} from '@/lib/comms/workspace'
import { OPEN_CONVERSATION_STATUSES } from '@/lib/comms/labels'
import { ConversationWorkspace } from '@/components/admin/crm/conversation-workspace'
import { SpaceConversationCompose } from '@/components/spaces/crm/space-conversation-compose'
import {
  draftConversationReply,
  summarizeConversation,
  suggestConversationTriage,
  startConversationAction,
} from './actions'

export const dynamic = 'force-dynamic'

const SCOPES: ConversationScope[] = ['mine', 'unassigned', 'all']

export default async function CrmConversationsPage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string; status?: string; id?: string }>
}) {
  const { profileId, webRole } = await requireAdmin('janitor', { staff: 'marketing' })
  const sp = await searchParams
  const scope: ConversationScope = SCOPES.includes(sp.scope as ConversationScope) ? (sp.scope as ConversationScope) : 'all'
  const status = sp.status || undefined

  // F5 SEAL (owner ruling 2026-07-25): tenant Space lanes open ONLY to web_role admin/janitor. A
  // caller admitted via the marketing staff domain sees the platform lane alone; tenant threads
  // stay sealed even by deep link.
  const platformLaneOnly = !isStaff(webRole)

  const filter = { scope, viewerProfileId: profileId, status, limit: 300, platformLaneOnly }
  const [rows, counts, agents, thread] = await Promise.all([
    listWorkspaceConversations(filter),
    conversationStatusCounts({ scope, viewerProfileId: profileId, platformLaneOnly }),
    listAssignableAgents(),
    sp.id ? getWorkspaceThread(sp.id, { platformLaneOnly }) : Promise.resolve(null),
  ])

  const openCount = OPEN_CONVERSATION_STATUSES.reduce((n, s) => n + (counts[s] ?? 0), 0)
  const total = Object.values(counts).reduce((n, c) => n + c, 0)
  const awaiting = rows.filter((r) => r.awaitingReply).length

  return (
    <AdminTemplate
      eyebrow="Resonance"
      title="Conversations"
      icon={Inbox}
      width="wide"
      description="Every ticketed conversation in one place: support, outreach, and replies. Read the thread, assign it, and reply. Their reply comes back to the same thread."
      actions={
        /* New-outreach compose (ADR-821): start a ticketed 1:1 from here. The rich, block-based
           email editor lives one door over — the Message Member button on any member's detail pane
           (the site-wide studio editor, which already lands as a conversation). */
        <SpaceConversationCompose
          startAction={startConversationAction}
          description="Message a member or contact. It opens a tracked thread, and their reply comes back here. For a designed email, use Message Member on their detail pane."
        />
      }
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard label="Open" value={openCount} icon={Inbox} bordered />
        <StatCard label="Awaiting reply" value={awaiting} icon={MailQuestion} bordered />
        <StatCard label="Total" value={total} icon={UserCheck} bordered />
      </div>

      <AdminSection>
        <ConversationWorkspace
          rows={rows}
          thread={thread}
          agents={agents.map((a) => ({ id: a.id, name: a.name }))}
          scope={scope}
          status={status}
          actions={{
            draftAction: draftConversationReply,
            summarizeAction: summarizeConversation,
            aiTriageAction: suggestConversationTriage,
          }}
        />
      </AdminSection>
    </AdminTemplate>
  )
}
