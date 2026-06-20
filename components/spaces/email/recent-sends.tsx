import { Send } from 'lucide-react'
import { recentSpaceSends, type SendStatus } from '@/lib/spaces/email-analytics'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'

// PER-SPACE RECENT SENDS (ENTITY-SPACES-BUILD §C Phase 3). A self-fetching Server Component the email
// surface embeds: the most recent emails this Space sent, newest first, each with its delivery status.
// Reads recentSpaceSends, which is gated on canEditProfile and fail-safe ([]) and filtered on space_id
// (no cross-space leak), so this renders safely on any surface and even before the send ledger exists.
//
// It turns the deliverability numbers into a concrete history: an owner can see WHO each send went to
// and how it landed (delivered / bounced / opted out), so a bad address is legible, not just a count.
//
// COMPOSED, NOT AUTHORED: SectionHeader + EmptyState + ui tokens only. No hand-rolled header, no hex,
// no text-[Npx]. All copy obeys CONTENT-VOICE: plain, no em/en dashes, skeptic-test clean.

/** A human label per send status (CONTENT-VOICE: plain, no jargon). Unknown statuses never reach here
 *  (recentSpaceSends drops them), so the map is total over SendStatus. */
const STATUS_LABEL: Record<SendStatus, string> = {
  queued: 'Queued',
  sent: 'Sent',
  delivered: 'Delivered',
  bounced: 'Bounced',
  complained: 'Marked as spam',
  failed: 'Did not send',
  suppressed: 'Skipped (opted out)',
}

/** The token color for a status pill. Good outcomes read calm, problems read warn/danger, in-flight
 *  reads neutral. Tokens only, never hex. */
function statusTone(status: SendStatus): string {
  switch (status) {
    case 'delivered':
    case 'sent':
      return 'bg-success-bg text-success'
    case 'bounced':
    case 'complained':
    case 'failed':
      return 'bg-danger-bg text-danger'
    default:
      // queued / suppressed: nothing went wrong, but nothing landed in an inbox either.
      return 'bg-surface-elevated text-muted'
  }
}

export async function RecentSends({ spaceId, limit }: { spaceId: string; limit?: number }) {
  const sends = await recentSpaceSends(spaceId, limit)

  if (sends.length === 0) {
    return (
      <section aria-labelledby="space-email-recent-sends">
        <SectionHeader title="Recent sends" />
        <EmptyState
          icon={Send}
          title="No sends yet."
          description="Once you send a campaign, the last emails show here with how each one landed."
        />
      </section>
    )
  }

  const dateFmt = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })

  return (
    <section aria-labelledby="space-email-recent-sends">
      <SectionHeader title="Recent sends" count={sends.length} />
      <ul className="divide-y divide-border rounded-2xl border border-border bg-surface shadow-sm">
        {sends.map((s) => (
          <li key={s.id} className="flex items-center justify-between gap-4 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-text">{s.email || 'Unknown address'}</p>
              <p className="text-xs text-muted">
                {dateFmt.format(new Date(s.createdAt))}
                {s.error ? ` · ${s.error}` : ''}
              </p>
            </div>
            <span
              className={`shrink-0 rounded-full px-2.5 py-0.5 text-2xs font-semibold ${statusTone(s.status)}`}
            >
              {STATUS_LABEL[s.status]}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
