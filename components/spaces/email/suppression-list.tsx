import { MailX } from 'lucide-react'
import { listSpaceSuppressions } from '@/lib/spaces/email-analytics'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'

// PER-SPACE SUPPRESSION LIST (ENTITY-SPACES-BUILD §C Phase 3). A self-fetching Server Component the
// email surface embeds: the people this Space may no longer email (unsubscribed, bounced, or marked
// as a complaint), newest first. Reads listSpaceSuppressions, which is gated on canEditProfile and
// fail-safe ([]), and which unions this Space's own opt-outs with the platform-wide (global) ones,
// so an owner sees everyone they must respect, not just their own list.
//
// PRIVACY-AWARE: these are people who opted out. The copy frames the list as a boundary to honor,
// never a re-engagement target. We show the address, the reason, and when, and label a global
// opt-out so an owner understands it came from outside their Space.
//
// COMPOSED, NOT AUTHORED: SectionHeader + EmptyState + ui tokens only. No hand-rolled header, no
// hex, no text-[Npx]. All copy obeys CONTENT-VOICE: plain, no em/en dashes, skeptic-test clean.

const REASON_LABEL: Record<string, string> = {
  unsubscribe: 'Unsubscribed',
  unsubscribed: 'Unsubscribed',
  complaint: 'Marked as spam',
  complained: 'Marked as spam',
  bounce: 'Bounced',
  bounced: 'Bounced',
  manual: 'Removed by you',
}

/** A human label for a suppression reason. An unknown reason is title-cased as-is; a null reason
 *  falls back to a neutral "Opted out" (we never guess why). */
function reasonLabel(reason: string | null): string {
  if (!reason) return 'Opted out'
  const known = REASON_LABEL[reason.toLowerCase()]
  if (known) return known
  return reason.charAt(0).toUpperCase() + reason.slice(1)
}

export async function SuppressionList({ spaceId, limit }: { spaceId: string; limit?: number }) {
  const suppressions = await listSpaceSuppressions(spaceId, limit)

  if (suppressions.length === 0) {
    return (
      <section aria-labelledby="space-email-suppressions">
        <SectionHeader title="Opted out" />
        <EmptyState
          icon={MailX}
          title="No one has opted out."
          description="When someone unsubscribes or an address bounces, it shows here and we stop emailing them."
        />
      </section>
    )
  }

  const dateFmt = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

  return (
    <section aria-labelledby="space-email-suppressions">
      <SectionHeader title="Opted out" count={suppressions.length} />
      <p className="mb-3 text-xs text-muted">
        These people asked not to hear from you, or their address bounced. We keep them off every
        send. Global opt-outs apply across all of Frequency.
      </p>
      <ul className="divide-y divide-border rounded-2xl border border-border bg-surface shadow-sm">
        {suppressions.map((s) => (
          <li key={s.id} className="flex items-center justify-between gap-4 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-text">{s.email}</p>
              <p className="text-xs text-muted">
                {reasonLabel(s.reason)}
                {s.isGlobal ? ' · Global' : ''} · {dateFmt.format(new Date(s.createdAt))}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
