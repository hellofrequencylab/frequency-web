// Loader for the Posted events oversight area of /admin/events: every published
// event that came in through the Poster Events engine (source='poster_scan' OR
// posted_by_profile_id set), its claim state, its engagement, and the honesty
// band of every poster behind them. One cached load feeds BOTH page sections
// (the events table and the poster quality panel), so the band math runs once.
//
// The new poster columns aren't in the generated types yet, so events reads go
// through the untyped admin handle (repo convention, cf. lib/events/event-drafts.ts).

import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPosterQuality, type PosterBand, type PosterQuality } from '@/lib/events/poster-quality'

const db = () => createAdminClient()

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://frequencylocal.com'

/** Most posters the quality panel scores in one load (the heaviest read here). */
const QUALITY_PANEL_CAP = 50
/** How many band reads run at once (each is a few scoped queries). */
const QUALITY_CONCURRENCY = 8

export type PostedStatus = 'unclaimed' | 'claimed' | 'removed'

export interface PostedEventRow {
  id: string
  title: string
  slug: string
  publishedAt: string | null
  status: PostedStatus
  /** The full claim invitation URL, present only while the invite is outstanding. */
  claimUrl: string | null
  removedReason: string | null
  rsvps: number
  poster: { id: string; name: string; handle: string | null; band: PosterBand | null } | null
  /** Display name of the member who claimed it (or was assigned as host). */
  claimedBy: string | null
}

export interface PosterQualityRow extends PosterQuality {
  profileId: string
  name: string
  handle: string | null
}

export interface PostedAdminData {
  rows: PostedEventRow[]
  stats: { posted: number; unclaimed: number; claimed: number; removed: number }
  posters: PosterQualityRow[]
}

interface RawPosted {
  id: string
  title: string | null
  slug: string | null
  published_at: string | null
  created_at: string | null
  host_id: string | null
  posted_by_profile_id: string | null
  claim_token: string | null
  claimed_at: string | null
  removed_at: string | null
  removed_reason: string | null
}

function statusOf(e: RawPosted): PostedStatus {
  if (e.removed_at) return 'removed'
  if (e.host_id || e.claimed_at) return 'claimed'
  return 'unclaimed'
}

/** Run an async map with bounded concurrency (band reads are a few queries each). */
async function mapLimited<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  async function worker() {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

/** The one posted-events read for the page. `cache()` dedupes it across the two
 *  Suspense sections so the table and the quality panel share a single load. */
export const getPostedAdminData = cache(async (): Promise<PostedAdminData> => {
  const admin = db()

  const { data } = await admin
    .from('events')
    .select(
      'id, title, slug, published_at, created_at, host_id, posted_by_profile_id, ' +
        'claim_token, claimed_at, removed_at, removed_reason',
    )
    .eq('status', 'published')
    .or('source.eq.poster_scan,posted_by_profile_id.not.is.null')
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(300)
  const events = ((data ?? []) as unknown) as RawPosted[]

  // ── Profiles behind the rows (posters + claimers) in one read ───────────────
  const profileIds = new Set<string>()
  for (const e of events) {
    if (e.posted_by_profile_id) profileIds.add(e.posted_by_profile_id)
    if (e.host_id) profileIds.add(e.host_id)
  }
  const profiles = new Map<string, { name: string; handle: string | null }>()
  if (profileIds.size) {
    const { data: profs } = await admin
      .from('profiles')
      .select('id, display_name, handle')
      .in('id', Array.from(profileIds))
    for (const p of (profs ?? []) as { id: string; display_name: string | null; handle: string | null }[]) {
      profiles.set(p.id, { name: p.display_name ?? 'Member', handle: p.handle ?? null })
    }
  }

  // ── Engagement: 'going' RSVPs per event, counted in one read ────────────────
  const rsvpCounts = new Map<string, number>()
  if (events.length) {
    const { data: rsvps } = await admin
      .from('event_rsvps')
      .select('event_id')
      .in('event_id', events.map((e) => e.id))
      .eq('status', 'going')
    for (const r of (rsvps ?? []) as { event_id: string }[]) {
      rsvpCounts.set(r.event_id, (rsvpCounts.get(r.event_id) ?? 0) + 1)
    }
  }

  // ── Poster honesty bands: top posters by posted count, capped ───────────────
  const postedPerPoster = new Map<string, number>()
  for (const e of events) {
    if (!e.posted_by_profile_id) continue
    postedPerPoster.set(e.posted_by_profile_id, (postedPerPoster.get(e.posted_by_profile_id) ?? 0) + 1)
  }
  const topPosterIds = Array.from(postedPerPoster.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, QUALITY_PANEL_CAP)
    .map(([id]) => id)

  const qualities = await mapLimited(topPosterIds, QUALITY_CONCURRENCY, async (id) => ({
    id,
    quality: await getPosterQuality(id),
  }))
  const qualityById = new Map(qualities.map((q) => [q.id, q.quality]))

  // ── Assemble rows + stats ────────────────────────────────────────────────────
  const rows: PostedEventRow[] = events.map((e) => {
    const posterProfile = e.posted_by_profile_id ? profiles.get(e.posted_by_profile_id) : null
    const status = statusOf(e)
    return {
      id: e.id,
      title: (e.title ?? '').trim() || 'Untitled event',
      slug: e.slug ?? '',
      publishedAt: e.published_at ?? e.created_at,
      status,
      claimUrl:
        status === 'unclaimed' && e.claim_token ? `${APP_URL}/events/claim/${e.claim_token}` : null,
      removedReason: e.removed_reason,
      rsvps: rsvpCounts.get(e.id) ?? 0,
      poster: e.posted_by_profile_id
        ? {
            id: e.posted_by_profile_id,
            name: posterProfile?.name ?? 'Member',
            handle: posterProfile?.handle ?? null,
            band: qualityById.get(e.posted_by_profile_id)?.band ?? null,
          }
        : null,
      claimedBy: e.host_id ? (profiles.get(e.host_id)?.name ?? 'Member') : null,
    }
  })

  const stats = {
    posted: rows.length,
    unclaimed: rows.filter((r) => r.status === 'unclaimed').length,
    claimed: rows.filter((r) => r.status === 'claimed').length,
    removed: rows.filter((r) => r.status === 'removed').length,
  }

  // The attention queue first: throttled, then watch, then everyone by volume.
  const bandRank: Record<PosterBand, number> = { throttled: 0, watch: 1, neutral: 2, trusted: 3, new: 4 }
  const posters: PosterQualityRow[] = qualities
    .map(({ id, quality }) => ({
      ...quality,
      profileId: id,
      name: profiles.get(id)?.name ?? 'Member',
      handle: profiles.get(id)?.handle ?? null,
    }))
    .sort((a, b) => bandRank[a.band] - bandRank[b.band] || b.posted - a.posted)

  return { rows, stats, posters }
})
