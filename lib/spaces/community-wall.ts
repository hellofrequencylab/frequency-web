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
    const [settings, standing] = await Promise.all([
      readWallSettings(wallSpaceId),
      readWallStanding({ spaceId: wallSpaceId, ownerProfileId: space.owner_profile_id, viewerProfileId: profileId }),
    ])
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
