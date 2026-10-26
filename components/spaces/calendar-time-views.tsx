'use client'

import { useSyncExternalStore } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import {
  calendarPresentation,
  type CalendarLayerKey,
} from '@/lib/calendar/registry'
import { planStageLabel, type SpacePlan } from '@/lib/calendar/plans'
import type { CalendarEvent } from '@/lib/calendar/item'
import type { AstroMarker } from '@/lib/calendar/astro-markers'
import {
  addDays,
  dayOfMonth,
  dayTitle,
  GRID_END_HOUR,
  GRID_START_HOUR,
  hourLabel,
  HOUR_PX,
  layoutDay,
  nowOffsetMin,
  shortDateLabel,
  shortWeekdayName,
  timelineWindow,
  timeRangeLabel,
  weekDayKeys,
  weekTitle,
  type CalendarTimeView,
  type TimedBlock,
} from '@/lib/calendar/time-views'
import { cn } from '@/lib/utils'

// DAY, WEEK AND TIMELINE (LIVE-1178). The three views the redesign drew and the view bar used to mark
// Coming soon. They read the same CalendarEvent items the month grid, the Agenda and the Board read,
// so a date moved or a Plan restaged shows here with no second source. Every chip is the registry's
// form + colour + word (`calendarPresentation`), the word always printed because this is a team
// surface; nothing here keeps a colour table of its own.
//
// WHAT THEY DO NOT DO YET: drag to move. The month grid and the console carry that, with the series
// choice and the Undo that a move needs; a time grid that moved a date without them would be a second,
// weaker way to change the calendar. A block opens the Plan or the gathering, where the edit lives.

/** Minutes since midnight in the Space's zone (or the browser's when the Space has none). Read on the
 *  client only, once a minute: the server has no clock the reader would agree with, so the now line is
 *  simply absent from the first paint. */
function useNowMinutes(timeZone: string | null): number | null {
  const snapshot = () => {
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        minute: 'numeric',
        hourCycle: 'h23',
        ...(timeZone ? { timeZone } : {}),
      }).formatToParts(new Date())
      const h = Number(parts.find((p) => p.type === 'hour')?.value)
      const m = Number(parts.find((p) => p.type === 'minute')?.value)
      return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : -1
    } catch {
      return -1
    }
  }
  const subscribe = (onChange: () => void) => {
    const id = window.setInterval(onChange, 60_000)
    return () => window.clearInterval(id)
  }
  const value = useSyncExternalStore(subscribe, snapshot, () => -1)
  return value < 0 ? null : value
}

const noMarkers: readonly AstroMarker[] = []

function skyLine(markers: readonly AstroMarker[], dayKey: string): string | null {
  const day = markers.filter((m) => m.day === dayKey)
  return day.length ? day.map((m) => `${m.symbol} ${m.label}`).join(' · ') : null
}

type OpenProps = {
  /** True when the item has somewhere to go: its Plan, or its row in the List. */
  canOpen: (item: CalendarEvent) => boolean
  onOpen: (item: CalendarEvent) => void
}

function ItemWord({ item }: { item: CalendarEvent }) {
  const look = calendarPresentation(item, 'team')
  return <span className="text-2xs font-semibold uppercase">{look.word}</span>
}

function ItemButton({
  item,
  canOpen,
  onOpen,
  className,
  style,
  children,
}: OpenProps & {
  item: CalendarEvent
  className?: string
  style?: React.CSSProperties
  children: React.ReactNode
}) {
  const look = calendarPresentation(item, 'team')
  const base = cn('block w-full min-w-0 overflow-hidden rounded-control px-2 py-1 text-left text-meta', look.chipClass, className)
  const label = `${look.word}: ${item.title}, ${item.timeLabel}`
  if (!canOpen(item)) {
    return (
      <div className={base} style={style} data-calendar-time-item={look.key} aria-label={label}>
        {children}
      </div>
    )
  }
  return (
    <button type="button" className={cn(base, 'press')} style={style} data-calendar-time-item={look.key} aria-label={label} onClick={() => onOpen(item)}>
      {children}
    </button>
  )
}

function TimedCard({ block, canOpen, onOpen }: OpenProps & { block: TimedBlock }) {
  const { item, startMin, endMin, lane, lanes } = block
  const look = calendarPresentation(item, 'team')
  const top = ((startMin - GRID_START_HOUR * 60) / 60) * HOUR_PX
  const height = ((endMin - startMin) / 60) * HOUR_PX
  return (
    <ItemButton
      item={item}
      canOpen={canOpen}
      onOpen={onOpen}
      className="absolute"
      style={{
        top,
        height: Math.max(height - 2, 18),
        left: `calc(${(lane / lanes) * 100}% + 1px)`,
        width: `calc(${100 / lanes}% - 2px)`,
      }}
    >
      <ItemWord item={item} />
      <span className={cn('block truncate font-medium', look.titleClass)}>{item.title}</span>
      <span className="block truncate text-2xs text-muted">{timeRangeLabel(item)}</span>
    </ItemButton>
  )
}

function AllDayChip({ item, canOpen, onOpen }: OpenProps & { item: CalendarEvent }) {
  const look = calendarPresentation(item, 'team')
  return (
    <ItemButton item={item} canOpen={canOpen} onOpen={onOpen}>
      <span className="flex min-w-0 items-baseline gap-1.5">
        <ItemWord item={item} />
        <span className={cn('truncate font-medium', look.titleClass)}>{item.title}</span>
      </span>
    </ItemButton>
  )
}

// ─── DAY AND WEEK ────────────────────────────────────────────────────────────────────────────────

function TimeGrid({
  dayKeys,
  items,
  todayDay,
  nowMinutes,
  markers,
  canOpen,
  onOpen,
  onPickDay,
}: OpenProps & {
  dayKeys: string[]
  items: readonly CalendarEvent[]
  todayDay: string
  nowMinutes: number | null
  markers: readonly AstroMarker[]
  /** Week only: a column header opens that day. */
  onPickDay?: (dayKey: string) => void
}) {
  const hours = Array.from({ length: GRID_END_HOUR - GRID_START_HOUR }, (_, i) => GRID_START_HOUR + i)
  const layouts = dayKeys.map((dayKey) => ({ dayKey, ...layoutDay(items, dayKey) }))
  const anyAllDay = layouts.some((l) => l.allDay.length > 0)
  const nowOffset = nowMinutes === null ? null : nowOffsetMin(nowMinutes)
  const columns = { gridTemplateColumns: `3.5rem repeat(${dayKeys.length}, minmax(0, 1fr))` }
  const gridHeight = hours.length * HOUR_PX
  return (
    <div className="overflow-x-auto rounded-card border border-border bg-surface" data-calendar-time-grid>
      <div className={cn(dayKeys.length > 1 && 'min-w-[44rem]')}>
        <div className="grid border-b border-border" style={columns}>
          <div />
          {layouts.map(({ dayKey }) => {
            const isToday = dayKey === todayDay
            const sky = skyLine(markers, dayKey)
            const head = (
              <>
                <span
                  className={cn(
                    'inline-flex h-8 w-8 items-center justify-center rounded-control text-body-sm font-semibold',
                    isToday ? 'bg-primary text-on-primary' : 'bg-surface-elevated text-text',
                  )}
                >
                  {dayOfMonth(dayKey)}
                </span>
                <span className="min-w-0 text-left">
                  <span className="block text-meta font-semibold text-text">{shortWeekdayName(dayKey)}</span>
                  {sky ? <span className="block truncate text-2xs text-muted">{sky}</span> : null}
                </span>
              </>
            )
            return onPickDay ? (
              <button
                key={dayKey}
                type="button"
                className="press flex min-w-0 items-center gap-2 px-2 py-2 text-left"
                aria-label={`Open ${dayTitle(dayKey)}`}
                aria-current={isToday ? 'date' : undefined}
                onClick={() => onPickDay(dayKey)}
              >
                {head}
              </button>
            ) : (
              <div key={dayKey} className="flex min-w-0 items-center gap-2 px-2 py-2" aria-current={isToday ? 'date' : undefined}>
                {head}
              </div>
            )
          })}
        </div>

        {anyAllDay ? (
          <div className="grid border-b border-border" style={columns} data-calendar-all-day-row>
            <div className="px-2 py-1.5 text-2xs text-muted">All day</div>
            {layouts.map(({ dayKey, allDay }) => (
              <div key={dayKey} className="min-w-0 space-y-1 px-1 py-1.5">
                {allDay.map((item) => (
                  <AllDayChip key={`${item.slug}|${item.dayKey}`} item={item} canOpen={canOpen} onOpen={onOpen} />
                ))}
              </div>
            ))}
          </div>
        ) : null}

        <div className="grid" style={columns}>
          <div className="relative" style={{ height: gridHeight }} aria-hidden>
            {hours.map((h, i) => (
              <span key={h} className="absolute right-2 -translate-y-1/2 text-2xs text-muted" style={{ top: i * HOUR_PX, display: i === 0 ? 'none' : undefined }}>
                {hourLabel(h)}
              </span>
            ))}
          </div>
          {layouts.map(({ dayKey, timed }) => (
            <div key={dayKey} className="relative border-l border-border" style={{ height: gridHeight }} data-calendar-time-day={dayKey}>
              {hours.map((h, i) => (
                <div key={h} className="absolute inset-x-0 border-t border-border" style={{ top: i * HOUR_PX }} aria-hidden />
              ))}
              {timed.map((block) => (
                <TimedCard key={`${block.item.slug}|${block.item.dayKey}`} block={block} canOpen={canOpen} onOpen={onOpen} />
              ))}
              {dayKey === todayDay && nowOffset !== null ? (
                <div
                  className="pointer-events-none absolute inset-x-0 z-10 flex items-center"
                  style={{ top: (nowOffset / 60) * HOUR_PX }}
                  data-calendar-now-line
                  aria-hidden
                >
                  <span className="-ml-1.5 h-3 w-3 shrink-0 rounded-pill bg-primary" />
                  <span className="h-0.5 flex-1 bg-primary" />
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── TIMELINE ────────────────────────────────────────────────────────────────────────────────────

function Timeline({
  items,
  plans,
  anchorDay,
  todayDay,
  hidden,
  canOpen,
  onOpen,
  onOpenPlan,
}: OpenProps & {
  items: readonly CalendarEvent[]
  plans: readonly SpacePlan[]
  anchorDay: string
  todayDay: string
  hidden: ReadonlySet<CalendarLayerKey>
  onOpenPlan: (planId: string) => void
}) {
  const win = timelineWindow(items, plans, anchorDay, todayDay, hidden)
  if (win.rows.length === 0) {
    return (
      <EmptyState
        variant="first-use"
        title="Nothing in these nine weeks."
        description="Pencil a date in, or page to a week with something on it."
      />
    )
  }
  return (
    <div className="overflow-x-auto rounded-card border border-border bg-surface" data-calendar-timeline>
      <div className="min-w-[48rem]">
        <div className="grid grid-cols-[12rem_minmax(0,1fr)] border-b border-border">
          <div />
          <div className="relative h-8">
            {win.weekTicks.map((t) => (
              <span key={t.dayKey} className="absolute top-0 flex h-full items-center border-l border-border pl-1.5 text-2xs text-muted" style={{ left: `${t.leftPct}%` }}>
                {shortDateLabel(t.dayKey)}
              </span>
            ))}
          </div>
        </div>
        <ul className="divide-y divide-border">
          {win.rows.map((row) => {
            const look = row.stage ? calendarPresentation({ stage: row.stage === 'plan' ? 'planning' : row.stage }, 'team') : null
            return (
              <li key={row.key} className="grid grid-cols-[12rem_minmax(0,1fr)]" data-calendar-timeline-row={row.key}>
                <div className="flex min-w-0 flex-col justify-center gap-0.5 px-3 py-2">
                  {row.planId ? (
                    <button type="button" className="press truncate text-left text-body-sm font-semibold text-text" onClick={() => onOpenPlan(row.planId!)}>
                      {row.title}
                    </button>
                  ) : (
                    <span className="truncate text-body-sm font-semibold text-text">{row.title}</span>
                  )}
                  {row.stage ? <span className="text-2xs text-muted">{planStageLabel(row.stage)}</span> : null}
                </div>
                <div className="relative h-16">
                  {win.todayPct !== null ? (
                    <span className="absolute inset-y-0 w-0.5 bg-primary" style={{ left: `${win.todayPct}%` }} aria-hidden data-calendar-today-line />
                  ) : null}
                  {row.dates.length > 1 ? (
                    <span
                      className={cn('absolute top-1/2 h-2 -translate-y-1/2 rounded-pill', look?.chipClass ?? 'bg-cal-works-bg')}
                      style={{ left: `${row.spanLeftPct}%`, width: `${row.spanWidthPct}%` }}
                      aria-hidden
                    />
                  ) : null}
                  {row.dates.map(({ item, leftPct }) => (
                    <span key={`${item.slug}|${item.dayKey}`} className="absolute top-2 -translate-x-1/2" style={{ left: `${leftPct}%` }}>
                      <ItemButton item={item} canOpen={canOpen} onOpen={onOpen} className="w-auto truncate rounded-pill px-2 py-0.5 text-2xs">
                        {shortDateLabel(item.dayKey)}
                      </ItemButton>
                    </span>
                  ))}
                  {row.todos.map(({ item, leftPct, overdue }) => (
                    <span
                      key={`${item.slug}|${item.dayKey}`}
                      className={cn(
                        'absolute bottom-2 h-2.5 w-2.5 -translate-x-1/2 rounded-pill',
                        overdue ? 'bg-cal-event' : 'bg-cal-todo',
                      )}
                      style={{ left: `${leftPct}%` }}
                      role="img"
                      aria-label={`${overdue ? 'Overdue to-do' : 'To-do'}: ${item.title}, ${shortDateLabel(item.dayKey)}`}
                      title={`${item.title}, ${shortDateLabel(item.dayKey)}`}
                    />
                  ))}
                </div>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}

// ─── THE SHELL ───────────────────────────────────────────────────────────────────────────────────

export function CalendarTimeViews({
  view,
  items,
  plans,
  hiddenLayers,
  anchorDay,
  onAnchor,
  todayDay,
  spaceTimeZone = null,
  skyMarkers = noMarkers,
  canOpen,
  onOpen,
  onOpenPlan,
  onOpenDay,
}: OpenProps & {
  view: CalendarTimeView
  items: readonly CalendarEvent[]
  plans: readonly SpacePlan[]
  hiddenLayers: ReadonlySet<CalendarLayerKey>
  /** The day the view is centred on; the week and the nine weeks both derive from it. */
  anchorDay: string
  onAnchor: (dayKey: string) => void
  /** The Space's own day when the page loaded. */
  todayDay: string
  spaceTimeZone?: string | null
  skyMarkers?: readonly AstroMarker[]
  onOpenPlan: (planId: string) => void
  /** A week's column header opens that day in the Day view. */
  onOpenDay: (dayKey: string) => void
}) {
  const nowMinutes = useNowMinutes(spaceTimeZone)
  const shown = items.filter((item) => !hiddenLayers.has(item.layer ?? 'events'))
  const step = view === 'day' ? 1 : 7

  const title =
    view === 'day' ? dayTitle(anchorDay) : view === 'week' ? weekTitle(anchorDay) : 'Nine weeks'
  const noun = view === 'day' ? 'day' : 'week'

  return (
    <div className="space-y-3" data-calendar-time-view={view}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lead font-bold text-text" aria-live="polite">
          {title}
        </h3>
        <div className="flex items-center gap-1.5">
          <Button type="button" size="sm" variant="secondary" aria-label={`Previous ${noun}`} onClick={() => onAnchor(addDays(anchorDay, -step))}>
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={() => onAnchor(todayDay)}>
            Today
          </Button>
          <Button type="button" size="sm" variant="secondary" aria-label={`Next ${noun}`} onClick={() => onAnchor(addDays(anchorDay, step))}>
            <ChevronRight className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      </div>
      {view === 'timeline' ? (
        <Timeline
          items={items}
          plans={plans}
          anchorDay={anchorDay}
          todayDay={todayDay}
          hidden={hiddenLayers}
          canOpen={canOpen}
          onOpen={onOpen}
          onOpenPlan={onOpenPlan}
        />
      ) : (
        <TimeGrid
          dayKeys={view === 'day' ? [anchorDay] : weekDayKeys(anchorDay)}
          items={shown}
          todayDay={todayDay}
          nowMinutes={nowMinutes}
          markers={skyMarkers}
          canOpen={canOpen}
          onOpen={onOpen}
          onPickDay={view === 'week' ? onOpenDay : undefined}
        />
      )}
    </div>
  )
}
