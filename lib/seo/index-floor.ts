// THE LOCAL INDEX FLOOR (LIVE-807, ADR-1720 workstream 9). A local page (a city, or a city × practice
// page) asks search engines to index it only when it has something real to show: 3 or more upcoming
// Events, or 2 or more active Spaces. Below the floor the page still renders for a visitor who has
// the link, but it says noindex and stays out of the sitemap, so thin facets never reach the index.
//
// ONE rule, read by the pages' robots meta and by app/sitemap.ts, so the two can never disagree.
// Pure and client-safe.

export const MIN_UPCOMING_EVENTS = 3
export const MIN_ACTIVE_SPACES = 2

export function meetsIndexFloor(counts: { upcomingEvents: number; activeSpaces?: number }): boolean {
  return counts.upcomingEvents >= MIN_UPCOMING_EVENTS || (counts.activeSpaces ?? 0) >= MIN_ACTIVE_SPACES
}
