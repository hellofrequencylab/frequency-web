import { RowCard } from '@/components/cards/row-card'
import { EmptyState } from '@/components/ui/empty-state'
import { SectionHeader } from '@/components/ui/section-header'
import type { CalendarEvent } from '@/lib/calendar/item'
import { operatorListItems, pencilLane, type OperatorListItem } from '@/lib/calendar/pm-console'
import { entryStage } from '@/lib/calendar/registry'

// ADMIN PRODUCTION CONSOLE (ADR-1445 C1–C2, ADR-1450, ADR-1454). The operator list on a Space
// Calendar tab in Admin mode. pencilLane is the first-class Pencil lane. Planning and Production
// stay on the mixed board until C3 and C4. The month grid is the date map (passed as children,
// usually StaffCalendar so the settings drawer stays).

const PENCIL = entryStage('pencil')

function BoardRows({ items, showBadge }: { items: OperatorListItem[]; showBadge: boolean }) {
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item.key}>
          <RowCard
            href={item.href ?? undefined}
            title={item.isCancelled ? <span className="line-through">{item.title}</span> : item.title}
            badge={
              showBadge ? (
                <span className="inline-flex items-center rounded-pill bg-surface-elevated px-2 py-0.5 text-meta font-semibold text-muted">
                  {item.stageLabel}
                </span>
              ) : undefined
            }
            context={item.whenLabel}
            dimmed={item.isCancelled}
          />
        </li>
      ))}
    </ul>
  )
}

export function CalendarPmConsole({
  events,
  children,
}: {
  events: CalendarEvent[]
  children: React.ReactNode
}) {
  const pencils = pencilLane(events)
  const items = operatorListItems(events).filter((row) => row.stageLabel !== 'Pencil')
  return (
    <div className="space-y-6" data-calendar-pm-console>
      <section aria-labelledby="calendar-pm-pencil" data-pencil-lane>
        <SectionHeader id="calendar-pm-pencil" title={PENCIL?.label ?? 'Pencil'} count={pencils.length} />
        {pencils.length === 0 ? (
          <EmptyState
            variant="first-use"
            title="Nothing penciled in."
            description="Pencil it in on the date map below. Candidate dates stay on the grid for the team."
          />
        ) : (
          <BoardRows items={pencils} showBadge={false} />
        )}
      </section>
      <section aria-labelledby="calendar-pm-board">
        <SectionHeader id="calendar-pm-board" title="The board" count={items.length} />
        {items.length === 0 ? (
          <EmptyState
            variant="first-use"
            title="Nothing on the board yet."
            description="Planning, Production, and Cancelled land here. Pencil has its own lane above."
          />
        ) : (
          <BoardRows items={items} showBadge />
        )}
      </section>
      <section aria-labelledby="calendar-pm-map">
        <SectionHeader id="calendar-pm-map" title="Date map" />
        {children}
      </section>
    </div>
  )
}
