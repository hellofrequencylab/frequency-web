'use server'

// The owner's Community wall controls (ADR-1938, LIVE-2077): who reads, who posts, whether
// followers may reply and high five, and moderation of posts on the wall.
//
// Settings: every call re-resolves the Space and the caller's standing on it, then writes on the
// service role (the table refuses member writes by design). Moderation: pin, unpin, hide and
// restore run on the SESSION client, so the posts update policy (private.can_moderate_space_wall)
// is the authority and this file never becomes a second one.

import { revalidatePath } from 'next/cache'
import { getCallerProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { ok, fail, type ActionResult } from '@/lib/action-result'
import { banFromWall, liftWallBan, resolveWallReport, writeWallSettings, wallSettingsFromRow } from '@/lib/spaces/community-wall'

function revalidateWall(slug: string) {
  revalidatePath(`/spaces/${slug}/community`)
  revalidatePath(`/spaces/${slug}/manage/community`)
}

async function resolveEditable(slug: string) {
  const caller = await getCallerProfile()
  if (!caller) return null
  const space = await getVisibleSpaceBySlug(slug, caller.id)
  if (!space) return null
  const caps = await getSpaceCapabilities(space, caller.id)
  if (!caps.canEditProfile) return null
  return { space, caller }
}

export async function saveWallSettings(input: {
  slug: string
  readAccess: string
  postAccess: string
  followersInteract: boolean
}): Promise<ActionResult> {
  const ctx = await resolveEditable(input.slug)
  if (!ctx) return fail('Only the people who run this Space can change its wall.')
  const settings = wallSettingsFromRow({
    read_access: input.readAccess,
    post_access: input.postAccess,
    followers_interact: input.followersInteract,
  })
  const saved = await writeWallSettings(ctx.space.id, settings)
  if (!saved) return fail('That did not save. Try again in a moment.')
  revalidateWall(input.slug)
  return ok()
}

export type WallModeration = 'pin' | 'unpin' | 'hide' | 'restore'

export async function moderateWallPost(input: {
  slug: string
  postId: string
  action: WallModeration
}): Promise<ActionResult> {
  const ctx = await resolveEditable(input.slug)
  if (!ctx) return fail('Only the people who run this Space can moderate its wall.')
  const patch =
    input.action === 'pin'
      ? { is_pinned: true }
      : input.action === 'unpin'
        ? { is_pinned: false }
        : input.action === 'hide'
          ? { hidden_at: new Date().toISOString(), hidden_by: ctx.caller.id }
          : { hidden_at: null, hidden_by: null }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('posts')
    .update(patch)
    .eq('id', input.postId)
    .eq('scope_space_id', ctx.space.id)
    .select('id')
  if (error || !data?.length) return fail('That post could not be changed.')
  revalidateWall(input.slug)
  return ok()
}

// ── LIVE-2095: bans and the Space's report queue ────────────────────────────────────────────────
// These need the MODERATION rung (owner, admin, moderator), the rungs private.can_moderate_space_wall
// admits; an editor runs the settings above but does not put people out. Bans and report reviews
// write on the service role (neither table takes member writes), so the gate here is the rule, and it
// mirrors the database's.

async function resolveModerator(slug: string) {
  const caller = await getCallerProfile()
  if (!caller) return null
  const space = await getVisibleSpaceBySlug(slug, caller.id)
  if (!space) return null
  const caps = await getSpaceCapabilities(space, caller.id)
  if (!caps.canModerateWall) return null
  return { space, caller }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_REASON = 500

export async function banWallMember(input: { slug: string; profileId: string; reason?: string }): Promise<ActionResult> {
  if (!UUID_RE.test(input.profileId)) return fail('That person could not be found.')
  const ctx = await resolveModerator(input.slug)
  if (!ctx) return fail('Only the people who moderate this Space can ban someone from its wall.')
  if (input.profileId === ctx.caller.id) return fail('You cannot ban yourself from your own wall.')
  if (input.profileId === ctx.space.ownerProfileId) return fail('The owner of a Space cannot be banned from its wall.')
  const reason = (input.reason ?? '').trim().slice(0, MAX_REASON) || null
  const saved = await banFromWall({ spaceId: ctx.space.id, profileId: input.profileId, bannedBy: ctx.caller.id, reason })
  if (!saved) return fail('That did not save. Try again in a moment.')
  revalidateWall(input.slug)
  return ok()
}

export async function liftWallBanAction(input: { slug: string; profileId: string }): Promise<ActionResult> {
  if (!UUID_RE.test(input.profileId)) return fail('That person could not be found.')
  const ctx = await resolveModerator(input.slug)
  if (!ctx) return fail('Only the people who moderate this Space can lift a ban.')
  const lifted = await liftWallBan(ctx.space.id, input.profileId)
  if (!lifted) return fail('That did not save. Try again in a moment.')
  revalidateWall(input.slug)
  return ok()
}

export type WallReportDecision = 'hide' | 'dismiss'

/**
 * Close one report on a post (or a reply) that lives on this wall: 'hide' soft-hides the post and
 * marks the report actioned; 'dismiss' leaves the post and marks it dismissed. The read-then-write
 * runs in lib/spaces/community-wall.ts resolveWallReport, after this gate.
 */
export async function reviewWallReport(input: { slug: string; reportId: string; decision: WallReportDecision }): Promise<ActionResult> {
  if (!UUID_RE.test(input.reportId)) return fail('That report could not be found.')
  if (input.decision !== 'hide' && input.decision !== 'dismiss') return fail('That is not a choice here.')
  const ctx = await resolveModerator(input.slug)
  if (!ctx) return fail('Only the people who moderate this Space can review its reports.')
  const problem = await resolveWallReport({ spaceId: ctx.space.id, reportId: input.reportId, decision: input.decision, reviewerId: ctx.caller.id })
  if (problem) return fail(problem)
  revalidateWall(input.slug)
  return ok()
}
