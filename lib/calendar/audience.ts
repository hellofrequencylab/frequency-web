// WHO THE CALENDAR IS FOR (owner ruling 2026-10-29): the calendar is role based. A Space's admins get the
// full suite (Team view); everyone else gets the public calendar. An admin can look at the public one
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

/** Where an admin who opens the public Calendar tab without asking for the public view is sent: the suite. */
export function teamCalendarRedirect(slug: string, query: { plan?: string | string[]; y?: string | string[]; m?: string | string[] }): string {
  const params = new URLSearchParams()
  for (const key of ['plan', 'y', 'm'] as const) {
    const raw = query[key]
    const value = Array.isArray(raw) ? raw[0] : raw
    if (value) params.set(key, value)
  }
  const tail = params.toString()
  return tail ? `${audienceHref(slug, 'team')}?${tail}` : audienceHref(slug, 'team')
}
