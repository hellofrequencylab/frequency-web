'use client'

import { useMemo, useState } from 'react'
import { FqIcon } from '@/components/frequency/icon'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/field'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { Select } from '@/components/ui/select'
import { clockLabel, dayLabel, lengthLabel, spansDay } from '@/lib/calendar/planner/days'
import { HOLD_LENGTHS, holdEnd, holdReleaseNote } from '@/lib/calendar/planner/hold'
import { monthName, monthWeeks, shiftMonth } from '@/lib/calendar/planner/month'
import { PENCIL_MAX_DATES } from '@/lib/calendar/planner/pencil-it-in'
import { PLAYBOOKS, playbookHint } from '@/lib/calendar/planner/playbook-schedule'
import type { PlannerItem } from '@/lib/calendar/planner/types'
import { SuiteSheet } from './suite-sheet'

// THE PENCIL IT IN SHEET (README 1.4). Title, up to three days on a small month, a start and a length,
// how long to hold the dates, and a playbook that adds the prep list. Saving makes a Plan, holds the
// dates as dashed pencils and counts the playbook's to-dos back from the earliest date. A grey line
// under a day means the Space is unavailable then; it can still be held, the clash is told on the
// date afterwards. Co-hosting comes with the co-host pass.

const OPTION_LETTERS = ['A', 'B', 'C'] as const
/** "All day", then 6 AM to 11:30 PM every half hour. */
const START_OPTIONS = [
  { value: 'all', label: 'All day' },
  ...Array.from({ length: 36 }, (_, i) => {
    const min = 360 + i * 30
    return { value: String(min), label: clockLabel(min) }
  }),
]
const LENGTH_MINUTES = [30, 60, 90, 120, 180, 240, 360, 450]
const LENGTH_OPTIONS = LENGTH_MINUTES.map((m) => ({ value: String(m), label: lengthLabel(m) }))

export interface PencilSubmit {
  title: string
  dates: string[]
  startMin: number | null
  durMin: number
  holdDays: number
  playbookId: string
}

export function SuitePencil({
  today,
  items,
  startDay,
  startTitle,
  onSubmit,
  onClose,
}: {
  today: string
  /** The calendar's dates, so a day the Space is unavailable can be drawn with its grey line. */
  items: readonly PlannerItem[]
  /** A day already picked, from a quick add's "More dates and a playbook". */
  startDay?: string | null
  startTitle?: string
  /** Returns a sentence when the save failed, or null when it went through. */
  onSubmit: (input: PencilSubmit) => Promise<string | null>
  onClose: () => void
}) {
  const [title, setTitle] = useState(startTitle ?? '')
  const [dates, setDates] = useState<string[]>(startDay && startDay >= today ? [startDay] : [])
  const [ym, setYm] = useState((startDay && startDay >= today ? startDay : today).slice(0, 7))
  const [start, setStart] = useState('1140')
  const [dur, setDur] = useState('120')
  const [holdDays, setHoldDays] = useState<number>(7)
  const [playbook, setPlaybook] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const weeks = useMemo(() => monthWeeks(ym), [ym])
  const closed = useMemo(() => {
    const out = new Set<string>()
    const unavailable = items.filter((i) => i.kind === 'unavailable')
    for (const w of weeks.flat()) if (unavailable.some((i) => spansDay(i, w))) out.add(w)
    return out
  }, [items, weeks])

  const toggle = (day: string) => {
    if (day < today) return
    setDates((cur) => (cur.includes(day) ? cur.filter((d) => d !== day) : [...cur, day].slice(-PENCIL_MAX_DATES)))
  }
  const release = holdEnd(today, holdDays)
  const ready = title.trim().length > 0 && dates.length > 0 && !busy

  const submit = async () => {
    if (!ready) return
    setBusy(true)
    setError('')
    const failed = await onSubmit({
      title: title.trim(),
      dates,
      startMin: start === 'all' ? null : Number(start),
      durMin: Number(dur),
      holdDays,
      playbookId: playbook,
    })
    setBusy(false)
    if (failed) setError(failed)
  }

  return (
    <SuiteSheet title="Pencil it in" line="Hold up to three dates while you work it out. Only your team sees it." onClose={onClose}>
      <form
        className="cal-form"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <Field label="Title">
          <Input
            value={title}
            maxLength={200}
            placeholder="What are you holding dates for?"
            autoFocus
            onChange={(e) => setTitle(e.target.value)}
          />
        </Field>

        <div className="cal-form-days">
          <p className="cal-serif">Tap up to three days. A grey line means the Space is unavailable.</p>
          <section className="cal-mini" aria-label="Pick days">
            <div className="cal-mini-bar">
              <button type="button" className="cal-mini-nav" aria-label="Previous month" onClick={() => setYm((m) => shiftMonth(m, -1))}>
                <FqIcon name="chevron" size={14} className="cal-flip" />
              </button>
              <span className="cal-mini-title">
                {monthName(ym)} {ym.slice(0, 4)}
              </span>
              <button type="button" className="cal-mini-nav" aria-label="Next month" onClick={() => setYm((m) => shiftMonth(m, 1))}>
                <FqIcon name="chevron" size={14} />
              </button>
            </div>
            <div className="cal-mini-grid">
              {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
                <span key={i} className="cal-mini-wd" aria-hidden>
                  {d}
                </span>
              ))}
              {weeks.flat().map((day) => {
                const at = dates.indexOf(day)
                return (
                  <button
                    type="button"
                    key={day}
                    className="cal-mini-day"
                    data-out={day.slice(0, 7) !== ym || undefined}
                    data-today={day === today || undefined}
                    data-picked={at >= 0 || undefined}
                    data-closed={closed.has(day) || undefined}
                    disabled={day < today}
                    aria-pressed={at >= 0}
                    aria-label={`${dayLabel(day)}${closed.has(day) ? ', unavailable' : ''}`}
                    onClick={() => toggle(day)}
                  >
                    {Number(day.slice(8, 10))}
                    {at >= 0 && dates.length > 1 ? <b className="cal-mini-opt">{OPTION_LETTERS[at]}</b> : null}
                  </button>
                )
              })}
            </div>
          </section>
          <div className="cal-held" aria-live="polite">
            <span className="cal-caps">Holding</span>
            {dates.length === 0 ? (
              <p className="cal-serif">Pick a day on the calendar</p>
            ) : (
              <>
                <ul>
                  {dates.map((d, i) => (
                    <li key={d}>
                      {dates.length > 1 ? <b className="cal-opt">{OPTION_LETTERS[i]}</b> : null}
                      <span>{dayLabel(d)}</span>
                      <button type="button" className="cal-x" aria-label={`Remove ${dayLabel(d)}`} onClick={() => setDates((cur) => cur.filter((x) => x !== d))}>
                        <FqIcon name="close" size={12} />
                      </button>
                    </li>
                  ))}
                </ul>
                {dates.length > 1 ? <p className="cal-serif">{dates.length} dates, you will pick one later</p> : null}
              </>
            )}
          </div>
        </div>

        <div className="cal-form-row">
          <Field label="Starts">
            <Select value={start} onChange={(e) => setStart(e.target.value)} options={START_OPTIONS} />
          </Field>
          {start !== 'all' ? (
            <Field label="Length">
              <Select value={dur} onChange={(e) => setDur(e.target.value)} options={LENGTH_OPTIONS} />
            </Field>
          ) : null}
        </div>

        <div className="cal-form-hold">
          <span className="cal-caps" id="cal-hold-label">
            Hold for
          </span>
          <SegmentedControl
            label="Hold for"
            value={String(holdDays)}
            onChange={(v) => setHoldDays(Number(v))}
            segments={HOLD_LENGTHS.map((n) => ({ value: String(n), label: `${n} days` }))}
          />
          <p className="cal-serif">{holdReleaseNote(release, dayLabel(release))}</p>
        </div>

        <div className="cal-form-play">
          <span className="cal-caps">Start from a playbook</span>
          <SegmentedControl
            label="Playbook"
            orientation="vertical"
            value={playbook}
            onChange={setPlaybook}
            segments={PLAYBOOKS.map((p) => ({
              value: p.id === 'blank' ? '' : p.id,
              label: (
                <span className="cal-play">
                  <span>{p.name}</span>
                  <span className="cal-serif">{playbookHint(p)}</span>
                </span>
              ),
            }))}
          />
        </div>

        <p className="cal-serif">It shows as a dashed hold on your calendar and starts a Plan with its own edit history.</p>
        {error ? (
          <p className="cal-form-err" role="alert">
            {error}
          </p>
        ) : null}
        <div className="cal-form-foot">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={!ready} loading={busy}>
            Pencil it in
          </Button>
        </div>
      </form>
    </SuiteSheet>
  )
}
