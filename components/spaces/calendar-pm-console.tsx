import { RowCard } from '@/components/cards/row-card'
import { EmptyState } from '@/components/ui/empty-state'
import { SectionHeader } from '@/components/ui/section-header'
import type { CalendarEvent } from '@/lib/calendar/item'
import { operatorListItems, pencilLane, productionLane, type OperatorListItem } from '@/lib/calendar/pm-console'
import { entryStage } from '@/lib/calendar/registry'

// ADMIN PRODUCTION CONSOLE (ADR-1445 C1–C2/C4, ADR-1450, ADR-1454, ADR-1469). The operator
// list on a Space Calendar tab in Admin mode. pencilLane is the Pencil lane. productionLane
// is the Production lane. Planning stays on the mixed board until C3. The month grid is the
// date map (passed as children, usually StaffCalendar so the settings drawer stays).

const PENCIL = entryStage('pencil')
const PRODUCTION = entryStage('production')

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
  const productions = productionLane(events)
  const items = operatorListItems(events).filter(
    (row) => row.stageLabel !== 'Pencil' && row.stageLabel !== 'Production',
  )
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
      <section aria-labelledby="calendar-pm-production" data-production-lane>
        <SectionHeader
          id="calendar-pm-production"
          title={PRODUCTION?.label ?? 'Production'}
          count={productions.length}
        />
        {productions.length === 0 ? (
          <EmptyState
            variant="first-use"
            title="Nothing in Production."
            description="When it is ready to run, it lands here. Publish it when you want people to see it."
          />
        ) : (
          <BoardRows items={productions} showBadge={false} />
        )}
      </section>
      <section aria-labelledby="calendar-pm-board">
        <SectionHeader id="calendar-pm-board" title="The board" count={items.length} />
        {items.length === 0 ? (
          <EmptyState
            variant="first-use"
            title="Nothing on the board yet."
            description="Planning and Cancelled land here. Pencil and Production have their own lanes above."
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
