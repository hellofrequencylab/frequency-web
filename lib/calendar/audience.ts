// WHO THE CALENDAR IS FOR (owner ruling 2026-10-29): the calendar is role based. A Space's admins get the
// Space's own calendar page with the sort functions on it, and the full manager one link away; everyone else gets the public calendar. An admin can look at the public one
// the way a visitor does and come back. Two addresses, one control, no state to keep: the suite lives at
// the console route, the public calendar at the Space's own Calendar tab, and each carries a link to the
// other that only an admin is ever shown.

export type CalendarAudience = 'team' | 'public'

interface AudienceLink {
  href: string
  label: string
}

export function audienceHref(slug: string, audience: CalendarAudience): string {
  return audience === 'team' ? `/spaces/${slug}/settings/calendar` : `/spaces/${slug}/calendar?as=public`
}

export function audienceLinks(slug: string): AudienceLink[] {
  return [
    { href: audienceHref(slug, 'team'), label: 'Team view' },
    { href: audienceHref(slug, 'public'), label: 'Public view' },
  ]
}

/**
 * True when an admin asked for the public calendar. `?as=public` is the link; `?view=guest` is the old
 * Guest preview address, so an old bookmark or notification still lands on the public view.
 */
export function asksForPublicCalendar(query: { as?: string | string[]; view?: string | string[] }): boolean {
  const as = Array.isArray(query.as) ? query.as[0] : query.as
  const view = Array.isArray(query.view) ? query.view[0] : query.view
  return as === 'public' || view === 'guest'
}
