'use client'

import { useEffect, useRef, useState } from 'react'
import { FqIcon } from '@/components/frequency/icon'
import { IconButton, IconLink } from '@/components/ui/icon-button'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { addDays, mondayOnOrBefore, monthDayLabel, weekdayName } from '@/lib/calendar/planner/days'
import { monthName } from '@/lib/calendar/planner/month'
import { SUITE_VIEWS, SUITE_VIEW_LABEL, type SuiteView } from '@/lib/calendar/planner/suite-model'

// THE HEADER (README 1.2, layout 1a): the month as a title that opens the jump panel, the sign line
// under it, the paging pill, the seven-segment view control, and the two buttons on the right. On a
// narrow console the title row carries the button that opens the sidebar.

const MONTH_CELLS = Array.from({ length: 12 }, (_, i) => i + 1)

/** The title a view reads: the month, the day, or the week. */
function titleFor(view: SuiteView, cursor: string): string {
  if (view === 'day') return `${weekdayName(cursor)}, ${monthDayLabel(cursor)}`
  if (view === 'week') {
    const start = mondayOnOrBefore(cursor)
    const end = addDays(start, 6)
    return end.slice(0, 7) === start.slice(0, 7)
      ? `${monthDayLabel(start)} to ${Number(end.slice(8, 10))}`
      : `${monthDayLabel(start)} to ${monthDayLabel(end)}`
  }
  return `${monthName(cursor.slice(0, 7))} ${cursor.slice(0, 4)}`
}

function JumpPanel({
  ym,
  todayYm,
  minYm,
  maxYm,
  counts,
  onPick,
  onClose,
}: {
  ym: string
  todayYm: string
  minYm: string
  maxYm: string
  counts: ReadonlyMap<string, number>
  onPick: (ym: string) => void
  onClose: () => void
}) {
  const [year, setYear] = useState(Number(ym.slice(0, 4)))
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const away = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node) && !(e.target as HTMLElement).closest('[data-jump-trigger]')) onClose()
    }
    document.addEventListener('pointerdown', away)
    return () => document.removeEventListener('pointerdown', away)
  }, [onClose])
  return (
    <div className="cal-jump fq-glass" ref={box} role="dialog" aria-label="Jump to a month">
      <div className="cal-jump-bar">
        <IconButton label="Previous year" variant="plain" onClick={() => setYear((y) => y - 1)}>
          <FqIcon name="chevron" size={16} className="cal-flip" />
        </IconButton>
        <span className="cal-jump-year">{year}</span>
        <IconButton label="Next year" variant="plain" onClick={() => setYear((y) => y + 1)}>
          <FqIcon name="chevron" size={16} />
        </IconButton>
      </div>
      <div className="cal-jump-grid">
        {MONTH_CELLS.map((m) => {
          const key = `${year}-${String(m).padStart(2, '0')}`
          const n = counts.get(key) ?? 0
          const out = key < minYm || key > maxYm
          return (
            <button
              type="button"
              key={key}
              className="cal-jump-cell"
              data-current={key === ym || undefined}
              data-today={key === todayYm || undefined}
              disabled={out}
              onClick={() => onPick(key)}
            >
              <span>{monthName(key).slice(0, 3)}</span>
              <span className="cal-as">{n > 0 ? n : ' '}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function SuiteHeader({
  view,
  cursor,
  todayYm,
  minYm,
  maxYm,
  sign,
  zoneLabel,
  counts,
  jumpOpen,
  onJump,
  onView,
  onPage,
  onToday,
  onPickMonth,
  onRail,
  onAsk,
}: {
  view: SuiteView
  cursor: string
  todayYm: string
  minYm: string
  maxYm: string
  /** The Sun sign line's pieces, or null when the sky is off or does not reach. */
  sign: { sign: string; house: number } | null
  zoneLabel: string
  counts: ReadonlyMap<string, number>
  jumpOpen: boolean
  onJump: (open: boolean) => void
  onView: (view: SuiteView) => void
  onPage: (delta: -1 | 1) => void
  onToday: () => void
  onPickMonth: (ym: string) => void
  onRail: () => void
  onAsk: () => void
}) {
  const ym = cursor.slice(0, 7)
  return (
    <header className="cal-head">
      <div className="cal-titlebox">
        <IconButton label="Open the sidebar" variant="tinted" className="cal-rail-btn" onClick={onRail}>
          <FqIcon name="filter" size={16} />
        </IconButton>
        <div className="cal-titlewrap">
          <button
            type="button"
            className="cal-title"
            data-jump-trigger
            aria-expanded={jumpOpen}
            aria-haspopup="dialog"
            onClick={() => onJump(!jumpOpen)}
          >
            <h2>{titleFor(view, cursor)}</h2>
            <FqIcon name="chevron" size={16} className="cal-down" />
          </button>
          <p className="cal-serif cal-sign">
            {sign ? (
              <>
                <FqIcon name={`house-${String(sign.house).padStart(2, '0')}` as 'house-01'} size={14} />
                Sun in {sign.sign} · {zoneLabel}
              </>
            ) : (
              zoneLabel
            )}
          </p>
          {jumpOpen ? (
            <JumpPanel
              ym={ym}
              todayYm={todayYm}
              minYm={minYm}
              maxYm={maxYm}
              counts={counts}
              onPick={(next) => {
                onJump(false)
                onPickMonth(next)
              }}
              onClose={() => onJump(false)}
            />
          ) : null}
        </div>
      </div>
      <div className="cal-paging" role="group" aria-label="Page through time">
        <IconButton label="Previous" variant="plain" onClick={() => onPage(-1)}>
          <FqIcon name="chevron" size={16} className="cal-flip" />
        </IconButton>
        <button type="button" className="cal-today" onClick={onToday}>
          Today
        </button>
        <IconButton label="Next" variant="plain" onClick={() => onPage(1)}>
          <FqIcon name="chevron" size={16} />
        </IconButton>
      </div>
      <div className="cal-views">
        <SegmentedControl
          label="Calendar views"
          value={view}
          onChange={onView}
          size="sm"
          segments={SUITE_VIEWS.map((v) => ({ value: v, label: SUITE_VIEW_LABEL[v] }))}
        />
      </div>
      <div className="cal-acts">
        <IconLink href="#calendar-settings" label="Calendar settings" variant="tinted">
          <FqIcon name="settings" size={16} />
        </IconLink>
        <button type="button" className="btn cal-ask" onClick={onAsk}>
          <FqIcon name="vera" size={16} />
          <span className="cal-ask-t">Ask Vera or search</span>
          <kbd className="cal-kbd">/</kbd>
        </button>
      </div>
    </header>
  )
}

