import { Hourglass } from 'lucide-react'
import { getEventContext } from '@/lib/events/active-event'
import { createAdminClient } from '@/lib/supabase/admin'

// The movable ATTENDEES block (the `event-attendees` layout module, paired with the People
// editor). A zero-prop self-fetching RSC reading the active event id from the request-scoped
// context (lib/events/active-event.ts). It surfaces the one guest fact the warm-proof pile does
// not: the waitlist. It returns null unless people are actually waiting, so it never duplicates
// the "who's going" card or leaves an empty slot. DAWN tokens only; container-query friendly.

export const EventAttendees = async () => {
  const ctx = getEventContext()
  if (!ctx) return null
  if (ctx.event.is_cancelled) return null

  const admin = createAdminClient()
  const { count } = await admin
    .from('event_rsvps')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', ctx.event.id)
    .eq('status', 'waitlist')

  const waitlist = count ?? 0
  if (waitlist === 0) return null

  return (
    <div className="@container rounded-2xl border border-border bg-surface p-4">
      <h3 className="mb-1.5 flex items-center gap-2 text-sm font-bold text-text">
        <Hourglass className="h-4 w-4 shrink-0 text-primary-strong" />
        Waitlist
      </h3>
      <p className="text-sm text-muted">
        {waitlist === 1 ? 'One person is' : `${waitlist} people are`} on the waitlist. Add your name and
        we&apos;ll hold a spot the moment one opens up.
      </p>
    </div>
  )
}
