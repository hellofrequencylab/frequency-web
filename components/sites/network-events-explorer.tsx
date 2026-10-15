'use client'

import { useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { filterNetworkEvents, networkDate, networkDayLabel, networkMonthDays, networkMonthOffset } from '@/lib/sites/network-events'
import { NetworkCountdown } from './network-countdown'

export interface NetworkEventEntry {
  id: string
  day: string
  chapter: string | null
  title: string
  time: string
  href: string | null
  startsAt: string
  timeZone: string
  countdown: [number, number, number, number] | null
  card: ReactNode
}

/** The server keeps event cards and visibility decisions; this island filters only those public rows. */
export function NetworkEventsExplorer({ items, chapters, today, max, allLabel, empty, moreHref, moreLabel }: {
  items: NetworkEventEntry[]
  chapters: { label: string; tone: string }[]
  today: string
  max: number
  allLabel: string
  empty: string
  moreHref: string | null
  moreLabel: string
}) {
  const [chapter, setChapter] = useState<string | null>(null)
  const [day, setDay] = useState<string | null>(null)
  const [month, setMonth] = useState(today.slice(0, 7))
  const byChapter = filterNetworkEvents(items, chapter, null)
  const filtered = filterNetworkEvents(byChapter, null, day)
  const shown = filtered.slice(0, max)
  const next = filtered[0]
  const groups: { day: string; rows: NetworkEventEntry[] }[] = []
  for (const item of shown) {
    if (groups.at(-1)?.day === item.day) groups.at(-1)!.rows.push(item)
    else groups.push({ day: item.day, rows: [item] })
  }
  const dates = new Set(byChapter.map((item) => item.day))
  const monthLabel = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(networkDate(`${month}-01`))
  const selectedDay = day ?? today
  const dayEvents = byChapter.filter((item) => item.day === selectedDay).slice(0, 4)
  return <div className="nw-events">
    <div className="nw-events-list">
      {chapters.length > 0 && <ul className="nw-chiprow" aria-label="Chapters">
        <li data-all={chapter === null ? '' : undefined}><button type="button" aria-pressed={chapter === null} onClick={() => setChapter(null)}>{allLabel}</button></li>
        {chapters.map((item) => <li key={item.label} data-all={chapter === item.label ? '' : undefined} style={{ ['--c' as string]: item.tone }}>
          <button type="button" aria-pressed={chapter === item.label} onClick={() => setChapter(item.label)}><i aria-hidden />{item.label}<small>{items.filter((e) => e.chapter === item.label).length}</small></button>
        </li>)}
      </ul>}
      <p className="nw-count" role="status">{filtered.length} upcoming{day ? ` · ${networkDayLabel(day, today)}` : ''}{day && <button type="button" onClick={() => setDay(null)}>All dates</button>}</p>
      {groups.length === 0 && <p className="nw-empty">{empty}</p>}
      {groups.map((group) => <div key={group.day} className="nw-day"><h3 className="nw-day-h">{networkDayLabel(group.day, today)}</h3><ol>{group.rows.map((item) => item.card)}</ol></div>)}
      {moreHref && filtered.length > shown.length && <a className="nw-more" href={moreHref}><span>{moreLabel}</span><small>{filtered.length - shown.length} more</small></a>}
    </div>
    <aside className="nw-events-side">
      {next && <div className="nw-upnext"><span className="nw-upnext-k">Up next</span><b>{next.title}</b><small>{[networkDayLabel(next.day, today), next.time.split('–')[0], next.chapter].filter(Boolean).join(' · ')}</small>
        {next.countdown && <NetworkCountdown startsAt={next.startsAt} timeZone={next.timeZone} initial={next.countdown} label={`Time until ${next.title}`} />}
        {next.href && <a className="hs-btn hs-btn-primary" href={next.href}>I&apos;m coming</a>}
      </div>}
      <div className="nw-month">
        <div className="nw-month-controls"><button type="button" aria-label="Previous month" onClick={() => setMonth(networkMonthOffset(month, -1))}><ChevronLeft aria-hidden /></button><b className="nw-month-name">{monthLabel}</b><button type="button" aria-label="Next month" onClick={() => setMonth(networkMonthOffset(month, 1))}><ChevronRight aria-hidden /></button></div>
        <div className="nw-month-grid" role="group" aria-label={monthLabel}>
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((label, i) => <span key={`h${i}`} className="nw-month-dow" aria-hidden>{label}</span>)}
          {networkMonthDays(month).map((date) => <button key={date} type="button" className="nw-month-day" aria-label={`${date}${dates.has(date) ? ', events scheduled' : ', no events scheduled'}`} aria-pressed={day === date} disabled={date < today}
            data-out={date.slice(0, 7) !== month || undefined} data-today={date === today || undefined} data-has={dates.has(date) || undefined} onClick={() => setDay(day === date ? null : date)}>{+date.slice(8, 10)}</button>)}
        </div>
        {dayEvents.length > 0 && <div className="nw-month-list"><h4>{networkDayLabel(selectedDay, today)}</h4>{dayEvents.map((item) => <a key={item.id} href={item.href ?? undefined} style={{ ['--c' as string]: chapters.find((c) => c.label === item.chapter)?.tone ?? 'var(--color-primary)' }}><span><b>{item.title}</b><small>{[item.time.split('–')[0], item.chapter].filter(Boolean).join(' · ')}</small></span></a>)}</div>}
      </div>
    </aside>
  </div>
}
