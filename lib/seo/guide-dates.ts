// The updated day of each guide and dated marketing page, for the sitemap's lastModified (SCAN-1139).
// Each page keeps its own PUBLISHED / UPDATED constants (the marketing probes load those page modules
// with a fixed import allowlist, so a page cannot import this file); guide-dates.test.ts reads every
// page and fails when the two differ, so the sitemap cannot drift from the page. Bump both together.
// PURE: no Supabase, no React, no Next.

interface PageDates {
  published: string
  updated: string
}

export const GUIDE_DATES = {
  loneliness: { published: '2026-06-24', updated: '2026-07-24' },
  'friendship-as-an-adult': { published: '2026-06-24', updated: '2026-07-24' },
  'how-to-build-community': { published: '2026-06-24', updated: '2026-11-17' },
  'how-to-start-a-circle': { published: '2026-06-24', updated: '2026-07-24' },
  'how-to-be-more-social': { published: '2026-06-29', updated: '2026-07-24' },
  'the-community': { published: '2026-07-28', updated: '2026-08-05' },
  about: { published: '2026-05-30', updated: '2026-09-21' },
  spaces: { published: '2026-06-24', updated: '2026-09-21' },
} as const satisfies Record<string, PageDates>

export type GuideSlug = keyof typeof GUIDE_DATES

/** The sitemap's lastModified for a dated page: its `updated` day, as a Date. */
export const GUIDE_LAST_MODIFIED: Record<GuideSlug, Date> = Object.fromEntries(
  Object.entries(GUIDE_DATES).map(([slug, d]) => [slug, new Date(d.updated)]),
) as Record<GuideSlug, Date>

// The updated day of the pages that change with the offer rather than with an article (SCAN-1226): the
// pricing page, the operator doors, the comparisons and the North County hub. A page that moves its
// price table, its door copy or its town list moves its day here in the same change, so a crawler is
// told the page changed and schedules the recrawl. The day is the last real edit of the page's copy,
// never "today", and never in the future (a lastmod ahead of the clock gets the whole field distrusted,
// SCAN-661). Unlike GUIDE_DATES these pages carry no PUBLISHED / UPDATED constants of their own, so
// there is no page-side twin to drift from.
export const PAGE_UPDATED = {
  pricing: '2026-11-14',
  for: '2026-11-14',
  vs: '2026-11-14',
  'north-county-san-diego': '2026-11-16',
  // The course library and its sales pages (/courses, /courses/<slug>).
  courses: '2026-11-17',
} as const

type PageUpdatedSlug = keyof typeof PAGE_UPDATED

/** The sitemap's lastModified for one of those pages, as a Date. */
export const pageLastModified = (slug: PageUpdatedSlug): Date => new Date(PAGE_UPDATED[slug])
