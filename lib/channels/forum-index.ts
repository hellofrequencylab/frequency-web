import type { SupabaseClient } from '@supabase/supabase-js'
import { countCirclesPerChannel } from '@/lib/circles/channels'
import { listSecondaryCarriers } from '@/lib/circles/channel-carriers'

// THE CHANNELS INDEX AS A FORUM (LIVE-1028, ADR-1847).
//
// A Channel is a global topic with a forum inside it (posts scoped to the Channel), so the index reads
// like a forum's board list: each row says what the Channel is, how many people are tuned in, how much
// has been said lately, and what the latest thread was. This file is the data side: one read that
// gathers a Channel's counts and latest public thread, and the pure filter / sort / trending helpers
// the page and its tests share. AUTHZ: the caller hands in its service-role client (this file adds no
// importer of it), and only PUBLIC top-level posts are read, the same ones a signed-out visitor could
// see on the Channel page, so the index shows no more than the Channel itself does.

export const CHANNEL_SORTS = ['active', 'tuned', 'circles', 'az'] as const
type ChannelSort = (typeof CHANNEL_SORTS)[number]

export const CHANNEL_SORT_LABEL: Record<ChannelSort, string> = {
  active: 'Most active',
  tuned: 'Most tuned in',
  circles: 'Most Circles',
  az: 'A to Z',
}

/** A Channel is "active" if it has had a public thread in this many days. */
const ACTIVE_WINDOW_DAYS = 14
/** How many public threads are read to build the per-Channel activity. Newest first, so it is a window. */
const POST_WINDOW = 800

export interface ForumChannel {
  id: string
  name: string
  slug: string
  category: string
  description: string | null
  coverImage: string | null
  /** The raw header settings bag (the cover focal point lives in it). */
  theme: unknown
  pillarId: string | null
  pillarName: string | null
  pillarSlug: string | null
  members: number
  circles: number
  /** Public threads inside the read window, and the ones in the last ACTIVE_WINDOW_DAYS. */
  threads: number
  recentThreads: number
  lastPostAt: string | null
  latest: { excerpt: string; author: string | null; at: string } | null
  /** An operator-pinned thread exists in this Channel. */
  hasPinned: boolean
  tunedIn: boolean
}

interface ForumPillar {
  id: string
  slug: string
  name: string
  description: string | null
}

export interface ForumIndex {
  pillars: ForumPillar[]
  channels: ForumChannel[]
}

interface ChannelParams {
  q?: string
  pillar?: string
  show?: string
  sort?: string
}

export function parseChannelSort(raw: string | undefined): ChannelSort {
  return (CHANNEL_SORTS as readonly string[]).includes(raw ?? '') ? (raw as ChannelSort) : 'active'
}

/** The first line of a post, cut at a word, with markdown marks and links dropped. */
export function threadExcerpt(body: string | null | undefined, max = 110): string {
  const flat = (body ?? '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[*_`#>~]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (flat.length <= max) return flat
  const cut = flat.slice(0, max)
  const at = cut.lastIndexOf(' ')
  return `${(at > max * 0.6 ? cut.slice(0, at) : cut).replace(/[.,;:!?-]+$/, '')}…`
}

/** Search, Pillar and "tuned in" narrowing. Search reads name, description and Pillar name. */
export function filterChannels(list: readonly ForumChannel[], p: ChannelParams): ForumChannel[] {
  const q = (p.q ?? '').trim().toLowerCase()
  return list.filter((c) => {
    if (p.pillar && c.pillarSlug !== p.pillar) return false
    if (p.show === 'tuned' && !c.tunedIn) return false
    if (p.show === 'explore' && c.tunedIn) return false
    if (!q) return true
    return [c.name, c.description ?? '', c.pillarName ?? ''].some((s) => s.toLowerCase().includes(q))
  })
}

/** Most active = this fortnight's threads, then all threads, then the latest post, then tuned in. */
export function sortChannels(list: readonly ForumChannel[], sort: ChannelSort): ForumChannel[] {
  const byName = (a: ForumChannel, b: ForumChannel) => a.name.localeCompare(b.name)
  const time = (c: ForumChannel) => (c.lastPostAt ? Date.parse(c.lastPostAt) : 0)
  const out = [...list]
  switch (sort) {
    case 'az':
      return out.sort(byName)
    case 'tuned':
      return out.sort((a, b) => b.members - a.members || byName(a, b))
    case 'circles':
      return out.sort((a, b) => b.circles - a.circles || b.members - a.members || byName(a, b))
    default:
      return out.sort(
        (a, b) =>
          b.recentThreads - a.recentThreads ||
          b.threads - a.threads ||
          time(b) - time(a) ||
          b.members - a.members ||
          byName(a, b),
      )
  }
}

/** The Channels with the most talk this fortnight. A Channel with none is never "trending". */
export function trendingChannels(list: readonly ForumChannel[], n = 3): ForumChannel[] {
  return sortChannels(list.filter((c) => c.recentThreads > 0 && c.latest), 'active').slice(0, n)
}

/** How a Channel reads in a row: its Circles and tuned-in people are always shown, the talk only when real. */
export function activityLine(c: Pick<ForumChannel, 'recentThreads' | 'threads'>): string | null {
  if (c.recentThreads > 0) return `${c.recentThreads} ${c.recentThreads === 1 ? 'thread' : 'threads'} lately`
  if (c.threads > 0) return `${c.threads} ${c.threads === 1 ? 'thread' : 'threads'}`
  return null
}

interface TopicalRow {
  id: string
  name: string
  slug: string
  category: string
  description: string | null
  cover_image: string | null
  pillar_id: string | null
  theme: unknown
}

export async function loadChannelsForum(client: SupabaseClient, viewerProfileId: string | null): Promise<ForumIndex> {
  const [{ data: pillarRows }, { data: channelRows }] = await Promise.all([
    client
      .from('pillars')
      .select('id, slug, name, description')
      .eq('is_active', true)
      .order('display_order', { ascending: true }),
    client
      .from('topical_channels')
      .select('id, name, slug, category, description, cover_image, display_order, pillar_id, theme')
      .eq('is_active', true)
      .order('display_order', { ascending: true }),
  ])
  const pillars = (pillarRows ?? []) as ForumPillar[]
  const rows = (channelRows ?? []) as unknown as TopicalRow[]
  if (rows.length === 0) return { pillars, channels: [] }
  const ids = rows.map((r) => r.id)
  const pillarById = new Map(pillars.map((p) => [p.id, p]))

  const since = Date.now() - ACTIVE_WINDOW_DAYS * 864e5
  const [{ data: members }, { data: circles }, secondary, { data: posts }, mine] = await Promise.all([
    client.from('topical_channel_memberships').select('topical_channel_id').in('topical_channel_id', ids),
    // AXIS 1 (ADR-1015): count what the browse rail will show, so an unlisted room never moves a number.
    client.from('circles').select('id, topical_channel_id').in('topical_channel_id', ids).neq('status', 'archived').eq('unlisted', false),
    listSecondaryCarriers(client, ids),
    client
      .from('posts')
      .select('id, body, created_at, scope_id, author_id, is_pinned')
      .in('scope_id', ids)
      .eq('visibility', 'public')
      .is('parent_id', null)
      .is('hidden_at', null)
      .order('created_at', { ascending: false })
      .limit(POST_WINDOW),
    viewerProfileId
      ? client.from('topical_channel_memberships').select('topical_channel_id').in('topical_channel_id', ids).eq('profile_id', viewerProfileId)
      : Promise.resolve({ data: [] as { topical_channel_id: string }[] }),
  ])

  const memberCount = new Map<string, number>()
  for (const m of (members ?? []) as { topical_channel_id: string }[]) {
    memberCount.set(m.topical_channel_id, (memberCount.get(m.topical_channel_id) ?? 0) + 1)
  }

  const secondaryIds = [...new Set(secondary.map((r) => r.circle_id))]
  const { data: listed } = secondaryIds.length
    ? await client.from('circles').select('id').in('id', secondaryIds).neq('status', 'archived').eq('unlisted', false)
    : { data: [] as { id: string }[] }
  const listedIds = new Set(((listed ?? []) as { id: string }[]).map((c) => c.id))
  const circleCount = countCirclesPerChannel([
    ...((circles ?? []) as { id: string; topical_channel_id: string | null }[]).map((c) => ({
      circle_id: c.id,
      topical_channel_id: c.topical_channel_id,
    })),
    ...secondary.filter((r) => listedIds.has(r.circle_id)),
  ])

  type Post = { id: string; body: string | null; created_at: string | null; scope_id: string | null; author_id: string; is_pinned: boolean | null }
  const threads = new Map<string, number>()
  const recent = new Map<string, number>()
  const pinned = new Set<string>()
  const newest = new Map<string, Post>()
  for (const p of (posts ?? []) as Post[]) {
    if (!p.scope_id || !p.created_at) continue
    threads.set(p.scope_id, (threads.get(p.scope_id) ?? 0) + 1)
    if (Date.parse(p.created_at) >= since) recent.set(p.scope_id, (recent.get(p.scope_id) ?? 0) + 1)
    if (p.is_pinned) pinned.add(p.scope_id)
    if (!newest.has(p.scope_id) && threadExcerpt(p.body)) newest.set(p.scope_id, p)
  }

  const authorIds = [...new Set([...newest.values()].map((p) => p.author_id))]
  const { data: authors } = authorIds.length
    ? await client.from('profiles').select('id, display_name').in('id', authorIds)
    : { data: [] as { id: string; display_name: string | null }[] }
  const authorName = new Map(((authors ?? []) as { id: string; display_name: string | null }[]).map((a) => [a.id, a.display_name]))

  const tuned = new Set(((mine.data ?? []) as { topical_channel_id: string }[]).map((m) => m.topical_channel_id))

  const channels: ForumChannel[] = rows.map((r) => {
    const pillar = r.pillar_id ? pillarById.get(r.pillar_id) : undefined
    const post = newest.get(r.id)
    return {
      id: r.id,
      name: r.name,
      slug: r.slug,
      category: r.category,
      description: r.description,
      coverImage: r.cover_image,
      theme: r.theme,
      pillarId: r.pillar_id,
      pillarName: pillar?.name ?? null,
      pillarSlug: pillar?.slug ?? null,
      members: memberCount.get(r.id) ?? 0,
      circles: circleCount[r.id] ?? 0,
      threads: threads.get(r.id) ?? 0,
      recentThreads: recent.get(r.id) ?? 0,
      lastPostAt: post?.created_at ?? null,
      latest: post && post.created_at
        ? { excerpt: threadExcerpt(post.body), author: authorName.get(post.author_id) ?? null, at: post.created_at }
        : null,
      hasPinned: pinned.has(r.id),
      tunedIn: tuned.has(r.id),
    }
  })
  return { pillars, channels }
}
