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
import { writeWallSettings, wallSettingsFromRow } from '@/lib/spaces/community-wall'

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
