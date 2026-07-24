// The Leader Inbox (ADR-812 Phases 3b + 4) — a community leader's own conversation workspace. Reuses the
// operator <ConversationWorkspace> scoped to the threads the leader OWNS or is assigned (never the
// platform queue), with leader-gated reply + triage actions injected. The header carries "Message my
// group," which fans a single message out to every member below the leader, as themselves, into one
// tracked conversation each. Behind the host+ /lead gate (inherited from the layout, re-asserted here).

import { Inbox, MailQuestion, Users } from 'lucide-react'
import { DashboardTemplate } from '@/components/templates'
import { StatCard } from '@/components/ui/stat-card'
import { requireLeadFloor } from '@/lib/admin/guard'
import {
  listWorkspaceConversations,
  getWorkspaceThread,
  type ConversationScope,
} from '@/lib/comms/workspace'
import { leaderDownlineReach } from '@/lib/comms/leader-send'
import { ConversationWorkspace } from '@/components/admin/crm/conversation-workspace'
import { LeaderBroadcast } from '@/components/lead/leader-broadcast'
import { sendLeaderReply, setLeaderTriage } from './actions'

export const dynamic = 'force-dynamic'

export default async function LeaderInboxPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; id?: string }>
}) {
  const { profileId } = await requireLeadFloor()
  const sp = await searchParams
  const status = sp.status || undefined
  const scope: ConversationScope = 'all'

  const [rows, rawThread, reach] = await Promise.all([
    listWorkspaceConversations({ scope, viewerProfileId: profileId, ownedOrAssignedTo: profileId, status, limit: 300 }),
    sp.id ? getWorkspaceThread(sp.id) : Promise.resolve(null),
    leaderDownlineReach(profileId),
  ])

  // AUTHORIZATION: getWorkspaceThread reads through the service-role client (no RLS) and takes the id
  // straight from the URL, so it can resolve ANY conversation. The list is already scoped to the leader's
  // own threads; scope the reader the same way (owner or assignee) so a leader can never open someone
  // else's thread — or its internal notes — by guessing a ?id=. Operators (/admin) are staff-authorized to
  // see every thread, so only the leader surface needs this gate.
  const thread =
    rawThread && (rawThread.ownerProfileId === profileId || rawThread.assignedTo === profileId) ? rawThread : null

  const awaiting = rows.filter((r) => r.awaitingReply).length

  return (
    <DashboardTemplate
      eyebrow="Leadership"
      title="Inbox"
      description="Every message between you and your group, in one place. Write to your whole group, or reply to one person. Their reply comes back here."
      back={{ href: '/lead', label: 'Leadership' }}
      actions={<LeaderBroadcast reach={reach} />}
      stats={
        <>
          <StatCard label="Conversations" value={rows.length} icon={Inbox} bordered />
          <StatCard label="Awaiting reply" value={awaiting} icon={MailQuestion} bordered />
          <StatCard label="Your group" value={reach} icon={Users} bordered />
        </>
      }
    >
      <ConversationWorkspace
        rows={rows}
        thread={thread}
        agents={[{ id: profileId, name: 'Me' }]}
        scope={scope}
        status={status}
        basePath="/lead/inbox"
        showScopes={false}
        actions={{ sendAction: sendLeaderReply, triageAction: setLeaderTriage }}
      />
    </DashboardTemplate>
  )
}
