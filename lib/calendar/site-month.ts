import type { CalendarEvent } from './item'
import { monthGridWindow } from './month-window'
import { shiftMonth } from './planner/month'

// THE WEBSITE MONTH'S DATA (calendar suite pass 10). What a hosted Space website's month grid may draw,
// and the arithmetic it draws with. Pure, so the public-only rule is one tested place.
//
// PUBLIC ONLY. The feed the server hands the grid is already gated (guestLiveItems), and this is the second
// lock: an item is kept only when it is a published gathering (the events layer), a called-off one, or an
// Unavailable span (times only). A Pencil, a Plan, a Production date, a to-do, a Shared-layer item or a
// private entry never survives, whatever the feed above it let through, and what does survive is rebuilt
// from a whitelist of fields so no note, edit link, description or entry input rides to the browser.

/** What the website month draws a day item as. */
type SiteItemKind = 'event' | 'cancelled' | 'unavailable'

export interface SiteMonthItem {
  kind: SiteItemKind
  /** The public fields the preview popup reads, and nothing else. */
  item: CalendarEvent
}

/** Stages that are the team's working records, never a visitor's. */
const TEAM_STAGES = new Set(['pencil', 'planning', 'production'])

/** The item as a visitor may hold it: public fields only. */
function publicFields(e: CalendarEvent): CalendarEvent {
  return {
    slug: e.slug,
    title: e.title,
    dayKey: e.dayKey,
    endDayKey: e.endDayKey ?? null,
    timeLabel: e.timeLabel,
    endTimeLabel: e.endTimeLabel ?? null,
    whenLabel: e.whenLabel,
    startInstantIso: e.startInstantIso,
    location: e.location,
    goingCount: e.goingCount,
    coverUrl: e.coverUrl,
    coverFocus: e.coverFocus ?? null,
    isCancelled: e.isCancelled,
    seriesKey: e.seriesKey ?? null,
    isLaterDate: e.isLaterDate ?? false,
    layer: e.layer ?? 'events',
    publicationState: 'published',
  }
}

/** Every item a visitor may see, in day order, rebuilt from public fields. */
export function publicSiteItems(items: readonly CalendarEvent[]): SiteMonthItem[] {
  const out: SiteMonthItem[] = []
  for (const e of items) {
    const layer = e.layer ?? 'events'
    if (layer !== 'events' && layer !== 'unavailable') continue
    if (e.stage && TEAM_STAGES.has(e.stage)) continue
    if (e.planId || e.entryId || e.optionGroup) continue
    const item = publicFields(e)
    if (layer === 'unavailable') {
      // Times only: the span's own title is never printed on a site.
      out.push({ kind: 'unavailable', item: { ...item, title: 'Unavailable', location: null, coverUrl: null, goingCount: 0 } })
    } else out.push({ kind: e.isCancelled ? 'cancelled' : 'event', item })
  }
  return out.sort((a, b) => a.item.dayKey.localeCompare(b.item.dayKey) || a.item.timeLabel.localeCompare(b.item.timeLabel))
}

/** The last day an item stands on. */
const lastDay = (e: CalendarEvent) => (e.endDayKey && e.endDayKey > e.dayKey ? e.endDayKey : e.dayKey)

/** The items standing on one day, a run of days included. */
export function siteDayItems(items: readonly SiteMonthItem[], day: string): SiteMonthItem[] {
  return items.filter((i) => i.item.dayKey <= day && day <= lastDay(i.item))
}

/** The days of a month that have something, each with its items: the Agenda's rows. */
export function siteMonthAgenda(items: readonly SiteMonthItem[], ym: string): { day: string; items: SiteMonthItem[] }[] {
  const days = new Map<string, SiteMonthItem[]>()
  for (const i of items) {
    // Only the first day of a run is a row (a retreat is one line, not five); a run that began in an
    // earlier month is listed on the 1st.
    const day = i.item.dayKey.slice(0, 7) < ym ? `${ym}-01` : i.item.dayKey
    if (day.slice(0, 7) !== ym || day > lastDay(i.item)) continue
    days.set(day, [...(days.get(day) ?? []), i])
  }
  return [...days.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, rows]) => ({ day, items: rows }))
}

/** The span of months the website loads, and the days to read them over. A read that hit the store's
 *  cap only holds the months before the last row's, so the grid stops there rather than draw a month
 *  that would look empty and read as true. */
export function siteWindow(openYm: string, throughDay: string | null) {
  const minYm = shiftMonth(openYm, -2)
  const wantYm = shiftMonth(openYm, 12)
  const capYm = throughDay ? shiftMonth(throughDay.slice(0, 7), -1) : wantYm
  const maxYm = capYm < openYm ? openYm : capYm < wantYm ? capYm : wantYm
  const { fromDay } = monthGridWindow(Number(minYm.slice(0, 4)), Number(minYm.slice(5, 7)))
  const { toDay } = monthGridWindow(Number(wantYm.slice(0, 4)), Number(wantYm.slice(5, 7)))
  return { minYm, maxYm, fromDay, toDay }
}
