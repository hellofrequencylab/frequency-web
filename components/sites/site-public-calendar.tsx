import { buildProgramYear, programHolidays, type ProgramEvent, type ProgramMonth } from '@/lib/spaces/leadership'
import { loadSpacePageDoc } from '@/lib/spaces/page-doc'
import { mensworkSeason, mensworkSign } from '@/lib/theme/menswork'
import { readSitePublicYear } from '@/lib/sites/site-admin'
import { SiteCalendar, retreatShort } from '@/components/sites/admin/site-calendar'

// THE PUBLIC YEARLY CALENDAR (LIVE-869, owner rulings 2026-10-08: a "Calendar" menu item that is a public
// yearly calendar for visitors, and "Add the calendar to the home page without an anchor link"). The admin
// calendar's look (components/sites/admin/site-calendar.tsx) over the Space's published, public events only
// (readSitePublicYear): no drafts and no gathering notes. A Menswork website draws it as its `calendar`
// page and as a section at the end of Home.

/** The website page that is the public calendar, when the Space lists it among its pages. */
export const SITE_CALENDAR_SLUG = 'calendar'

/** "Oct 29 – 31, 2027", the rail card's line. */
export const retreatDates = (e: ProgramEvent) => `${retreatShort(e).replace('–', ' – ')}, ${e.dayKey.slice(0, 4)}`

/** The year's retreat (the multi-day event named a retreat, else the first multi-day one) and its month. */
export function findRetreat(events: ProgramEvent[], months: ProgramMonth[]) {
  const event = events.find((e) => e.endDayKey && /\bretreat\b/i.test(e.title)) ?? events.find((e) => e.endDayKey)
  const month = event ? months.find((m) => event.dayKey.startsWith(`${m.year}-${String(m.month0 + 1).padStart(2, '0')}`)) : null
  return event && month ? { event, month } : null
}

export async function SitePublicCalendar({
  space,
  brandName,
  headingLevel,
}: {
  space: { id: string; preferences?: unknown }
  brandName: string
  headingLevel: 1 | 2
}) {
  const now = new Date()
  const { year, events } = await readSitePublicYear(space.id, now)
  const months = buildProgramYear(year, events, now)
  const retreat = findRetreat(events, months)
  return (
    <SiteCalendar
      brandName={brandName}
      year={year}
      months={months}
      currentSeason={mensworkSeason(now)}
      currentSign={mensworkSign(now)}
      holidays={programHolidays(year)}
      notes={new Map()}
      headingLevel={headingLevel}
      retreat={
        retreat
          ? {
              title: retreat.event.title,
              dates: retreatDates(retreat.event),
              monthId: retreat.month.id,
              photo: await pagePhoto(space.preferences, brandName, 'retreat'),
            }
          : null
      }
    />
  )
}

/** The first photo on the website page whose slug names `word` (the Desert Retreat page's hero), else null. */
export async function pagePhoto(preferences: unknown, brandName: string, word: string): Promise<string | null> {
  const pages = (preferences as { pages?: { slug?: unknown }[] } | null)?.pages ?? []
  const slug = pages.map((p) => (typeof p?.slug === 'string' ? p.slug : '')).find((s) => s.includes(word))
  if (!slug) return null
  const doc = await loadSpacePageDoc(preferences, brandName, slug)
  for (const block of doc.content ?? []) {
    const image = (block?.props as Record<string, unknown> | undefined)?.image
    if (typeof image === 'string' && /^https:\/\//.test(image)) return image.split('?')[0]
  }
  return null
}
