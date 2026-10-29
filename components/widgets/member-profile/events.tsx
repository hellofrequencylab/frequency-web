import Link from 'next/link'
import { CalendarDays } from 'lucide-react'
import type { MemberBlockProps } from '@/lib/entity-blocks/member-adapter'
import { MemberSection } from './section'

// EVENTS I HOST — the member's next public events (SPL-03). DATA block: the rows come from the Spotlight
// reader's own upcoming-events read (public, published, not cancelled, soonest first), so there is no new
// query and nothing a member can fake. Each row links to the event page. FAIL-SAFE: with nothing upcoming the
// block renders nothing and `empty:hidden` collapses the section.
function dayLabel(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
}

export function MemberEventsBlock({ data }: MemberBlockProps) {
  const events = data.hostedEvents
  if (events.length === 0) return null
  return (
    <MemberSection anchor="events">
      <h2 className="text-lead font-semibold text-text">Coming up</h2>
      <ul className="mt-3 flex flex-col gap-2">
        {events.map((e) => (
          <li key={e.id}>
            <Link
              href={`/events/${e.slug}`}
              className="flex items-center gap-3 rounded-card border border-border bg-surface px-4 py-3 text-text hover:border-brand"
            >
              <CalendarDays aria-hidden className="size-5 shrink-0 text-muted" />
              <span className="min-w-0 flex-1 truncate font-medium">{e.title}</span>
              <span className="shrink-0 text-meta text-muted">{dayLabel(e.starts_at)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </MemberSection>
  )
}
