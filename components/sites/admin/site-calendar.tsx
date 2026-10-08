import Link from 'next/link'
import type { CSSProperties } from 'react'
import { MENSWORK_SIGNS, type MensworkSeason, type MensworkSign } from '@/lib/theme/menswork'
import {
  SEASON_INFO,
  courseChipTitle,
  type ProgramDay,
  type ProgramEvent,
  type ProgramEventKind,
  type ProgramMonth,
} from '@/lib/spaces/leadership'
import { ScrollWave } from './scroll-wave'
import { SITE_ADMIN_CSS } from './site-admin-css'

// THE YEARLY CALENDAR ON THE WEBSITE (LIVE-864): the design system's calendar template
// (website/calendar/Calendar.jsx), drawn from the Space's own events laid over the program's seasons and
// signs (lib/spaces/leadership.ts buildProgramYear). Server-rendered: the rail, the season strip (under
// 1180px) and the phone list (under 760px) are all in the HTML and CSS picks one; the month scroll-spy is
// the only script. The prototype's "preview today as" control is dropped, as its handoff says: today is today.

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const MON3 = MONTHS.map((m) => m.slice(0, 3))
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const ORDER: MensworkSeason[] = ['winter', 'spring', 'summer', 'fall']
const N46 = 46 * 0.289

const sc = (s: MensworkSeason) => ({ '--sc': `var(--hof-${s})` }) as CSSProperties
const range = (s: MensworkSeason) => SEASON_INFO[s].range.replace(' to ', ' – ')
const two = (n: number) => String(n).padStart(2, '0')

export interface SiteCalendarProps {
  brandName: string
  year: number
  months: ProgramMonth[]
  currentSeason: MensworkSeason
  currentSign: MensworkSign
  holidays: Map<string, string>
  /** Gathering notes by event slug ("Imbolc · mid-Aquarius"). */
  notes: Map<string, string>
  retreat: { title: string; dates: string; monthId: string; photo: string | null } | null
  overviewHref: string
}

export function SiteCalendar(p: SiteCalendarProps) {
  const { months, year } = p
  const seasonStart = (s: MensworkSeason) =>
    s === 'winter' ? months[0]?.id : months.find((m) => m.year === year && m.month0 === { spring: 2, summer: 5, fall: 8 }[s])?.id
  const sample = (kind: ProgramEventKind) => {
    for (const m of months) for (const w of m.weeks) for (const d of w) for (const e of d?.events ?? []) if (e.kind === kind) return e.event
    return null
  }
  const course = sample('course')
  const circle = sample('circle')
  const gathering = sample('gathering')
  const enroll = sample('enroll')

  return (
    <div className="hfa">
      <style>{SITE_ADMIN_CSS}</style>
      <header className="hfa-head">
        <div className="hfa-head-in cal">
          <Link className="hfa-brand" href="/">
            <span className="hfa-word">{p.brandName}</span>
            <span className="hfa-divider" />
            <span className="hfa-title">Yearly Calendar</span>
          </Link>
          <nav className="hfa-nav" aria-label="Admin">
            <a className="mono-link" href={p.overviewHref}>
              Executive Overview
            </a>
            <Link className="mono-link" href="/">
              ← Website
            </Link>
          </nav>
        </div>
      </header>
      <nav className="cal-strip" aria-label="Seasons">
        {ORDER.map((s) => (
          <a key={s} href={`#${seasonStart(s) ?? ''}`} className={s === p.currentSeason ? 'on' : undefined} style={sc(s)}>
            <i />
            <span className="lbl">{SEASON_INFO[s].name}</span>
          </a>
        ))}
      </nav>
      <div className="cal-body">
        <aside className="cal-rail">
          <div className="cal-year">
            <span className="lbl">The year</span>
            <b>{year}</b>
          </div>
          <nav className="cal-seasons" aria-label="Seasons">
            {ORDER.map((s) => {
              const on = s === p.currentSeason
              return (
                <a key={s} href={`#${seasonStart(s) ?? ''}`} className={`cal-season${on ? ' on' : ''}`} style={sc(s)}>
                  <i />
                  <span>
                    <span className="nm">
                      <b>{SEASON_INFO[s].name}</b>
                      {on && <span className="lbl">Now</span>}
                    </span>
                    <span className="lbl">{range(s)}</span>
                  </span>
                </a>
              )
            })}
          </nav>
          {p.retreat && (
            <a className="retreat-card" href={`#${p.retreat.monthId}`} style={{ marginTop: 0, padding: p.retreat.photo ? '0 14px 12px' : undefined }}>
              {p.retreat.photo && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.retreat.photo} alt="" style={{ marginTop: 0 }} />
              )}
              <span className="t">{p.retreat.title}</span>
              <span className="d">{p.retreat.dates} →</span>
            </a>
          )}
          <div className="cal-months">
            <span className="lbl">Months</span>
            <div>
              {months.map((m) => (
                <a key={m.id} href={`#${m.id}`} data-mk={m.id}>
                  {MON3[m.month0]}
                  {m.leadIn ? ` '${String(m.year).slice(2)}` : ''}
                </a>
              ))}
            </div>
          </div>
          <div className="cal-key">
            <span className="lbl">Key · loudest first</span>
            {p.retreat && <span className="key-retreat">{p.retreat.title}</span>}
            {course && <HofChip brand={p.brandName} event={course} />}
            {circle && <CircleChip event={circle} />}
            {gathering && <GatherChip event={gathering} note={null} />}
            {enroll && <EnrollMark title={enroll.title} />}
            <SignMark sign={p.currentSign} />
            <span className="holiday">Holiday</span>
          </div>
        </aside>
        <main style={{ minWidth: 0 }}>
          {months.map((m) => (
            <MonthBlock key={m.id} month={m} {...p} />
          ))}
        </main>
      </div>
      <ScrollWave mode="months" />
    </div>
  )
}

function monthCount(m: ProgramMonth): number {
  let n = 0
  for (const w of m.weeks)
    for (const d of w) {
      if (!d) continue
      if (d.events.some((e) => e.kind !== 'enroll' && e.kind !== 'retreat')) n++
      n += d.events.filter((e) => e.kind === 'retreat' && e.dayOf === 1).length
    }
  return n
}

function MonthBlock({ month: m, ...p }: { month: ProgramMonth } & SiteCalendarProps) {
  const boundary = m.weeks.flat().find((d) => d?.boundaryFrom)
  const enroll = m.leadIn ? m.weeks.flat().find((d) => d?.events.some((e) => e.kind === 'enroll')) : null
  const enrollEvent = enroll?.events.find((e) => e.kind === 'enroll')?.event
  return (
    <section id={m.id} className="month" data-month={m.id}>
      <div className="month-head">
        <div className="top">
          <div className="nm">
            <h2>{MONTHS[m.month0]}</h2>
            <span className="yr">
              {m.year}
              {m.leadIn ? ' · Lead-in' : ''}
            </span>
          </div>
          <div className="sz">
            <span>
              {m.seasons.map((s, i) => (
                <span key={s} style={{ display: 'contents' }}>
                  {i > 0 && <span className="lbl">→</span>}
                  <span className="sw" style={sc(s)}>
                    <i />
                    <span className="lbl">{SEASON_INFO[s].name}</span>
                  </span>
                </span>
              ))}
              {boundary && (
                <span className="lbl">
                  · {MON3[m.month0]} {boundary.day}
                </span>
              )}
            </span>
            <span className="lbl">
              {enroll && enrollEvent
                ? `${enrollEvent.title} ${MON3[m.month0]} ${enroll.day}`
                : m.leadIn && !monthCount(m)
                  ? ''
                  : `${two(monthCount(m))} sessions`}
            </span>
          </div>
        </div>
        <div className="dow">
          {DOW.map((d) => (
            <span key={d} className="lbl">
              {d}
            </span>
          ))}
        </div>
      </div>
      <div className="weeks">
        {m.weeks.map((w, i) => (
          <div key={i} className="week">
            {w.map((d, j) => (d ? <DayCell key={j} day={d} {...p} /> : <div key={j} className="pad" />))}
            <RetreatBar week={w} />
          </div>
        ))}
      </div>
      <MobileMonth month={m} {...p} />
    </section>
  )
}

function SeasonRule({ day }: { day: ProgramDay }) {
  if (day.boundaryFrom)
    return (
      <div className="rule split" style={{ '--sf': `var(--hof-${day.boundaryFrom})`, ...sc(day.season) } as CSSProperties}>
        <i />
      </div>
    )
  return (
    <div className="rule" style={sc(day.season)}>
      <i />
    </div>
  )
}

function DayCell({ day, brandName, holidays, notes }: { day: ProgramDay } & SiteCalendarProps) {
  const holiday = holidays.get(day.key)
  const inRetreat = day.events.some((e) => e.kind === 'retreat')
  const chips = day.events.filter((e) => e.kind !== 'retreat')
  const empty = !day.events.length && !day.signStart && !holiday && !day.boundaryFrom && !day.isToday
  return (
    <div className={`day${day.isToday ? ' today' : ''}${day.isPast ? ' past' : ''}`}>
      <SeasonRule day={day} />
      <div className="day-in">
        <div className="dn">
          {day.isToday ? (
            <span className="tchip">
              <b>{two(day.day)}</b>
              <span className="lbl">Today</span>
            </span>
          ) : (
            <span>{two(day.day)}</span>
          )}
        </div>
        {day.boundaryFrom && (
          <span className="begins" style={sc(day.season)}>
            {SEASON_INFO[day.season].name} begins
          </span>
        )}
        {day.signStart && <SignMark sign={day.signStart} />}
        {inRetreat && <div className="spacer" />}
        {chips.map((e, i) => (
          <Chip key={i} kind={e.kind} event={e.event} brand={brandName} note={notes.get(e.event.slug) ?? null} />
        ))}
        <div className="grow" />
        {holiday && <span className="holiday">{holiday}</span>}
      </div>
      {empty && !day.isPast && (
        <svg className="empty" width="10" height="9" viewBox="0 0 10 9" aria-hidden="true">
          <polygon points="0.5,8.5 9.5,8.5 5,0.7" fill="none" stroke="var(--hof-hairline)" />
        </svg>
      )}
    </div>
  )
}

function Chip({ kind, event, brand, note }: { kind: ProgramEventKind; event: ProgramEvent; brand: string; note: string | null }) {
  if (kind === 'course') return <HofChip brand={brand} event={event} />
  if (kind === 'gathering') return <GatherChip event={event} note={note} />
  if (kind === 'enroll') return <EnrollMark title={event.title} />
  return <CircleChip event={event} />
}

const state = (e: ProgramEvent) => `${e.draft ? ' draft' : ''}${e.cancelled ? ' cancelled' : ''}`

function HofChip({ brand, event }: { brand: string; event: ProgramEvent }) {
  return (
    <div className={`chip hof${state(event)}`} title={event.title}>
      <span className="l1">{brand}</span>
      <span className="l2">
        <b>{courseChipTitle(event.title)}</b>
        {event.timeLabel && <span className="tm">{event.timeLabel}</span>}
      </span>
    </div>
  )
}

function CircleChip({ event }: { event: ProgramEvent }) {
  return (
    <div className={`chip circle${state(event)}`} title={event.title}>
      <b>{event.title}</b>
      {event.timeLabel && <span className="tm">{event.timeLabel}</span>}
    </div>
  )
}

function GatherChip({ event, note }: { event: ProgramEvent; note: string | null }) {
  return (
    <div className="gather" title={event.title}>
      <span className="l1">Pencilled in</span>
      <b>{event.title}</b>
      {note && <small>{note}</small>}
    </div>
  )
}

function EnrollMark({ title }: { title: string }) {
  return (
    <span className="enroll">
      <i />
      <span>{title}</span>
    </span>
  )
}

function SignMark({ sign }: { sign: MensworkSign | (typeof MENSWORK_SIGNS)[number] }) {
  return (
    <span className="sign">
      <b>{sign.glyph}</b>
      {sign.name} Season
    </span>
  )
}

/** The retreat as one band across the week row, with flat joins where it wraps and chevrons only at its
 *  overall start and end, overhanging 14px into the neighbouring cells (6px in from the grid's edge). */
function RetreatBar({ week }: { week: (ProgramDay | null)[] }) {
  const idx = week.map((d, i) => (d?.events.some((e) => e.kind === 'retreat') ? i : -1)).filter((i) => i >= 0)
  if (!idx.length) return null
  const a = idx[0]
  const span = idx.length
  const startDay = week[a]!.events.find((e) => e.kind === 'retreat')!
  const endDay = week[idx[idx.length - 1]]!.events.find((e) => e.kind === 'retreat')!
  const first = startDay.dayOf === 1
  const last = endDay.dayOf === endDay.days
  const past = !!week[idx[idx.length - 1]]?.isPast && last
  const n = N46.toFixed(2)
  const poly = `polygon(0 0,${last ? `calc(100% - ${n}px) 0,100% 50%,calc(100% - ${n}px) 100%` : '100% 0,100% 100%'},0 100%${first ? `,${n}px 50%` : ''})`
  const L = first ? (a === 0 ? 6 : -14) : 0
  const R = last ? (a + span === 7 ? -6 : 14) : 0
  const title = startDay.event.title
  return (
    <div
      className={`bar${past ? ' past' : ''}`}
      style={{ left: `calc(${(a / 7) * 100}% + ${L}px)`, width: `calc(${(span / 7) * 100}% + ${R - L}px)` }}
      aria-hidden="true"
    >
      <div style={{ clipPath: poly, padding: `0 ${last ? N46 + 12 : 14}px 0 ${first ? N46 + 12 : 14}px` }}>
        {first ? (
          <>
            <span className="t1">{title}</span>
            <span className="d">{retreatShort(startDay.event)}</span>
          </>
        ) : (
          <>
            <span className="t2">{title.split(/\s+/).pop()}</span>
            <span className="d">Day {startDay.dayOf}</span>
          </>
        )}
      </div>
    </div>
  )
}

/** "Oct 29–31" from a multi-day event's day keys. */
export function retreatShort(e: Pick<ProgramEvent, 'dayKey' | 'endDayKey'>): string {
  const [, m, d] = e.dayKey.split('-').map(Number)
  if (!e.endDayKey) return `${MON3[m - 1]} ${d}`
  const [, m2, d2] = e.endDayKey.split('-').map(Number)
  return m2 === m ? `${MON3[m - 1]} ${d}–${d2}` : `${MON3[m - 1]} ${d} – ${MON3[m2 - 1]} ${d2}`
}

function MobileMonth({ month: m, brandName, holidays, notes }: { month: ProgramMonth } & SiteCalendarProps) {
  const rows = m.weeks
    .map((w) => w.filter((d): d is ProgramDay => !!d && (d.events.length > 0 || !!d.signStart || !!d.boundaryFrom || holidays.has(d.key) || d.isToday)))
    .filter((w) => w.length)
  return (
    <div className="mlist">
      {!rows.length && <div className="mnone lbl">No sessions this month</div>}
      {rows.map((w, i) => (
        <div key={i} className="grid1">
          {w.map((d) => {
            const retreat = d.events.find((e) => e.kind === 'retreat')
            return (
              <div key={d.key} className={`mrow${d.isToday ? ' today' : ''}${d.isPast ? ' past' : ''}`}>
                <div className="md">
                  <span className="lbl">{DOW[d.weekday]}</span>
                  <b>{two(d.day)}</b>
                </div>
                <div>
                  <SeasonRule day={d} />
                  <div className="mc">
                    {d.isToday && <span className="lbl" style={{ color: 'var(--text-link)' }}>Today</span>}
                    {d.boundaryFrom && (
                      <span className="begins" style={sc(d.season)}>
                        {SEASON_INFO[d.season].name} begins
                      </span>
                    )}
                    {d.signStart && <SignMark sign={d.signStart} />}
                    {retreat && (
                      <div className="mretreat">
                        <b>{retreat.event.title}</b>
                        <span>
                          DAY {retreat.dayOf}/{retreat.days}
                        </span>
                      </div>
                    )}
                    {d.events
                      .filter((e) => e.kind !== 'retreat')
                      .map((e, k) => (
                        <Chip key={k} kind={e.kind} event={e.event} brand={brandName} note={notes.get(e.event.slug) ?? null} />
                      ))}
                    {holidays.has(d.key) && <span className="holiday">{holidays.get(d.key)}</span>}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
