// THE COURSE LIBRARY'S RULES (/courses). PURE: no Supabase, no React, no Next, so the page, its test and
// the llms routes can all read it.
//
// A course is an OFFICIAL, PUBLIC Journey that Frequency itself teaches: its category is 'Creator Lab', or
// it lives in the house Space (slug `hq`). Tracks are derived here rather than stored, because a track is
// a shelf on one page, not a fact about the Journey: a slug rule wins, then a category rule, then Other.
// Adding a course to a shelf is a one-line edit below, never a migration.

/** The house Space: the Frequency Space whose official Journeys are Frequency's own courses. */
export const HOUSE_SPACE_SLUG = 'hq'

/** The category that marks a Creator Lab course wherever it is hosted. */
export const CREATOR_LAB_CATEGORY = 'Creator Lab'

export type CourseTrackKey = 'business' | 'hosting' | 'other'

export interface CourseTrack {
  key: CourseTrackKey
  label: string
  lede: string
}

/** The shelves, in page order. `other` is the fallback and only renders when something lands in it. */
export const COURSE_TRACKS: readonly CourseTrack[] = [
  {
    key: 'business',
    label: 'Business and leadership',
    lede: 'For people who already gather others. What a night costs you, what to charge, and who came back.',
  },
  {
    key: 'hosting',
    label: 'Hosting',
    lede: 'For hosts, from a first Circle to holding a room with a co-host.',
  },
  {
    key: 'other',
    label: 'Other',
    lede: 'More from the Frequency library.',
  },
]

/** A specific Journey on a specific shelf. Wins over the category rule. */
const TRACK_BY_SLUG: Readonly<Record<string, CourseTrackKey>> = {
  'host-foundations': 'hosting',
  'safe-and-well-held': 'hosting',
  'circle-formats': 'hosting',
  'co-host-apprenticeship': 'hosting',
}

/** A whole category on a shelf. */
const TRACK_BY_CATEGORY: Readonly<Record<string, CourseTrackKey>> = {
  [CREATOR_LAB_CATEGORY]: 'business',
  Hosting: 'hosting',
}

/** Journeys that have their own sales page under /courses. Every other card links to the public Journey page. */
export const COURSE_SALES_PAGES: Readonly<Record<string, string>> = {
  'the-business-of-community-101': '/courses/business-of-community',
}

/** The minimal shape these rules read, so a test can pass a literal rather than a whole JourneyPlan. */
export interface CourseCandidate {
  slug: string
  category?: string | null
  official: boolean
  visibility: string
  status?: string | null
  space_id: string | null
}

export function trackFor(plan: Pick<CourseCandidate, 'slug' | 'category'>): CourseTrackKey {
  return TRACK_BY_SLUG[plan.slug] ?? (plan.category ? TRACK_BY_CATEGORY[plan.category] : undefined) ?? 'other'
}

/** Where a course card links: its sales page when one exists, else the public canonical Journey page.
 *  Never /journeys/*: that is the member route, and robots.ts disallows it. */
export function courseHref(slug: string): string {
  return COURSE_SALES_PAGES[slug] ?? `/discover/journeys/${slug}`
}

/** Is this Journey one of Frequency's courses? Public, not rejected, official, and either a Creator Lab
 *  course or hosted by the house Space. */
export function isCourse(plan: CourseCandidate, houseSpaceId: string | null): boolean {
  if (plan.visibility !== 'public' || plan.status === 'rejected' || !plan.official) return false
  return plan.category === CREATOR_LAB_CATEGORY || (houseSpaceId !== null && plan.space_id === houseSpaceId)
}

/** Group courses onto their shelves, in COURSE_TRACKS order, dropping empty shelves. Input order is kept
 *  inside a shelf. */
export function groupByTrack<T extends Pick<CourseCandidate, 'slug' | 'category'>>(
  courses: readonly T[],
): { track: CourseTrack; courses: T[] }[] {
  return COURSE_TRACKS.map((track) => ({ track, courses: courses.filter((c) => trackFor(c) === track.key) })).filter(
    (g) => g.courses.length > 0,
  )
}
