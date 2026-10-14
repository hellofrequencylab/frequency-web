import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import {
  DIRECTORY_VISIBILITY_COLUMNS,
  isListableInDirectory,
} from '@/lib/connections/directory-visibility'
import { HOME_TZ, dayInZone } from '@/lib/time/zone'
import {
  SERIES_COLUMNS,
  TEASER_CARDS_PER_SERIES,
  collapseSeriesAroundFloor,
  seriesFetchLimit,
  seriesUpcomingFloor,
  type SeriesFields,
} from '@/lib/events/series'
import { LISTABLE_CIRCLE_STATUS, isListedCircle } from '@/lib/circles/visibility'
import { demoModeEnabled } from '@/lib/platform-flags'
import { viewerHidesDemo } from '@/lib/demo-preference'

// /search's reads, one function per result kind, shared by the DAWN page and the Frequency body
// (components/frequency/members/search) so both answer a query from the same gated windows.
// Every caller passes a term already through sanitizeOrTerm (ADR-274): these run on the
// service-role client and interpolate into PostgREST filters.
//
// Each window over-fetches by one row so the page can tell "that is all of them" from "that is
// the first N" (FINALIZE-PLAN §9.3).

export type PersonRow = {
  id: string
  display_name: string
  handle: string
  avatar_url: string | null
  community_role: string
  is_demo: boolean
}

export type PostRow = {
  id: string
  body: string
  created_at: string
  is_demo: boolean
  author: { display_name: string; handle: string; avatar_url: string | null; community_role: string } | null
}

export type EventRow = SeriesFields & {
  id: string
  title: string
  slug: string
  starts_at: string
  location: string | null
  is_cancelled: boolean
  is_demo: boolean
  /** The cover in the public event-media bucket, for a result's photo tile. */
  cover_image_path?: string | null
  ends_at?: string | null
  host: { display_name: string; handle: string } | null
}

export type CircleRow = {
  id: string
  name: string
  slug: string
  member_count: number | null
  image_url: string | null
  neighborhood: string | null
}

export interface Window<T> {
  rows: T[]
  truncated: boolean
}

/** People results per search. */
export const PEOPLE_RESULTS = 24
/** Post results per search. */
export const POST_RESULTS = 20
/** Event results, counting REPEATING EVENTS rather than dates. */
export const EVENT_RESULTS = 20
/** Circle results per search. */
export const CIRCLE_RESULTS = 12

export async function searchPeople(safe: string, limit = PEOPLE_RESULTS): Promise<Window<PersonRow>> {
  // 🔴 A service-role read on a member-facing page. Bypassing RLS also bypassed every privacy
  // control: a member who switched "Show me in the Members directory" off, or turned Ghost mode on,
  // was still findable here by name and handle. The four privacy columns are selected and each row
  // goes through the shared /network predicate, BEFORE the truncation check, so a hidden row can
  // never be the "one more" that advertises results the reader will not be shown.
  const { data } = await createAdminClient()
    .from('profiles')
    .select(`id, display_name, handle, avatar_url, community_role, is_demo, ${DIRECTORY_VISIBILITY_COLUMNS}`)
    .or(`display_name.ilike.%${safe}%,handle.ilike.%${safe}%`)
    .eq('is_active', true)
    .order('display_name')
    .limit(limit + 1)
  const rows = ((data ?? []) as PersonRow[]).filter(isListableInDirectory)
  return { rows: rows.slice(0, limit), truncated: rows.length > limit }
}

export async function searchPosts(safe: string, limit = POST_RESULTS): Promise<Window<PostRow>> {
  const { data } = await createAdminClient()
    .from('posts')
    .select(
      `id, body, created_at, is_demo,
       author:profiles!author_id ( display_name, handle, avatar_url, community_role )`,
    )
    .ilike('body', `%${safe}%`)
    .eq('visibility', 'public')
    .is('hidden_at', null)
    .order('created_at', { ascending: false })
    .limit(limit + 1)
  const rows = (data ?? []) as unknown as PostRow[]
  return { rows: rows.slice(0, limit), truncated: rows.length > limit }
}

export async function searchEvents(safe: string, limit = EVENT_RESULTS): Promise<Window<EventRow>> {
  // TWO READS, AROUND THE FLOOR. Splitting at today lets a running series lead with its NEXT date
  // while a finished one still answers with its LAST. A FACTORY, never one shared builder:
  // PostgrestFilterBuilder mutates `this`, so .gte() and .lt() on one instance fire one request
  // carrying both predicates, and it matches nothing.
  const admin = createAdminClient()
  const eventsBase = () =>
    admin
      .from('events')
      .select(
        `id, title, slug, starts_at, ends_at, location, is_cancelled, is_demo, cover_image_path, ${SERIES_COLUMNS},
         host:profiles!host_id ( display_name, handle )`,
      )
      .or(`title.ilike.%${safe}%,description.ilike.%${safe}%`)
      .eq('status', 'published')
      .eq('visibility', 'public')
      .eq('is_cancelled', false)

  const floor = seriesUpcomingFloor(dayInZone(new Date(), HOME_TZ))
  const fetchLimit = seriesFetchLimit(limit + 1)
  const [upcoming, past] = await Promise.all([
    eventsBase().gte('starts_at', floor).order('starts_at', { ascending: true }).limit(fetchLimit),
    eventsBase().lt('starts_at', floor).order('starts_at', { ascending: false }).limit(fetchLimit),
  ])
  const folded = collapseSeriesAroundFloor(
    (upcoming.data ?? []) as unknown as EventRow[],
    (past.data ?? []) as unknown as EventRow[],
    limit + 1,
    { upcomingFrom: floor, perSeries: TEASER_CARDS_PER_SERIES },
  )
  return { rows: folded.slice(0, limit), truncated: folded.length > limit }
}

/** Live, listed Circles by name. "Private" Circles are unlisted, so they never answer a search. Read under
 *  the viewer's session, the way the DAWN Circles index reads them (lib/circles/index-data.ts). */
export async function searchCircles(safe: string, limit = CIRCLE_RESULTS): Promise<Window<CircleRow>> {
  const supabase = await createClient()
  let q = supabase
    .from('circles')
    .select('id, name, slug, member_count, image_url, neighborhood, unlisted, is_demo')
    .ilike('name', `%${safe}%`)
    .in('status', [...LISTABLE_CIRCLE_STATUS])
    .order('member_count', { ascending: false, nullsFirst: false })
    .limit(limit + 1)
  if (!(await demoModeEnabled()) || (await viewerHidesDemo())) q = q.eq('is_demo', false)
  const { data } = await q
  const rows = ((data ?? []) as (CircleRow & { unlisted: boolean | null })[]).filter((c) => isListedCircle(c.unlisted))
  return { rows: rows.slice(0, limit), truncated: rows.length > limit }
}
