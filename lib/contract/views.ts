// Contract view-builders (Phase 2) — compose entity data + the viewer's
// capabilities into the presentation-neutral shapes in ./types. This is the
// shared contract IMPLEMENTATION: web RSC renders these today; mobile consumes
// the same shapes later (exposed via an RPC/endpoint). Capabilities come from the
// one resolver (lib/core), so policy never drifts between clients.
//
// Server-only (admin client + caller identity). Authorization to *act* is still
// re-checked server-side at mutation time; `capabilities` here is for rendering.

import { createAdminClient } from '@/lib/supabase/admin'
import { getCircleCapabilities, getProfileCapabilities } from '@/lib/core/load-capabilities'
import type { CircleView, ProfileView, FeedView, FeedItem } from './types'

export async function getProfileView(handle: string): Promise<ProfileView | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('profiles')
    .select('id, handle, display_name, avatar_url, bio')
    .eq('handle', handle)
    .maybeSingle()
  if (!data) return null

  const caps = await getProfileCapabilities(data.id)
  return {
    id: data.id,
    handle: data.handle,
    displayName: data.display_name ?? '',
    avatarUrl: data.avatar_url,
    bio: data.bio,
    capabilities: [...caps],
  }
}

export async function getCircleView(slug: string): Promise<CircleView | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('circles')
    .select('id, slug, name, about, type, member_count, member_cap, host_id, city')
    .eq('slug', slug)
    .maybeSingle()
  if (!data) return null

  const caps = await getCircleCapabilities(data.id)
  return {
    id: data.id,
    slug: data.slug,
    name: data.name,
    about: data.about,
    // Virtual is the default; `in-person` is the additive designator.
    mode: data.type === 'in-person' ? 'in-person' : 'virtual',
    city: data.city,
    memberCount: data.member_count,
    memberCap: data.member_cap,
    hostId: data.host_id,
    capabilities: [...caps],
  }
}

/**
 * Public feed as the presentation-neutral FeedView contract (Phase 2). Cursor is
 * the created_at of the last item; pass it back as `cursor` for the next page.
 * Non-hidden posts only. Mobile + web consume this identical shape.
 */
export async function getFeed(opts?: { cursor?: string | null; limit?: number }): Promise<FeedView> {
  const admin = createAdminClient()
  const limit = Math.min(opts?.limit ?? 20, 50)

  let q = admin
    .from('posts')
    .select('id, body, created_at, post_type, author:profiles!author_id ( handle, display_name )')
    .is('hidden_at', null)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (opts?.cursor) q = q.lt('created_at', opts.cursor)

  const { data } = await q
  const rows = (data ?? []) as unknown as Array<{
    id: string
    body: string | null
    created_at: string | null
    post_type: string | null
    author: { handle: string | null; display_name: string | null } | null
  }>

  const items: FeedItem[] = rows.map((r) => ({
    id: r.id,
    kind: 'post',
    authorHandle: r.author?.handle ?? '',
    authorName: r.author?.display_name ?? '',
    createdAt: r.created_at ?? '',
    body: r.body,
  }))

  const nextCursor = items.length === limit ? items[items.length - 1].createdAt : null
  return { items, nextCursor }
}
