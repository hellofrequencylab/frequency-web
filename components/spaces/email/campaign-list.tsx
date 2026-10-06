import { Mail } from 'lucide-react'
import { listSpaceCampaigns, type CampaignStatus } from '@/lib/spaces/campaigns'
import { EmptyState } from '@/components/ui/empty-state'
import { StatusChip, type StatusTone } from '@/components/admin/status'
import { LocalTime } from './local-time'

// CAMPAIGN LIST (ENTITY-SPACES-BUILD §C Phase 3). A self-fetching server component for the Space email
// surface: this Space's campaigns (subject + status + audience size + when), gated on canEditProfile
// inside listSpaceCampaigns (a janitor staff preview also reads the real list). Mirrors the global
// campaigns-table tone (status -> the one StatusChip vocabulary) but composes KIT primitives on a
// Focus surface rather than the operator DataTable. No em/en dashes (CONTENT-VOICE §10).

// Map a campaign status to the shared StatusChip tone (mirrors campaigns-table.tsx).
function statusTone(status: CampaignStatus): StatusTone {
  if (status === 'sent') return 'success'
  if (status === 'scheduled' || status === 'sending') return 'info'
  if (status === 'failed') return 'danger'
  return 'neutral'
}

function statusLabel(status: CampaignStatus): string {
  if (status === 'sent') return 'Sent'
  if (status === 'scheduled') return 'Scheduled'
  if (status === 'sending') return 'Sending'
  if (status === 'failed') return 'Failed'
  return 'Draft'
}

export async function CampaignList({ spaceId }: { spaceId: string }) {
  const campaigns = await listSpaceCampaigns(spaceId)

  if (campaigns.length === 0) {
    return (
      <EmptyState
        icon={Mail}
        title="No campaigns yet."
        description="Write one above. It shows here once you send or schedule it."
      />
    )
  }

  return (
    <ul className="divide-y divide-border rounded-card border border-border bg-surface lift-1">
      {campaigns.map((c) => {
        // Times render in the VIEWER's zone (LocalTime, SCAN-702): a server-side format would show
        // UTC and hide a scheduled time that drifted from what the owner picked.
        const when =
          c.status === 'sent' && c.sentAt ? (
            <>Sent <LocalTime iso={c.sentAt} /></>
          ) : c.status === 'scheduled' && c.scheduledFor ? (
            <>Sends <LocalTime iso={c.scheduledFor} /></>
          ) : c.status === 'sending' ? (
            'Going out now'
          ) : c.status === 'failed' ? (
            `Didn't send: ${c.sendError ?? 'Unknown error'}`
          ) : c.createdAt ? (
            <>Drafted <LocalTime iso={c.createdAt} /></>
          ) : (
            'Draft'
          )
        return (
          <li key={c.id} className="flex items-center justify-between gap-4 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-body-sm font-semibold text-text">
                {c.subject || 'Untitled'}
              </p>
              <p className="text-meta text-muted">
                {when}
                {c.status === 'sent' && (
                  <>
                    {' '}
                    &middot; {c.recipientCount.toLocaleString()}{' '}
                    {c.recipientCount === 1 ? 'recipient' : 'recipients'}
                  </>
                )}
              </p>
            </div>
            <StatusChip tone={statusTone(c.status)}>{statusLabel(c.status)}</StatusChip>
          </li>
        )
      })}
    </ul>
  )
}
