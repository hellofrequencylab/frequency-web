import Link from 'next/link'
import type { MensworkSeason } from '@/lib/theme/menswork'
import { SHORT_MONTH_LABELS, WEEKDAY_LABELS } from '@/lib/events/calendar-grid'
import {
  SEASON_INFO,
  type ProgramDay,
  type ProgramEventKind,
  type ProgramMonth,
} from '@/lib/spaces/leadership'

// THE YEARLY CALENDAR (LIVE-862), after the Hearts on Fire yearly calendar handoff, in DAWN tokens. A server
// component, no script: a month grid from md up and a day list below it, both from the same months
// (lib/spaces/leadership.ts buildProgramYear). Every event chip is the Space's own event and links to its
// page; the title only HINTS the chip's look (programEventKind), it never adds or hides one.

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const

/** The season colors, from the DAWN rank palette (the nearest hue to each Menswork season accent). */
const SEASON_BG: Record<MensworkSeason, string> = {
  winter: 'bg-rank-indigo',
  spring: 'bg-rank-jade',
  summer: 'bg-rank-gold',
  fall: 'bg-rank-clay',
}
const SEASON_TEXT: Record<MensworkSeason, string> = {
  winter: 'text-rank-indigo-deep',
  spring: 'text-rank-jade-deep',
  summer: 'text-rank-gold-deep',
  fall: 'text-rank-clay-deep',
}

const CHIP: Record<ProgramEventKind, string> = {
  course: 'bg-rank-gold text-on-rank',
  circle: 'border border-rank-teal text-text',
  gathering: 'border border-dashed border-border-strong text-text',
  retreat: 'bg-rank-clay text-on-rank',
  enroll: 'border-l-2 border-text text-muted',
  event: 'border border-border bg-surface-elevated text-text',
}

const KEY: { kind: ProgramEventKind; label: string }[] = [
  { kind: 'retreat', label: 'Retreat or multi-day' },
  { kind: 'course', label: 'Opening course' },
  { kind: 'circle', label: 'Circle Night' },
  { kind: 'gathering', label: 'Gathering' },
  { kind: 'enroll', label: 'Enrollment' },
  { kind: 'event', label: 'Other event' },
]

function SeasonRule({ day }: { day: ProgramDay }) {
  if (day.boundaryFrom) {
    return (
      <div className="flex h-1.5" aria-hidden>
        <span className={`w-1/2 ${SEASON_BG[day.boundaryFrom]}`} />
        <span className={`w-1/2 ${SEASON_BG[day.season]}`} />
      </div>
    )
  }
  return (
    <div className="flex h-1.5 items-start" aria-hidden>
      <span className={`h-0.5 w-full ${SEASON_BG[day.season]} ${day.isPast ? 'opacity-60' : ''}`} />
    </div>
  )
}

function DayMarks({ day }: { day: ProgramDay }) {
  return (
    <>
      {day.boundaryFrom && (
        <span className={`eyebrow ${SEASON_TEXT[day.season]}`}>
          {SEASON_INFO[day.season].name} begins
        </span>
      )}
      {day.signStart && (
        <span className="text-meta text-muted">
          <span aria-hidden className="mr-1 text-text">
            {day.signStart.glyph}
          </span>
          {day.signStart.name} season
        </span>
      )}
    </>
  )
}

function Chips({ day }: { day: ProgramDay }) {
  return (
    <>
      {day.events.map(({ event, kind, dayOf, days }) => (
        <Link
          key={`${event.slug}-${dayOf}`}
          href={`/events/${event.slug}`}
          className={`block rounded-control px-2 py-1 text-meta leading-snug hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring ${CHIP[kind]}`}
        >
          <span className={`block truncate font-semibold ${event.cancelled ? 'line-through' : ''}`}>{event.title}</span>
          <span className="flex flex-wrap gap-x-2 opacity-80">
            {days > 1 ? <span>Day {dayOf} of {days}</span> : event.timeLabel && <span>{event.timeLabel}</span>}
            {event.draft && <span>Draft</span>}
            {event.cancelled && <span>Cancelled</span>}
          </span>
        </Link>
      ))}
    </>
  )
}

function MonthHeader({ month }: { month: ProgramMonth }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-3">
      <h3 className="font-display text-page-title uppercase leading-none text-text">
        {MONTH_NAMES[month.month0]}{' '}
        <span className="text-body-sm font-semibold tracking-wide text-muted">
          {month.year}
          {month.leadIn ? ' · Lead-in' : ''}
        </span>
      </h3>
      <p className="flex flex-wrap items-center gap-2 eyebrow text-muted">
        {month.seasons.map((s, i) => (
          <span key={s} className="inline-flex items-center gap-1.5">
            {i > 0 && <span aria-hidden>to</span>}
            <span aria-hidden className={`inline-block h-2 w-4 ${SEASON_BG[s]}`} />
            {SEASON_INFO[s].name}
          </span>
        ))}
        <span aria-hidden>·</span>
        <span>
          {month.eventDays} {month.eventDays === 1 ? 'event day' : 'event days'}
        </span>
      </p>
    </div>
  )
}

function MonthGrid({ month }: { month: ProgramMonth }) {
  return (
    <div className="hidden md:block">
      <div className="grid grid-cols-7 pt-2 pb-1">
        {WEEKDAY_LABELS.map((w) => (
          <span key={w} className="px-2 eyebrow text-muted">
            {w}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-px border border-border bg-border">
        {month.weeks.flat().map((day, i) =>
          day ? (
            <div
              key={day.key}
              className={`flex min-h-28 min-w-0 flex-col ${day.isToday ? 'bg-surface-elevated ring-2 ring-inset ring-primary' : 'bg-surface'}`}
            >
              <SeasonRule day={day} />
              <div className={`flex flex-1 flex-col gap-1 px-2 pt-1 pb-2 ${day.isPast ? 'opacity-70' : ''}`}>
                <span className={`text-body-sm tabular-nums ${day.isToday ? 'font-bold text-primary-strong' : day.isPast ? 'text-muted' : 'text-text'}`}>
                  {String(day.day).padStart(2, '0')}
                  {day.isToday && <span className="ml-1.5 eyebrow">Today</span>}
                </span>
                <DayMarks day={day} />
                <Chips day={day} />
              </div>
            </div>
          ) : (
            <div key={`pad-${i}`} className="bg-canvas" aria-hidden />
          ),
        )}
      </div>
    </div>
  )
}

function MonthList({ month }: { month: ProgramMonth }) {
  const days = month.weeks.flat().filter((d): d is ProgramDay => !!d && (d.events.length > 0 || !!d.boundaryFrom || !!d.signStart || d.isToday))
  if (days.every((d) => d.events.length === 0)) {
    return <p className="py-3 text-body-sm text-muted md:hidden">No events this month.</p>
  }
  return (
    <ul className="mt-2 divide-y divide-border rounded-card border border-border md:hidden">
      {days.map((day) => (
        <li key={day.key} className={`grid grid-cols-[3.5rem_minmax(0,1fr)] ${day.isToday ? 'bg-surface-elevated' : 'bg-surface'}`}>
          <div className="border-r border-border py-3 pl-3">
            <span className="block eyebrow text-muted">{WEEKDAY_LABELS[day.weekday]}</span>
            <span className={`text-body-lg tabular-nums ${day.isToday ? 'font-bold text-primary-strong' : 'text-text'}`}>
              {String(day.day).padStart(2, '0')}
            </span>
          </div>
          <div className="min-w-0">
            <SeasonRule day={day} />
            <div className={`flex flex-col gap-1.5 px-3 py-2 ${day.isPast ? 'opacity-70' : ''}`}>
              {day.isToday && <span className="eyebrow text-primary-strong">Today</span>}
              <DayMarks day={day} />
              <Chips day={day} />
            </div>
          </div>
        </li>
      ))}
    </ul>
  )
}

export function YearCalendar({
  year,
  months,
  currentSeason,
  yearHref,
  eventCount,
}: {
  year: number
  months: ProgramMonth[]
  currentSeason: MensworkSeason
  yearHref: (y: number) => string
  eventCount: number
}) {
  // A season's card jumps to the month it starts in (the first boundary day), else the first month it shows.
  const seasonStart = (s: MensworkSeason) =>
    months.find((m) => m.weeks.flat().some((d) => d?.season === s && d.boundaryFrom))?.id ??
    months.find((m) => m.seasons.includes(s))?.id
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-body-sm text-muted">
          {eventCount === 0
            ? `No events on your calendar for ${year} yet. Add them from your Calendar and they show here.`
            : `${eventCount} ${eventCount === 1 ? 'event' : 'events'} from December ${year - 1} through December ${year}, drafts included.`}
        </p>
        <nav aria-label="Program year" className="flex items-center gap-3 text-body-sm font-semibold">
          <Link href={yearHref(year - 1)} className="text-primary-strong hover:underline">
            {year - 1}
          </Link>
          <span className="font-display text-lead text-text">{year}</span>
          <Link href={yearHref(year + 1)} className="text-primary-strong hover:underline">
            {year + 1}
          </Link>
        </nav>
      </div>

      <div className="grid gap-2 sm:grid-cols-4">
        {(Object.keys(SEASON_INFO) as MensworkSeason[]).map((s) => {
          const id = seasonStart(s)
          const body = (
            <>
              <span aria-hidden className={`block h-1.5 w-full ${SEASON_BG[s]} ${s === currentSeason ? '' : 'opacity-60'}`} />
              <span className="mt-2 flex items-baseline justify-between gap-2">
                <span className={`font-display text-lead uppercase ${s === currentSeason ? SEASON_TEXT[s] : 'text-text'}`}>
                  {SEASON_INFO[s].name}
                </span>
                {s === currentSeason && <span className="eyebrow text-text">Now</span>}
              </span>
              <span className="block eyebrow text-muted">{SEASON_INFO[s].range}</span>
            </>
          )
          return id ? (
            <a key={s} href={`#${id}`} className={`block rounded-card border border-border p-3 hover:bg-surface-elevated ${s === currentSeason ? 'bg-surface-elevated' : 'bg-surface'}`}>
              {body}
            </a>
          ) : (
            <div key={s} className="rounded-card border border-border bg-surface p-3">
              {body}
            </div>
          )
        })}
      </div>

      <nav aria-label="Months" className="flex flex-wrap gap-1">
        {months.map((m) => (
          <a
            key={m.id}
            href={`#${m.id}`}
            className="rounded-control border border-border bg-surface px-2.5 py-1 eyebrow text-muted hover:text-text"
          >
            {SHORT_MONTH_LABELS[m.month0]}
            {m.leadIn ? ` '${String(m.year).slice(2)}` : ''}
          </a>
        ))}
      </nav>

      <ul aria-label="Key" className="flex flex-wrap gap-2">
        {KEY.map((k) => (
          <li key={k.kind} className={`rounded-control px-2 py-0.5 text-meta ${CHIP[k.kind]}`}>
            {k.label}
          </li>
        ))}
        <li className="px-2 py-0.5 text-meta text-muted">
          <span aria-hidden className="mr-1 text-text">{'♎︎'}</span>
          Sign begins
        </li>
      </ul>

      {months.map((m) => (
        <section key={m.id} id={m.id} aria-label={`${MONTH_NAMES[m.month0]} ${m.year}`} className="scroll-mt-24">
          <MonthHeader month={m} />
          <MonthGrid month={m} />
          <MonthList month={m} />
        </section>
      ))}
    </div>
  )
}
