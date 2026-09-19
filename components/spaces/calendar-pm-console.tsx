'use client'

import { RowCard } from '@/components/cards/row-card'
import { EmptyState } from '@/components/ui/empty-state'
import { SectionHeader } from '@/components/ui/section-header'
import type { CalendarEvent } from '@/lib/calendar/item'
import {
  operatorListItems,
  pencilLane,
  planningLane,
  productionLane,
  type OperatorListItem,
} from '@/lib/calendar/pm-console'
import { entryStage } from '@/lib/calendar/registry'

const PENCIL = entryStage('pencil')
const PLANNING = entryStage('planning')
const PRODUCTION = entryStage('production')

function LanePurpose({ children }: { children: string }) {
  return <p data-lane-purpose className="-mt-2 mb-3 text-meta text-muted">{children}</p>
}

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
  const planned = planningLane(events)
  const productions = productionLane(events)
  const items = operatorListItems(events).filter(
    (row) => row.stageLabel !== 'Pencil' && row.stageLabel !== 'Planning' && row.stageLabel !== 'Production',
  )
  return (
    <div className="space-y-6" data-calendar-pm-console>
      <section aria-labelledby="calendar-pm-pencil" data-pencil-lane>
        <SectionHeader id="calendar-pm-pencil" title={PENCIL?.label ?? 'Pencil'} count={pencils.length} />
        <LanePurpose>Tentative dates. Keep one before it moves to Planning.</LanePurpose>
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
      <section aria-labelledby="calendar-pm-planning" data-planning-lane>
        <SectionHeader id="calendar-pm-planning" title={PLANNING?.label ?? 'Planning'} count={planned.length} />
        {planned.length === 0 ? (
          <EmptyState
            variant="first-use"
            title="Nothing in planning."
            description="A date that is happening lands here while the team puts it together."
          />
        ) : (
          <BoardRows items={planned} showBadge={false} />
        )}
      </section>
      <section aria-labelledby="calendar-pm-production" data-production-lane>
        <SectionHeader id="calendar-pm-production" title={PRODUCTION?.label ?? 'Production'} count={productions.length} />
        {productions.length === 0 ? (
          <EmptyState
            variant="first-use"
            title="Nothing in Production."
            description="A published event and a gathering that is ready to run land here."
          />
        ) : (
          <BoardRows items={productions} showBadge={false} />
        )}
      </section>
      <section aria-labelledby="calendar-pm-board">
        <SectionHeader id="calendar-pm-board" title="The board" count={items.length} />
        <LanePurpose>Planning and Production stay here until they get their own lanes. Cancelled stays visible.</LanePurpose>
        {items.length === 0 ? (
          <EmptyState
            variant="first-use"
            title="Nothing on the board yet."
            description="Cancelled lands here. Pencil, Planning, and Production have their own lanes above."
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
