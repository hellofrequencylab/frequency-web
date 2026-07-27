import { createAdminClient } from '@/lib/supabase/admin'
import { getTemplateById, getActiveTemplates } from '@/lib/circles/templates-data'
import type { CircleTemplate } from '@/lib/circles/templates'

// Read layer for the Channel Manage hub (ADR-870). Pure reads on the admin
// client; the page already authorized the caller as staff (channel.manage)
// before calling any of these. Each loader is independent so the page can put
// them behind their own <Suspense> (PAGE-FRAMEWORK §5) and they fetch in
// parallel. Mirrors app/(main)/events/[slug]/manage/load.ts.

export interface ChannelHomeStats {
  /** Members tuned in (topical_channel_memberships). */
  tunedIn: number
  /** Non-archived, real circles in the channel (Chapters when a Program). */
  circleCount: number
  /** Forum posts on the channel (posts.scope_id = channel id). */
  postCount: number
  /** Messages in the channel's open room over the last 7 days; null = no room. */
  roomMessages7d: number | null
}

/** The Home stat strip: four cheap head-count reads, fetched in parallel. */
export async function loadChannelHomeStats(channelId: string): Promise<ChannelHomeStats> {
  const admin = createAdminClient()

  // The channel's open room (one per channel); its 7-day message count is the
  // "room activity" pulse. Cheap: one id lookup + one head count.
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const roomPromise = admin
    .from('rooms')
    .select('id')
    .eq('visibility', 'channel')
    .eq('scope_id', channelId)
    .maybeSingle()
    .then(async ({ data }) => {
      const roomId = (data as { id: string } | null)?.id
      if (!roomId) return null
      const { count } = await admin
        .from('room_messages')
        .select('id', { count: 'exact', head: true })
        .eq('room_id', roomId)
        .gt('created_at', sevenDaysAgo)
      return count ?? 0
    })

  const [membersRes, circlesRes, postsRes, roomMessages7d] = await Promise.all([
    admin
      .from('topical_channel_memberships')
      .select('id', { count: 'exact', head: true })
      .eq('topical_channel_id', channelId),
    admin
      .from('circles')
      .select('id', { count: 'exact', head: true })
      .eq('topical_channel_id', channelId)
      .eq('is_demo', false)
      .neq('status', 'archived'),
    admin
      .from('posts')
      .select('id', { count: 'exact', head: true })
      .eq('scope_id', channelId),
    roomPromise,
  ])

  return {
    tunedIn: membersRes.count ?? 0,
    circleCount: circlesRes.count ?? 0,
    postCount: postsRes.count ?? 0,
    roomMessages7d,
  }
}

export interface TunedInMember {
  profileId: string
  displayName: string
  handle: string
  avatarUrl: string | null
  joinedAt: string
}

interface MembershipRow {
  profile_id: string
  joined_at: string
  profile: { id: string; display_name: string; handle: string; avatar_url: string | null } | null
}

/** Everyone tuned in, newest first, joined to profiles for display. */
export async function loadTunedInMembers(channelId: string): Promise<TunedInMember[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('topical_channel_memberships')
    .select(
      'profile_id, joined_at, profile:profiles!profile_id ( id, display_name, handle, avatar_url )',
    )
    .eq('topical_channel_id', channelId)
    .order('joined_at', { ascending: false })
    .limit(500)

  return ((data ?? []) as unknown as MembershipRow[])
    .filter((r) => r.profile != null)
    .map((r) => ({
      profileId: r.profile!.id,
      displayName: r.profile!.display_name,
      handle: r.profile!.handle,
      avatarUrl: r.profile!.avatar_url,
      joinedAt: r.joined_at,
    }))
}

export interface ManagedCircle {
  id: string
  name: string
  slug: string
  type: 'in-person' | 'online'
  status: string
  city: string | null
  memberCount: number
  memberCap: number
}

/** The circles in the channel (real, non-archived — drafts included so staff
 *  can see what is forming), biggest rooms first. */
export async function loadChannelCircles(channelId: string): Promise<ManagedCircle[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('circles')
    .select('id, name, slug, type, status, city, member_count, member_cap')
    .eq('topical_channel_id', channelId)
    .eq('is_demo', false)
    .neq('status', 'archived')
    .order('member_count', { ascending: false })
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: String(row.id),
    name: String(row.name),
    slug: String(row.slug),
    type: row.type === 'online' ? 'online' : 'in-person',
    status: String(row.status),
    city: row.city == null ? null : String(row.city),
    memberCount: typeof row.member_count === 'number' ? row.member_count : 0,
    memberCap: typeof row.member_cap === 'number' ? row.member_cap : 0,
  }))
}

export interface ProgramSectionData {
  /** The blueprint, when the channel runs a Program; null = attach form. */
  blueprint: CircleTemplate | null
  /** The channel's display copy + pause state (the Program fields staff edit). */
  channel: {
    name: string
    description: string | null
    isActive: boolean
    ownerSpaceId: string | null
  }
  /** Attach/refresh sources: live, real circles, biggest first (capped). */
  liveCircles: { id: string; name: string; city: string | null; memberCount: number }[]
  /** Attach sources: the staff Starter Circles catalog. */
  starters: { id: string; name: string; oneLiner: string }[]
}

/** Everything the Program tab renders: the blueprint (or the attach sources)
 *  plus the channel's editable Program fields. */
export async function loadProgramSection(channelId: string): Promise<ProgramSectionData | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('topical_channels')
    .select('id, name, description, owner_space_id, template_id, is_active')
    .eq('id', channelId)
    .maybeSingle()
  const channel = data as
    | { id: string; name: string; description: string | null; owner_space_id: string | null; template_id: string | null; is_active: boolean }
    | null
  if (!channel) return null

  const [blueprint, circlesRes, starters] = await Promise.all([
    channel.template_id ? getTemplateById(channel.template_id) : Promise.resolve(null),
    // Sources for attach/refresh: any live, real circle on the platform (the
    // staff path has no Space fence). Capped for the picker; biggest first.
    admin
      .from('circles')
      .select('id, name, city, member_count')
      .eq('is_demo', false)
      .in('status', ['forming', 'active'])
      .order('member_count', { ascending: false })
      .limit(100),
    channel.template_id ? Promise.resolve([]) : getActiveTemplates(),
  ])

  return {
    blueprint,
    channel: {
      name: channel.name,
      description: channel.description,
      isActive: channel.is_active !== false,
      ownerSpaceId: channel.owner_space_id,
    },
    liveCircles: ((circlesRes.data ?? []) as Record<string, unknown>[]).map((row) => ({
      id: String(row.id),
      name: String(row.name),
      city: row.city == null ? null : String(row.city),
      memberCount: typeof row.member_count === 'number' ? row.member_count : 0,
    })),
    starters: starters.map((t) => ({ id: t.id, name: t.name, oneLiner: t.oneLiner })),
  }
}
