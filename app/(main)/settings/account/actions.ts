'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getMyProfileId } from '@/lib/auth'
import { unblockUser } from '@/lib/blocking'
import { deleteMyAccount } from '@/lib/account'
import { type ActionResult, fail } from '@/lib/action-result'

export async function unblockFromSettings(profileId: string): Promise<void> {
  const myId = await getMyProfileId()
  if (!myId) return
  await unblockUser(myId, profileId)
  revalidatePath('/settings/account')
  revalidatePath('/settings') // the section now renders on the unified Settings page
}

// Permanently delete the signed-in member's account, then sign out and send them
// to the splash. Hard delete cascades the profile + content (lib/account.ts).
export async function deleteAccountAction(): Promise<ActionResult> {
  // The caller is established HERE as well as inside deleteMyAccount (which scopes the delete to
  // the session's own profile): the export must reach a gate of its own (check:authz, LIVE-307),
  // and a signed-out call gets a plain refusal instead of a sign-out and a redirect.
  const myId = await getMyProfileId()
  if (!myId) return fail('Sign in to delete your account.')
  const res = await deleteMyAccount()
  if (!res.ok) return fail('Could not delete your account. Please contact support.')
  const supabase = await createClient()
  await supabase.auth.signOut().catch(() => {})
  redirect('/')
}
