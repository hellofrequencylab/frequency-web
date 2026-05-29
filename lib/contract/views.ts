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
import type { CircleView, ProfileView } from './types'

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
