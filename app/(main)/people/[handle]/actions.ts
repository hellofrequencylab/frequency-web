'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getProfileCapabilities } from '@/lib/core/load-capabilities'
import { getMyProfileId } from '@/lib/auth'
import { blockUser, unblockUser } from '@/lib/blocking'

export interface ModerateProfileResult {
  ok: boolean
  error?: string
}

// Capability-gated profile edit for moderators (profile.edit on a profile the
// viewer doesn't own = janitor, per the resolver). Edits the moderation-relevant
// fields only (display name + bio); identity/handle changes stay owner-only via
// /settings/profile. Uses the admin client AFTER the capability check.
export async function moderateUpdateProfile(
  profileId: string,
  data: { displayName: string; bio: string },
): Promise<ModerateProfileResult> {
  const caps = await getProfileCapabilities(profileId)
  if (!caps.has('profile.edit')) return { ok: false, error: 'Not allowed.' }

  const displayName = data.displayName.trim()
  if (!displayName) return { ok: false, error: 'Display name is required.' }

  const admin = createAdminClient()
  const { data: target } = await admin
    .from('profiles')
    .select('handle')
    .eq('id', profileId)
    .maybeSingle()

  const { error } = await admin
    .from('profiles')
    .update({ display_name: displayName, bio: data.bio.trim() || null })
    .eq('id', profileId)
  if (error) return { ok: false, error: error.message }

  if (target?.handle) revalidatePath(`/people/${target.handle}`)
  revalidatePath('/people')
  return { ok: true }
}

// Block / unblock a member (self only). Blocking also unfriends and stops DMs
// in both directions (lib/blocking.ts).
export async function blockProfileAction(profileId: string): Promise<{ ok: boolean }> {
  const myId = await getMyProfileId()
  if (!myId || myId === profileId) return { ok: false }
  await blockUser(myId, profileId)
  revalidatePath('/people')
  return { ok: true }
}

export async function unblockProfileAction(profileId: string): Promise<{ ok: boolean }> {
  const myId = await getMyProfileId()
  if (!myId) return { ok: false }
  await unblockUser(myId, profileId)
  revalidatePath('/people')
  return { ok: true }
}
