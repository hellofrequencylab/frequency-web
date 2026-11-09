// THE COMMUNITY WALL: SETTINGS AND THE VIEWER'S STANDING (ADR-1938, LIVE-2077).
//
// The DATABASE is the authority on who may read, post and moderate (private.can_read_space_wall,
// can_post_space_wall, can_moderate_space_wall, enforced by the posts policies). This module only
// answers the questions the PAGE needs in order to say the right thing: which composer to show, and
// which sentence to put where a wall is closed. It mirrors the DB rule for those hints and never
// grants anything, so a mistake here can mislabel a button but cannot let anyone read or write.
//
// No row in space_wall_settings means the defaults the owner has not changed: anyone reads, members
// post, followers may not interact.

import { createAdminClient } from '@/lib/supabase/admin'
import { type WallArrival } from './community-wall-core'

export { arrivalsSentence, type WallArrival } from './community-wall-core'

type WallReadAccess = 'anyone' | 'members'
type WallPostAccess = 'team' | 'members'

export type WallSettings = {
  readAccess: WallReadAccess
  postAccess: WallPostAccess
  followersInteract: boolean
}

export const DEFAULT_WALL_SETTINGS: WallSettings = {
  readAccess: 'anyone',
  postAccess: 'members',
  followersInteract: false,
}

/** The standing that decides what the wall page offers this viewer. Highest first. */
type WallStanding = 'owner' | 'team' | 'member' | 'follower' | 'visitor' | 'signed-out'

export function wallSettingsFromRow(
  row: { read_access?: string | null; post_access?: string | null; followers_interact?: boolean | null } | null | undefined,
): WallSettings {
  if (!row) return DEFAULT_WALL_SETTINGS
  return {
    readAccess: row.read_access === 'members' ? 'members' : 'anyone',
    postAccess: row.post_access === 'team' ? 'team' : 'members',
    followersInteract: row.followers_interact === true,
  }
}

export async function readWallSettings(spaceId: string): Promise<WallSettings> {
  try {
    const { data, error } = await createAdminClient()
      .from('space_wall_settings')
      .select('read_access, post_access, followers_interact')
      .eq('space_id', spaceId)
      .maybeSingle()
    if (error) return DEFAULT_WALL_SETTINGS
    return wallSettingsFromRow(data)
  } catch {
    return DEFAULT_WALL_SETTINGS
  }
}

/** Who the viewer is to this Space, for wording only. Fail-safe to 'visitor'. */
export async function readWallStanding(args: {
  spaceId: string
  ownerProfileId: string | null
  viewerProfileId: string | null
}): Promise<WallStanding> {
  const { spaceId, ownerProfileId, viewerProfileId } = args
  if (!viewerProfileId) return 'signed-out'
  if (ownerProfileId && ownerProfileId === viewerProfileId) return 'owner'
  try {
    const admin = createAdminClient()
    const [team, member, follow] = await Promise.all([
      admin.from('space_members').select('id').eq('space_id', spaceId).eq('profile_id', viewerProfileId).eq('status', 'active').limit(1),
      admin.from('space_memberships').select('id').eq('space_id', spaceId).eq('member_profile_id', viewerProfileId).eq('status', 'active').limit(1),
      admin.from('space_follows').select('space_id').eq('space_id', spaceId).eq('follower_profile_id', viewerProfileId).limit(1),
    ])
    if ((team.data ?? []).length > 0) return 'team'
    if ((member.data ?? []).length > 0) return 'member'
    if ((follow.data ?? []).length > 0) return 'follower'
  } catch {
    /* fall through to visitor */
  }
  return 'visitor'
}

/** Can this standing read the wall? The page's hint; the policy is the rule. */
export function standingCanRead(
  standing: WallStanding,
  settings: WallSettings,
  spaceIsPrivate: boolean,
): boolean {
  if (standing === 'owner' || standing === 'team' || standing === 'member') return true
  if (spaceIsPrivate) return false
  return settings.readAccess === 'anyone'
}

/** Can this standing post? The page's hint; the policy is the rule. */
export function standingCanPost(standing: WallStanding, settings: WallSettings): boolean {
  if (standing === 'owner' || standing === 'team') return true
  if (standing === 'member') return settings.postAccess === 'members'
  if (standing === 'follower') return settings.followersInteract
  return false
}

/**
 * Is this person banned from this wall? Fail-closed: a broken read answers "banned", so a reply or a
 * reaction never slips through while the table cannot be read. The migration that creates the table
 * is applied before the build that reads it ships (ADR-1111 order), and the database refuses a banned
 * person's posts and reactions on its own, so this gate is the app's word, not the only word.
 */
async function isBannedFromWall(spaceId: string, profileId: string): Promise<boolean> {
  try {
    const { data, error } = await createAdminClient()
      .from('space_wall_bans')
      .select('profile_id')
      .eq('space_id', spaceId)
      .eq('profile_id', profileId)
      .maybeSingle()
    if (error) return true
    return data != null
  } catch {
    return true
  }
}

/**
 * May this person reply or react on a post that lives on a Space's wall? `null` scope means the post
 * is not a wall post and the caller's existing rules apply untouched. Replies and reactions are
 * written by server code that does not pass through the posts INSERT policy, so this is the rule for
 * them: the owner, the team and paying members always; a follower only when the owner has let
 * followers interact; a visitor never. Fail-closed on a broken read.
 */
export async function canInteractOnWall(args: {
  wallSpaceId: string | null | undefined
  profileId: string
}): Promise<boolean> {
  const { wallSpaceId, profileId } = args
  if (!wallSpaceId) return true
  try {
    const admin = createAdminClient()
    const { data: space } = await admin
      .from('spaces')
      .select('owner_profile_id')
      .eq('id', wallSpaceId)
      .maybeSingle()
    if (!space) return false
    const [settings, standing, banned] = await Promise.all([
      readWallSettings(wallSpaceId),
      readWallStanding({ spaceId: wallSpaceId, ownerProfileId: space.owner_profile_id, viewerProfileId: profileId }),
      isBannedFromWall(wallSpaceId, profileId),
    ])
    if (banned) return false
    if (standing === 'owner' || standing === 'team' || standing === 'member') return true
    if (standing === 'follower') return settings.followersInteract
    return false
  } catch {
    return false
  }
}

/**
 * Save the owner's wall choices. The table refuses writes from anon and authenticated, so this runs
 * on the service role, and the CALLER must already have checked that the viewer can edit the Space
 * (the manage/community action does, through getSpaceCapabilities). Returns false on any error.
 */
export async function writeWallSettings(spaceId: string, settings: WallSettings): Promise<boolean> {
  try {
    const { error } = await createAdminClient()
      .from('space_wall_settings')
      .upsert(
        {
          space_id: spaceId,
          read_access: settings.readAccess,
          post_access: settings.postAccess,
          followers_interact: settings.followersInteract,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'space_id' },
      )
    return !error
  } catch {
    return false
  }
}

// ── Bans ─────────────────────────────────────────────────────────────────────────────────────────
// A ban puts one person out of one wall: no posts, replies or reactions there. It leaves their
// membership alone. The database refuses writes from anon and authenticated, so these run on the
// service role, and the CALLER must already have checked that the viewer moderates this wall
// (the manage/community actions do, through getSpaceCapabilities().canModerateWall).

type WallBan = {
  profileId: string
  displayName: string
  handle: string | null
  avatarUrl: string | null
  reason: string | null
  createdAt: string
}

type ProfileBits = { display_name: string | null; handle: string | null; avatar_url: string | null } | null

export async function listWallBans(spaceId: string): Promise<WallBan[]> {
  try {
    const { data, error } = await createAdminClient()
      .from('space_wall_bans')
      .select('profile_id, reason, created_at, person:profiles!profile_id ( display_name, handle, avatar_url )')
      .eq('space_id', spaceId)
      .order('created_at', { ascending: false })
      .limit(200)
    if (error || !data) return []
    return (data as unknown as { profile_id: string; reason: string | null; created_at: string; person: ProfileBits }[]).map((b) => ({
      profileId: b.profile_id,
      displayName: b.person?.display_name?.trim() || 'Someone',
      handle: b.person?.handle ?? null,
      avatarUrl: b.person?.avatar_url ?? null,
      reason: b.reason,
      createdAt: b.created_at,
    }))
  } catch {
    return []
  }
}

export async function banFromWall(args: {
  spaceId: string
  profileId: string
  bannedBy: string
  reason?: string | null
}): Promise<boolean> {
  try {
    const { error } = await createAdminClient()
      .from('space_wall_bans')
      .upsert(
        { space_id: args.spaceId, profile_id: args.profileId, banned_by: args.bannedBy, reason: args.reason?.trim() || null },
        { onConflict: 'space_id,profile_id' },
      )
    return !error
  } catch {
    return false
  }
}

export async function liftWallBan(spaceId: string, profileId: string): Promise<boolean> {
  try {
    const { error } = await createAdminClient()
      .from('space_wall_bans')
      .delete()
      .eq('space_id', spaceId)
      .eq('profile_id', profileId)
    return !error
  } catch {
    return false
  }
}

// ── Arrivals ─────────────────────────────────────────────────────────────────────────────────────
// The people who joined this week, for the strip above the composer: a face, a first name and a
// reason to say hello. Paying memberships only (space_memberships, active, started this week); the
// team ladder is staff, not an arrival. Fail-safe to an empty list, which hides the strip.

const ARRIVALS_WINDOW_DAYS = 7

export async function readWallArrivals(spaceId: string, limit = 6): Promise<WallArrival[]> {
  const since = new Date(Date.now() - ARRIVALS_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString()
  try {
    const { data, error } = await createAdminClient()
      .from('space_memberships')
      .select('member_profile_id, started_at, created_at, person:profiles!member_profile_id ( display_name, handle, avatar_url )')
      .eq('space_id', spaceId)
      .eq('status', 'active')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error || !data) return []
    return (data as unknown as { member_profile_id: string; started_at: string | null; created_at: string; person: ProfileBits }[]).map((m) => ({
      profileId: m.member_profile_id,
      displayName: m.person?.display_name?.trim() || 'A new member',
      handle: m.person?.handle ?? null,
      avatarUrl: m.person?.avatar_url ?? null,
      joinedAt: m.started_at ?? m.created_at,
    }))
  } catch {
    return []
  }
}

// ── Service-role writes the wall's actions hand over (LIVE-2095) ────────────────────────────────
// The three app files that need the service role (poll options, the report queue) call these, so
// the RLS bypass lives in one module (check:admin-client) and every caller has already passed its
// own gate: createWallPost has a post the policy admitted, the console has canModerateWall.

/** Attach a poll's options to a wall post that the posts policy already admitted. On failure the
 *  post is removed so no question stands without its answers. Returns false on failure. */
export async function attachWallPollOptions(postId: string, options: readonly string[]): Promise<boolean> {
  const admin = createAdminClient()
  const { error } = await admin
    .from('post_poll_options')
    .insert(options.map((label, position) => ({ post_id: postId, label, position })))
  if (!error) return true
  await admin.from('posts').delete().eq('id', postId)
  console.error('[attachWallPollOptions]', { code: error.code ?? null, message: error.message })
  return false
}

type WallReport = {
  id: string
  reason: string
  details: string | null
  createdAt: string
  excerpt: string
  authorName: string
}

const REPORT_SCAN = 500

/** The open reports on posts (and replies) that live on this wall. The reports table has no
 *  Space-team read policy, so this runs on the service role AFTER the caller's canModerateWall
 *  gate. Fail-safe to an empty list. */
export async function listWallReports(spaceId: string): Promise<WallReport[]> {
  try {
    const admin = createAdminClient()
    const { data: posts } = await admin
      .from('posts')
      .select('id, body, author:profiles!author_id ( display_name )')
      .eq('scope_space_id', spaceId)
      .order('created_at', { ascending: false })
      .limit(REPORT_SCAN)
    const byId = new Map(
      ((posts ?? []) as unknown as { id: string; body: string | null; author: { display_name: string | null } | null }[]).map((p) => [p.id, p]),
    )
    if (byId.size === 0) return []
    const { data: reports } = await admin
      .from('reports')
      .select('id, reason, details, created_at, target_id')
      .eq('status', 'pending')
      .in('target_type', ['post', 'comment'])
      .in('target_id', [...byId.keys()])
      .order('created_at', { ascending: false })
      .limit(50)
    return ((reports ?? []) as { id: string; reason: string; details: string | null; created_at: string | null; target_id: string }[]).map((r) => {
      const post = byId.get(r.target_id)
      return {
        id: r.id,
        reason: r.reason,
        details: r.details,
        createdAt: r.created_at ?? new Date().toISOString(),
        excerpt: (post?.body ?? '').slice(0, 240),
        authorName: post?.author?.display_name ?? 'A member',
      }
    })
  } catch {
    return []
  }
}

/**
 * Close one pending report on a post (or reply) of THIS wall. 'hide' soft-hides the post and marks
 * the report actioned; 'dismiss' leaves the post and marks it dismissed. The report must point at
 * a post with this Space's scope, read before anything is written, so a Space team can never close
 * a report that belongs to another wall or to the platform queue. The CALLER has checked
 * canModerateWall. Returns an error sentence for a person, or null when done.
 */
export async function resolveWallReport(args: {
  spaceId: string
  reportId: string
  decision: 'hide' | 'dismiss'
  reviewerId: string
}): Promise<string | null> {
  const admin = createAdminClient()
  const { data: report } = await admin
    .from('reports')
    .select('id, target_type, target_id, status')
    .eq('id', args.reportId)
    .maybeSingle()
  if (!report || (report.target_type !== 'post' && report.target_type !== 'comment')) return 'That report could not be found.'
  if (report.status !== 'pending') return 'That report was already reviewed.'

  const { data: post } = await admin
    .from('posts')
    .select('id')
    .eq('id', report.target_id)
    .eq('scope_space_id', args.spaceId)
    .maybeSingle()
  if (!post) return 'That report is not about this wall.'

  if (args.decision === 'hide') {
    const { error: hideErr } = await admin
      .from('posts')
      .update({ hidden_at: new Date().toISOString(), hidden_by: args.reviewerId })
      .eq('id', post.id)
      .eq('scope_space_id', args.spaceId)
    if (hideErr) return 'That post could not be hidden.'
  }

  const { error } = await admin
    .from('reports')
    .update({
      status: args.decision === 'hide' ? 'actioned' : 'dismissed',
      reviewed_by: args.reviewerId,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', report.id)
    .eq('status', 'pending')
  if (error) return 'That report could not be closed.'
  return null
}
