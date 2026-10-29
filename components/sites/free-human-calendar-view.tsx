'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, Calendar as CalendarIcon, MapPin, Ticket, X } from 'lucide-react'
import { FreeHumanGlyph } from '@/components/sites/free-human-glyph'
import {
  FREE_HUMAN_DOW_HEADS, FREE_HUMAN_KINDS, freeHumanAgenda, freeHumanAgendaDay, freeHumanCollapse, freeHumanDayName, freeHumanFilter, freeHumanKindMeta,
  freeHumanMonthAt, freeHumanMonthCells, freeHumanMonthName, freeHumanMonthStrip, freeHumanOnDay, freeHumanTime, freeHumanWhen, type FreeHumanOcc,
} from '@/lib/sites/free-human-calendar'
import { freeHumanSeason } from '@/lib/sites/free-human-sky'

// THE FREE HUMAN CALENDAR VIEW (design: templates/website/Calendar.dc.html, the paper card). The month strip, the kind filters,
// the month grid or the agenda, a day panel and a gathering panel. Everything is drawn from the occurrences the block hands it
// (plain strings), so this is the only client code the Calendar needs. Arrow keys move between months and Escape closes a panel.

const STRIP = 13
const FILTER_LABEL: Record<string, string> = { all: 'All', circle: 'Circles', moon: 'Moon', turn: 'Turns of the year', workshop: 'Workshops', retreat: 'Retreats', program: 'Seasons', book: 'Books' }

export interface FreeHumanCalendarViewProps {
  occs: FreeHumanOcc[]
  /** "YYYY-MM-DD", the day the page was drawn. */
  today: string
  defaultView: 'month' | 'agenda'
  filters: string[]
  collapseRecurring: boolean
  wheel: boolean
  empty: string
  note: string
  buttonLabel: string
}

function Mark({ name, size }: { name: string; size: number }) {
  return <span className="fhc-mark"><FreeHumanGlyph name={name} size={size} /></span>
}

export function FreeHumanCalendarView({ occs, today, defaultView, filters, collapseRecurring, wheel, empty, note, buttonLabel }: FreeHumanCalendarViewProps) {
  const [filter, setFilter] = useState('all')
  const [view, setView] = useState<'month' | 'agenda'>(defaultView)
  const [offset, setOffset] = useState(0)
  const [sel, setSel] = useState<string | null>(null)
  const [day, setDay] = useState<string | null>(null)
  const [moved, setMoved] = useState(false)

  const shown = useMemo(() => freeHumanFilter(occs, filter), [occs, filter])
  const { year, month } = freeHumanMonthAt(today, offset)
  const cells = useMemo(() => freeHumanMonthCells(shown, year, month, today), [shown, year, month, today])
  const strip = useMemo(() => freeHumanMonthStrip(shown, today, STRIP, (m) => freeHumanSeason(m).key), [shown, today])
  const agenda = useMemo(() => {
    const rows = freeHumanAgenda(shown, year, month)
    return collapseRecurring && filter === 'all' ? freeHumanCollapse(rows) : rows
  }, [shown, year, month, collapseRecurring, filter])
  const selected = occs.find((o) => o.id === sel) ?? null
  const dayItems = day ? shown.filter((o) => freeHumanOnDay(o, day)) : []

  const go = useCallback((n: number) => { setMoved(true); setOffset((o) => Math.max(0, Math.min(STRIP - 1, o + n))) }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && /input|textarea|select/i.test(e.target.tagName)) return
      if (e.key === 'Escape') { setSel(null); setDay(null) } else if (!sel && !day && e.key === 'ArrowRight') go(1)
      else if (!sel && !day && e.key === 'ArrowLeft') go(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sel, day, go])

  const away = moved && (offset !== 0 || view !== defaultView)
  const shiftDay = (n: number) => {
    if (!day) return
    const t = new Date(new Date(`${day}T00:00:00Z`).getTime() + n * 86_400_000)
    setDay(t.toISOString().slice(0, 10))
    const here = freeHumanMonthAt(today, 0)
    setOffset(Math.max(0, Math.min(STRIP - 1, (t.getUTCFullYear() - here.year) * 12 + t.getUTCMonth() - here.month)))
  }
  const meta = (o: FreeHumanOcc) => [freeHumanWhen(o).replace(/^[^·]*· /, ''), o.place, freeHumanKindMeta(o.kind).label].filter(Boolean).join(' · ')
  const dayDate = day ? new Date(`${day}T00:00:00Z`) : null
  const feedWheel = () => { setSel(null); document.getElementById('year-wheel')?.scrollIntoView({ behavior: 'smooth' }) }

  return (
    <div className="fhc-card">
      <div className="fhc-bar">
        <div className="fhc-bar-left">
          {away && <button type="button" className="hs-btn hs-btn-gilt fhc-today" onClick={() => { setOffset(0); setView(defaultView); setDay(null); setMoved(false) }}><FreeHumanGlyph name="sun-sign" size={16} />Jump to today</button>}
          <span className="fhc-count">{shown.filter((o) => o.startsAt.slice(0, 10) >= today).length} upcoming dates</span>
        </div>
        <div className="fhc-nav">
          <button type="button" className="fhc-icon" aria-label="Previous month" onClick={() => go(-1)} disabled={offset === 0}><ArrowLeft size={20} strokeWidth={1.5} /></button>
          <div className="fhc-month">{freeHumanMonthName(month)} <em>{year}</em></div>
          <button type="button" className="fhc-icon" aria-label="Next month" onClick={() => go(1)} disabled={offset === STRIP - 1}><ArrowRight size={20} strokeWidth={1.5} /></button>
        </div>
        <div className="fhc-tabs" role="tablist" aria-label="View">
          {(['month', 'agenda'] as const).map((v) => (
            <button key={v} type="button" role="tab" aria-selected={view === v} className="fhc-tab" onClick={() => { setMoved(true); setView(v) }}>{v === 'month' ? 'Month' : 'Agenda'}</button>
          ))}
        </div>
      </div>

      <div className="fhc-strip" role="tablist" aria-label="Months">
        {strip.map((m) => (
          <button key={m.offset} type="button" role="tab" aria-selected={m.offset === offset} className="fhc-strip-m" data-season={m.season} data-on={m.offset === offset || undefined} aria-label={`${freeHumanMonthName(freeHumanMonthAt(today, m.offset).month)} ${freeHumanMonthAt(today, m.offset).year}, ${m.count} dates`} onClick={() => { setMoved(true); setOffset(m.offset) }}>
            <span className="fhc-strip-y">{m.year || ' '}</span>
            <span className="fhc-strip-l">{m.label}</span>
            <span className="fhc-strip-n">{m.offset === offset ? <><i aria-hidden="true" />{m.count}</> : m.countLine}</span>
          </button>
        ))}
      </div>

      <div className="fhc-filters" role="group" aria-label="Kind of gathering">
        {filters.map((f) => <button key={f} type="button" className="fhc-tag" aria-pressed={filter === f} onClick={() => setFilter(f)}>{FILTER_LABEL[f] ?? f}</button>)}
      </div>

      {view === 'month' ? (
        <div className="fhc-grid-wrap">
          <div className="fhc-grid fhc-dow">{FREE_HUMAN_DOW_HEADS.map((h) => <div key={h}>{h}</div>)}</div>
          <div className="fhc-grid">
            {cells.map((c) => (
              <div key={c.key} className="fhc-cell" data-out={!c.inMonth || undefined} data-today={c.today || undefined}>
                <button type="button" className="fhc-num" aria-label={c.aria} onClick={() => setDay(c.key)}>{c.n}</button>
                {c.items.map((it) => (
                  <button key={it.id} type="button" className="fhc-item" onClick={() => setSel(it.id)} style={{ ['--fhc-kind' as string]: `var(${it.color})` }}>
                    <Mark name={it.glyph} size={13} /><span>{it.label}</span>
                  </button>
                ))}
                {c.more > 0 && <button type="button" className="fhc-more" onClick={() => setDay(c.key)}>+{c.more} more</button>}
                {c.count > 0 && <span className="fhc-dots" aria-hidden="true">{c.items.map((it) => <i key={it.id} style={{ background: `var(${it.color})` }} />)}</span>}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="fhc-agenda">
          {agenda.length > 0 && (
            <div className="fhc-agenda-group">
              <div className="fhc-agenda-head"><span>{freeHumanMonthName(month)} {year}</span><em>{freeHumanSeason(month).line}</em></div>
              {agenda.map((o) => {
                const d = freeHumanAgendaDay(o)
                return (
                  <button key={o.id} type="button" className="fhc-row" onClick={() => setSel(o.id)}>
                    <span className="fhc-row-day"><b>{d.day}</b><i>{d.dow}</i></span>
                    <span className="fhc-row-body"><span className="fhc-row-title"><Mark name={freeHumanKindMeta(o.kind).glyph} size={19} />{o.title}</span><span className="fhc-row-meta">{meta(o)}</span></span>
                    <span className="fhc-row-side">{o.price && <span className="fhc-row-price">{o.price}</span>}<em>Details →</em></span>
                  </button>
                )
              })}
            </div>
          )}
          {agenda.length === 0 && <p className="fhc-empty">{empty}</p>}
        </div>
      )}

      <div className="fhc-key">
        <div className="fhc-legend">{FREE_HUMAN_KINDS.filter((k) => k.id !== 'program').map((k) => <span key={k.id}><Mark name={k.glyph} size={17} />{k.label}</span>)}</div>
        {note && <div className="fhc-note">{note}</div>}
      </div>

      {dayDate && !selected && (
        <>
          <div className="fhc-scrim" onClick={() => setDay(null)} />
          <aside className="fhc-panel" role="dialog" aria-label="The day">
            <div className="fhc-panel-top">
              <div className="fhc-panel-steps">
                <button type="button" className="fhc-icon" aria-label="Previous day" onClick={() => shiftDay(-1)}><ArrowLeft size={18} strokeWidth={1.5} /></button>
                <button type="button" className="fhc-icon" aria-label="Next day" onClick={() => shiftDay(1)}><ArrowRight size={18} strokeWidth={1.5} /></button>
              </div>
              <button type="button" className="fhc-icon" aria-label="Close" onClick={() => setDay(null)}><X size={20} strokeWidth={1.5} /></button>
            </div>
            <div className="fhc-panel-eyebrow">{freeHumanDayName(dayDate.getUTCDay())} · {freeHumanSeason(dayDate.getUTCMonth()).line}</div>
            <div className="fhc-panel-title">{freeHumanMonthName(dayDate.getUTCMonth())} {dayDate.getUTCDate()}</div>
            {dayItems.map((o) => (
              <button key={o.id} type="button" className="fhc-day-item" onClick={() => setSel(o.id)}>
                <span className="fhc-seal"><FreeHumanGlyph name={freeHumanKindMeta(o.kind).glyph} size={20} /></span>
                <span><b>{o.title}</b><i>{[o.endsAt && o.endsAt.slice(0, 10) > o.startsAt.slice(0, 10) ? 'All day' : `${freeHumanTime(o.startsAt)}${o.endsAt ? `–${freeHumanTime(o.endsAt)}` : ''}`, o.place, o.price].filter(Boolean).join(' · ')}</i></span>
              </button>
            ))}
            {dayItems.length === 0 && <p className="fhc-empty fhc-empty--panel">A quiet day. Rest is a practice too.</p>}
          </aside>
        </>
      )}

      {selected && (
        <>
          <div className="fhc-scrim fhc-scrim--deep" onClick={() => setSel(null)} />
          <aside className="fhc-panel fhc-panel--detail" role="dialog" aria-label={selected.title}>
            <div className="fhc-panel-top">
              <span className="fhc-seal fhc-seal--lg"><FreeHumanGlyph name={freeHumanKindMeta(selected.kind).glyph} size={26} /></span>
              <button type="button" className="fhc-icon" aria-label="Close" onClick={() => setSel(null)}><X size={20} strokeWidth={1.5} /></button>
            </div>
            <div className="fhc-panel-eyebrow">{freeHumanKindMeta(selected.kind).label}</div>
            <div className="fhc-detail-title">{selected.title}</div>
            <div className="fhc-facts">
              <span><CalendarIcon size={18} strokeWidth={1.5} aria-hidden="true" />{freeHumanWhen(selected)}</span>
              {selected.place && <span><MapPin size={18} strokeWidth={1.5} aria-hidden="true" />{selected.place}</span>}
              {selected.price && <span><Ticket size={18} strokeWidth={1.5} aria-hidden="true" />{selected.price}</span>}
            </div>
            {selected.summary && <p className="fhc-summary">{selected.summary}</p>}
            <div className="fhc-detail-actions">
              {selected.href && buttonLabel && <a className="hs-btn hs-btn-gilt fhc-wide" href={selected.href}>{buttonLabel}<ArrowRight size={16} strokeWidth={1.5} aria-hidden="true" /></a>}
              {wheel && <button type="button" className="hs-btn hs-btn-secondary fhc-wide" onClick={feedWheel}><FreeHumanGlyph name="sun-sign" size={16} />See it on the wheel</button>}
              {selected.href && <a className="hs-btn hs-btn-ghost fhc-wide" href={`${selected.href.replace(/\/$/, '')}/event.ics`}><CalendarIcon size={16} strokeWidth={1.5} aria-hidden="true" />Add to my calendar</a>}
            </div>
          </aside>
        </>
      )}
    </div>
  )
}
