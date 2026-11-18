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
const CREATOR_LAB_CATEGORY = 'Creator Lab'

type CourseTrackKey = 'business' | 'hosting' | 'other'

export interface CourseTrack {
  key: CourseTrackKey
  label: string
  lede: string
}

/** The shelves, in page order. `other` is the fallback and only renders when something lands in it. */
const COURSE_TRACKS: readonly CourseTrack[] = [
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

/** Journeys whose course page is a hand-built sales page. Every other course gets the standard course page
 *  at /courses/<slug> (app/(marketing)/courses/[slug]). */
const COURSE_SALES_PAGES: Readonly<Record<string, string>> = {
  'the-business-of-community-101': '/courses/business-of-community',
}

/** The topic hub every course links up to, and that links down to the library (the pillar of the cluster). */
export const COURSE_HUB = { path: '/how-to-build-community', label: 'How to build a community' } as const

/** The library's name (owner 2026-11-18): Frequency's training library is Creator Lab. */
export const LIBRARY_NAME = 'Creator Lab'

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

/** The shelf a course sits on, with its label and lede (the course page's track fact and "who it's for" fallback). */
export function trackOf(plan: Pick<CourseCandidate, 'slug' | 'category'>): CourseTrack {
  const key = trackFor(plan)
  return COURSE_TRACKS.find((t) => t.key === key) ?? COURSE_TRACKS[COURSE_TRACKS.length - 1]!
}

/** A Journey slug whose course home is a hand-built page elsewhere under /courses. */
export function salesPageFor(slug: string): string | null {
  return COURSE_SALES_PAGES[slug] ?? null
}

/** A course's ONE home: its hand-built sales page when one exists, else /courses/<slug>. The public Journey
 *  page (/discover/journeys/<slug>) stays for shares and QR codes, and names this as its canonical, so the
 *  two never compete in search. Never /journeys/*: that is the member route, and robots.ts disallows it. */
export function courseHref(slug: string): string {
  return COURSE_SALES_PAGES[slug] ?? `/courses/${slug}`
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

/** Courses that offer Certified: a Frequency reviewer reads the learner's Community Book (owner 2026-11-17).
 *  Every course with live sessions also offers Attended, issued when someone came to every session of a Run. */
const CERTIFIED_COURSES = new Set(['the-business-of-community-101'])

export function offersCertified(slug: string): boolean {
  return CERTIFIED_COURSES.has(slug)
}

/** A HOUSE PROGRAM: a Journey Frequency itself runs (the house Space's own Journeys, or an official Creator Lab
 *  course). Never remixable (owner 2026-11-18: "None of these house programs should be remixable"): the
 *  curriculum, its Runs and its credentials stay one program, not copies. */
export function isHouseProgram(
  plan: { space_id: string | null; official: boolean; category?: string | null },
  houseSpaceId: string | null,
): boolean {
  return (houseSpaceId !== null && plan.space_id === houseSpaceId) || (plan.official && plan.category === CREATOR_LAB_CATEGORY)
}
