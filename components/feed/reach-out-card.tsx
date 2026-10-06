import { CalendarClock } from 'lucide-react'
import { RowCard } from '@/components/cards/row-card'
import { listDueReminders } from '@/lib/connections/store'

// The reach-out nudge on the feed (LIVE-663). The contacts page has always listed the follow-ups a
// member set for themselves; a member who never opens it was never reminded. This card shows the
// soonest one (overdue first) with a count of the rest, from the same listDueReminders read the
// contacts page uses, on the kit's RowCard. Nothing due in the next three days, nothing rendered.
//
// Server Component, no client JS: marking a follow-up done stays on the contacts page, where the
// list lives. The feed wraps it in <Suspense> so it never blocks the stream.

const WITHIN_DAYS = 3

function dueLine(iso: string): string {
  const dayMs = 86_400_000
  const startToday = new Date()
  startToday.setHours(0, 0, 0, 0)
  const startDue = new Date(iso)
  startDue.setHours(0, 0, 0, 0)
  const days = Math.round((startDue.getTime() - startToday.getTime()) / dayMs)
  if (days < 0) return days === -1 ? 'You meant to reach out yesterday.' : `You meant to reach out ${-days} days ago.`
  if (days === 0) return 'You meant to reach out today.'
  return days === 1 ? 'You meant to reach out tomorrow.' : `You meant to reach out in ${days} days.`
}

export async function ReachOutCard({ viewerProfileId }: { viewerProfileId: string }) {
  const due = await listDueReminders(viewerProfileId, WITHIN_DAYS)
  const next = due[0]
  if (!next) return null
  const name = next.contactName ?? 'someone'
  const more = due.length - 1

  return (
    <RowCard
      href={`/connections/${next.contactId}`}
      anchor={
        <span className="flex h-9 w-9 items-center justify-center rounded-pill bg-surface-elevated text-primary-strong">
          <CalendarClock className="h-4 w-4" aria-hidden />
        </span>
      }
      title={`Check in with ${name}`}
      context={`${dueLine(next.dueAt)}${next.note ? ` ${next.note}` : ''}`}
      meta={more > 0 ? (more === 1 ? '1 more person to reach out to' : `${more} more people to reach out to`) : undefined}
    />
  )
}
