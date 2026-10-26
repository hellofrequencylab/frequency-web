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
  'how-to-build-community': { published: '2026-06-24', updated: '2026-07-24' },
  'how-to-start-a-circle': { published: '2026-06-24', updated: '2026-07-24' },
  'how-to-be-more-social': { published: '2026-06-29', updated: '2026-07-24' },
  'calm-down-fast': { published: '2026-06-29', updated: '2026-06-29' },
  'the-community': { published: '2026-07-28', updated: '2026-08-05' },
  about: { published: '2026-05-30', updated: '2026-09-21' },
  spaces: { published: '2026-06-24', updated: '2026-09-21' },
} as const satisfies Record<string, PageDates>

export type GuideSlug = keyof typeof GUIDE_DATES

/** The sitemap's lastModified for a dated page: its `updated` day, as a Date. */
export const GUIDE_LAST_MODIFIED: Record<GuideSlug, Date> = Object.fromEntries(
  Object.entries(GUIDE_DATES).map(([slug, d]) => [slug, new Date(d.updated)]),
) as Record<GuideSlug, Date>
