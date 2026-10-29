import { ArrowRight, Calendar as CalendarIcon } from 'lucide-react'
import type { ComponentConfig } from '@/lib/page-editor/types'
import { type SiteLinkMap } from '@/lib/sites/house-theme'
import { InlineText } from '@/components/sites/inline-text'
import { FreeHumanGlyph } from '@/components/sites/free-human-glyph'
import { FreeHumanMoon } from '@/components/sites/free-human-moon'
import { FreeHumanLetterForm } from '@/components/sites/free-human-letter-form'
import { FreeHumanCalendarView } from '@/components/sites/free-human-calendar-view'
import { freeHumanOccurrences } from '@/lib/sites/free-human-events'
import { freeHumanKindMeta, freeHumanWhen, FREE_HUMAN_KINDS, type FreeHumanOcc } from '@/lib/sites/free-human-calendar'
import { freeHumanMoon, freeHumanSeason } from '@/lib/sites/free-human-sky'
import { FREE_HUMAN_CALENDAR, FREE_HUMAN_CALENDAR_HERO } from '@/lib/sites/free-human-home'
import { LINK_HINT, VOICE_HINT, area, block, cls, hrefOf, rel, str, text, type Common } from './midnight'
import { Ground, groundFields } from './free-human'

// ── The Free Human Calendar blocks (design: templates/website/Calendar.dc.html) ─────────────────────────────
// The hero with the next gathering, the season and the moon, and the Calendar: the three nearest dates, then the month and agenda
// views with the kind filters and a closing band for the letter and the feed. The Year Wheel is its own block
// (./free-human-wheel.tsx). Both read the Space's own events from `puck.metadata.space` and expand its series across the next
// thirteen months. Every look is the Free Human skin's (components/sites/free-human-calendar-css.ts), tokens only.

const MONTHS_AHEAD = 13

type Space = { events?: unknown; series?: unknown } | undefined

const linksOf = (metadata: Common['metadata']) => metadata?.links as SiteLinkMap | undefined
const pageOf = (metadata: Common['metadata']) => (e: { slug?: string | null }) => {
  if (!e.slug) return ''
  const origin = linksOf(metadata)?.origin
  return origin ? `${origin}/events/${e.slug}` : `/events/${e.slug}`
}
/** The Space's iCal feed, when the site knows its own origin. */
const feedOf = (metadata: Common['metadata']) => {
  const l = linksOf(metadata)
  return l?.origin && l.slug ? `${l.origin}/spaces/${l.slug}/calendar.ics` : null
}

const dayLine = (o: FreeHumanOcc) => freeHumanWhen(o).split(' · ')[0]

// ── Hero ─────────────────────────────────────────────────────────────────────────────────────

function CalendarHero({ p, metadata, now, pad, vis }: Common) {
  const at = now ?? new Date()
  const occs = freeHumanOccurrences(metadata?.space as Space, at, MONTHS_AHEAD, pageOf(metadata))
  const next = occs.find((o) => o.kind !== 'circle') ?? occs[0]
  const moon = freeHumanMoon(at)
  const season = freeHumanSeason(at.getUTCMonth())
  const feed = feedOf(metadata)
  const to = hrefOf(str(p.primaryHref) || '#month-by-month', metadata)
  return (
    <Ground p={p} name="cal-hero" pad={pad} vis={vis}>
      <div className="fh-row">
        <div className="fhc-hero-copy">
          {str(p.eyebrow) && <div className="fhc-live"><span className="fhc-pulse" aria-hidden="true"><i /><i /></span>{str(p.eyebrow)}</div>}
          <h1 className="fh-hero-title"><InlineText text={str(p.title)} /></h1>
          {str(p.lead) && <p className="fh-hero-lead">{str(p.lead)}</p>}
          <div className="fh-actions">
            {to && str(p.primaryLabel) && <a className="hs-btn hs-btn-primary" href={to} {...rel(to)}><span>{str(p.primaryLabel)}</span><ArrowRight size={16} strokeWidth={1.5} aria-hidden="true" /></a>}
            {feed && str(p.feedLabel) && <a className="hs-btn hs-btn-ghost" href={feed}><CalendarIcon size={16} strokeWidth={1.5} aria-hidden="true" /><span>{str(p.feedLabel)}</span></a>}
          </div>
        </div>
        <div className="fhc-status">
          <div className="fhc-stat">
            <span className="fhc-stat-k">Next</span>
            <span className="fhc-stat-mark"><FreeHumanGlyph name={next ? freeHumanKindMeta(next.kind).glyph : 'gathering'} size={22} /></span>
            <span className="fhc-stat-v">{next ? next.title : str(p.nextEmpty) || 'Dates to come'}</span>
            <span className="fhc-stat-s">{next ? dayLine(next) : str(p.nextEmptyNote) || 'Soon'}</span>
          </div>
          <div className="fhc-stat">
            <span className="fhc-stat-k">Season</span>
            <span className="fhc-stat-mark"><FreeHumanGlyph name="olive" size={22} /></span>
            <span className="fhc-stat-v">{season.name}</span>
            <span className="fhc-stat-s">Module: {season.module}</span>
          </div>
          <div className="fhc-stat">
            <span className="fhc-stat-k">Moon</span>
            <span className="fhc-stat-mark"><FreeHumanMoon phase={moon.phase} size={22} /></span>
            <span className="fhc-stat-v">{moon.name}</span>
            <span className="fhc-stat-s">{moon.nextLine}</span>
          </div>
        </div>
      </div>
    </Ground>
  )
}

// ── Calendar ─────────────────────────────────────────────────────────────────────────────────

function Calendar({ p, metadata, now, pad, vis }: Common) {
  const at = now ?? new Date()
  const occs = freeHumanOccurrences(metadata?.space as Space, at, MONTHS_AHEAD, pageOf(metadata))
  const today = at.toISOString().slice(0, 10)
  const featured = occs.filter((o) => o.kind !== 'circle').slice(0, 3)
  const filters = Array.isArray(p.filters) ? (p.filters as unknown[]).map(str).filter(Boolean) : ['all']
  const feed = feedOf(metadata)
  const slug = linksOf(metadata)?.slug ?? null
  const moon = freeHumanMoon(at)
  return (
    <>
      <Ground p={p} name="calendar" pad={cls(pad, 'fhc-paper')} vis={vis}>
        <div className="fh-row" id="month-by-month">
          <div className="fhc-head">
            <div className="fhc-sun" aria-hidden="true"><div className="fh-rays fh-turn" /><div className="fh-halo fh-breathe" /></div>
            {str(p.eyebrow) && <span className="fh-eyebrow">{str(p.eyebrow)}</span>}
            {str(p.title) && <h2 className="fh-sec-title"><InlineText text={str(p.title)} /></h2>}
          </div>
          {featured.length > 0 && (
            <div className="fhc-featured">
              {featured.map((o) => (
                <a key={o.id} className="fhc-feat" href={o.href || '#month-by-month'}>
                  <span className="fhc-feat-seal"><i className="fh-halo" aria-hidden="true" /><span><FreeHumanGlyph name={freeHumanKindMeta(o.kind).glyph} size={24} /></span></span>
                  <span className="fhc-feat-when">{`${dayLine(o).replace(', ', ' · ')} · ${freeHumanKindMeta(o.kind).label}`}</span>
                  <span className="fhc-feat-title">{o.title}</span>
                  <span className="fhc-feat-meta">{[o.place, o.price].filter(Boolean).join(' · ')}</span>
                  <em>Details →</em>
                </a>
              ))}
            </div>
          )}
          <FreeHumanCalendarView
            occs={occs}
            today={today}
            defaultView={str(p.defaultView) === 'agenda' ? 'agenda' : 'month'}
            filters={filters.length ? filters : ['all']}
            collapseRecurring={p.collapseRecurring !== false}
            wheel={p.wheel !== false}
            empty={str(p.empty)}
            note={str(p.note)}
            buttonLabel={str(p.buttonLabel)}
          />
        </div>
      </Ground>
      {str(p.closingTitle) && (
        <section className="fh-sec fhc-closing fh-sanctuary fh-grain fh-flow" data-ground="night">
          <div className="fh-ground-tex fh-tex-fire-light" data-tex="fire" aria-hidden="true" />
          <div className="fh-row">
            <div className="fhc-closing-moon" aria-hidden="true"><div className="fh-rays fh-turn" /><div className="fh-halo fh-breathe" /><FreeHumanMoon phase={moon.phase} size={150} /></div>
            <div className="fhc-closing-copy">
              <span className="fh-eyebrow">{`${str(p.closingEyebrow) || 'The turning'} · ${moon.name}`}</span>
              <h2 className="fh-sec-title"><InlineText text={str(p.closingTitle)} /></h2>
              {str(p.closingLead) && <p>{str(p.closingLead)}</p>}
              <FreeHumanLetterForm slug={slug} label="Email" placeholder="you@email.com" buttonLabel={str(p.closingButton) || 'Subscribe'} successMessage={str(p.closingDone) || 'Thank you. You are on the list.'} />
              {feed && str(p.subscribeLabel) && <a className="hs-btn hs-btn-ghost fhc-feed" href={feed}><CalendarIcon size={16} strokeWidth={1.5} aria-hidden="true" /><span>{str(p.subscribeLabel)}</span></a>}
            </div>
          </div>
        </section>
      )}
    </>
  )
}

// ── Registry ─────────────────────────────────────────────────────────────────────────────────

export const freeHumanCalendarBlocks: Record<string, ComponentConfig> = {
  FreeHumanCalendarHero: block('Free Human calendar hero (live)', {
    ...groundFields, eyebrow: text('Small label'), title: area('Heading', VOICE_HINT), lead: area('Line under the heading'),
    primaryLabel: text('Button'), primaryHref: text('Button: where it goes', `${LINK_HINT} Empty goes to the dates below.`), feedLabel: text('Calendar feed link'),
    nextEmpty: text('Next, when nothing is scheduled'), nextEmptyNote: text('Next, when nothing is scheduled: line under'),
  }, FREE_HUMAN_CALENDAR_HERO, CalendarHero),
  FreeHumanCalendar: block('Free Human calendar (live)', {
    ...groundFields, eyebrow: text('Small label'), title: area('Heading', VOICE_HINT),
    defaultView: { type: 'select', label: 'Opens on', options: [{ label: 'Month', value: 'month' }, { label: 'Agenda', value: 'agenda' }] },
    wheel: { type: 'radio', label: 'Offer "See it on the wheel"', options: [{ label: 'Yes', value: true }, { label: 'No', value: false }] },
    filters: { type: 'array', label: 'Filters', arrayFields: {}, getItemSummary: (it: unknown) => String(it), hint: `all, ${FREE_HUMAN_KINDS.map((k) => k.id).join(', ')}` },
    collapseRecurring: { type: 'radio', label: 'Show a recurring series once in the agenda', options: [{ label: 'Yes', value: true }, { label: 'No', value: false }] },
    empty: text('When nothing is open'), note: text('Line under the key'), buttonLabel: text('Reserve button'), subscribeLabel: text('Calendar feed link'),
    closingEyebrow: text('Closing band: small label'), closingTitle: area('Closing band: heading (empty hides the band)', VOICE_HINT), closingLead: area('Closing band: line'),
    closingButton: text('Closing band: button'), closingDone: text('Closing band: after it is sent'),
  }, FREE_HUMAN_CALENDAR, Calendar),
}
