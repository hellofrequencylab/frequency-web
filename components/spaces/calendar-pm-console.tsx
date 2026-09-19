import { RowCard } from '@/components/cards/row-card'
import { EmptyState } from '@/components/ui/empty-state'
import { SectionHeader } from '@/components/ui/section-header'
import type { CalendarEvent } from '@/lib/calendar/item'
import { operatorListItems } from '@/lib/calendar/pm-console'

// ADMIN PRODUCTION CONSOLE (ADR-1445 C1, ADR-1450). The operator list on a Space Calendar tab
// in Admin mode: what is penciled, in planning, in production, and cancelled. The month grid
// is the date map (passed as children, usually StaffCalendar so the settings drawer stays).
// C2–C4 add first-class lanes; this mount is the list.

export function CalendarPmConsole({
  events,
  children,
}: {
  events: CalendarEvent[]
  children: React.ReactNode
}) {
  const items = operatorListItems(events)
  return (
    <div className="space-y-6" data-calendar-pm-console>
      <section aria-labelledby="calendar-pm-board">
        <SectionHeader id="calendar-pm-board" title="The board" count={items.length} />
        {items.length === 0 ? (
          <EmptyState
            variant="first-use"
            title="Nothing on the board yet."
            description="Pencil it in on the date map below. Planning, Production, and Cancelled land here too."
          />
        ) : (
          <ul className="space-y-2">
            {items.map((item) => (
              <li key={item.key}>
                <RowCard
                  href={item.href ?? undefined}
                  title={item.isCancelled ? <span className="line-through">{item.title}</span> : item.title}
                  badge={
                    <span className="inline-flex items-center rounded-pill bg-surface-elevated px-2 py-0.5 text-meta font-semibold text-muted">
                      {item.stageLabel}
                    </span>
                  }
                  context={item.whenLabel}
                  dimmed={item.isCancelled}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-labelledby="calendar-pm-map">
        <SectionHeader id="calendar-pm-map" title="Date map" />
        {children}
      </section>
    </div>
  )
}
