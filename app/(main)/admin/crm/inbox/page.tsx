// Resonance CRM — 2-way Inbox (ADR-629). Contact conversations built from the ONE contact_interactions
// timeline (inbound + outbound), grouped by contact, newest first, with a reply composer that enqueues
// an outbound email through the gated send path (sendInboxReplyAction → resolveSendGate → enqueueEmail).
// Staff-gated like its CRM siblings; the threads are gathered server-side (lib/crm/inbox.ts) and handed
// to a thin client workspace. Uses AdminTemplate (the /admin shell) with a conversation stream body.

import { Inbox, MessageSquare, MailQuestion } from 'lucide-react'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { StatCard } from '@/components/ui/stat-card'
import { requireAdmin } from '@/lib/admin/guard'
import { loadRootSpaceId } from '@/lib/spaces/store'
import { listInboxThreads } from '@/lib/crm/inbox'
import { InboxWorkspace } from '@/components/admin/crm/inbox-workspace'

export const dynamic = 'force-dynamic'

export default async function CrmInboxPage() {
  await requireAdmin('janitor', { staff: 'marketing' })
  // Platform touches carry a null space_id, so the platform inbox reads space-agnostic (omit spaceId).
  await loadRootSpaceId() // warm the cache; the platform inbox is space-agnostic by design.
  const threads = await listInboxThreads({ limit: 400 })
  const awaiting = threads.filter((t) => t.awaitingReply).length
  const messageCount = threads.reduce((n, t) => n + t.count, 0)

  return (
    <AdminTemplate
      eyebrow="CRM"
      title="Inbox"
      icon={Inbox}
      width="wide"
      description="Every contact conversation in one place. Read the thread, then reply. Replies go out through the consent gate."
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard label="Conversations" value={threads.length} icon={MessageSquare} bordered />
        <StatCard label="Awaiting reply" value={awaiting} icon={MailQuestion} bordered />
        <StatCard label="Messages" value={messageCount} icon={Inbox} bordered />
      </div>

      <AdminSection>
        <InboxWorkspace threads={threads} />
      </AdminSection>
    </AdminTemplate>
  )
}
