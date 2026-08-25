'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { resolveGuestbookOwner } from '@/lib/spotlight/guestbook'
import {
  normalizeGuestbookMessage,
  GUESTBOOK_SIGNS_PER_HOUR,
} from '@/lib/spotlight/guestbook.shared'

// Spotlight Guestbook — the WRITE side. Every action here runs under the caller's SESSION
// client, so the spotlight_guestbook RLS policies are the authorization boundary:
//   sign   -> insert as yourself only (signer_profile_id = get_my_profile_id()).
//   remove -> delete allowed for the guestbook owner, the signer, or staff.
//   hide   -> update allowed for the guestbook owner or staff (the moderation seam).
// The app layer adds what RLS cannot express: message normalization, the friendly
// self-sign refusal (the schema also enforces it), and the hourly rate limit (counted
// over the signer's own rows, which their session can read).
//
// Postgres error codes the sign path translates to member copy:
const UNIQUE_VIOLATION = '23505' // one note per person per guestbook
const CHECK_VIOLATION = '23514' // not-self / length backstops

/** Resolve the caller's own profile id, or null when signed out. */
async function myProfileId(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase
    .from('profiles')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  return data?.id ?? null
}

/** Both surfaces that render this guestbook (the public mini-site + the in-app profile). */
function revalidateGuestbook(ownerHandle: string) {
  revalidatePath(`/spotlight/${ownerHandle}`)
  revalidatePath(`/people/${ownerHandle}`)
}

/** Leave a note in a member's guestbook. One note per person per guestbook. */
export async function signSpotlightGuestbook(
  ownerHandle: string,
  rawMessage: unknown,
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const me = await myProfileId(supabase)
  if (!me) return { error: 'Sign in to leave a note.' }

  const message = normalizeGuestbookMessage(rawMessage)
  if (!message) return { error: 'Write a couple of words first.' }

  const ownerId = await resolveGuestbookOwner(ownerHandle)
  if (!ownerId) return { error: 'That page is not available.' }
  if (ownerId === me) return { error: 'This guestbook is yours. Share the page and let other people sign it.' }

  // Rate limit: this signer's notes across ALL guestbooks in the last hour. The count runs
  // under the signer's own session (the signer arm of the select policy sees their rows,
  // hidden or not).
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { count } = await supabase
    .from('spotlight_guestbook')
    .select('id', { count: 'exact', head: true })
    .eq('signer_profile_id', me)
    .gte('created_at', hourAgo)
  if ((count ?? 0) >= GUESTBOOK_SIGNS_PER_HOUR) {
    return { error: 'That is a lot of guestbooks in one hour. Try again in a bit.' }
  }

  const { error } = await supabase.from('spotlight_guestbook').insert({
    owner_profile_id: ownerId,
    signer_profile_id: me,
    message,
  })
  if (error) {
    if (error.code === UNIQUE_VIOLATION) return { error: 'You already signed this guestbook.' }
    if (error.code === CHECK_VIOLATION) return { error: 'That note did not go through. Keep it under 500 characters.' }
    return { error: 'Could not save your note. Try again.' }
  }

  revalidateGuestbook(ownerHandle)
  return {}
}

/**
 * Remove one note. RLS decides who may: the guestbook owner (moderating their page), the
 * signer (taking back their own note), or staff. An unauthorized call deletes nothing.
 */
export async function removeGuestbookEntry(
  entryId: string,
  ownerHandle: string,
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const me = await myProfileId(supabase)
  if (!me) return { error: 'Sign in first.' }

  const { data, error } = await supabase
    .from('spotlight_guestbook')
    .delete()
    .eq('id', entryId)
    .select('id')
  if (error) return { error: 'Could not remove that note. Try again.' }
  if (!data || data.length === 0) return { error: 'That note is already gone.' }

  revalidateGuestbook(ownerHandle)
  return {}
}

/**
 * Hide one note (owner/staff moderation, per RLS update policy). The note stops rendering
 * everywhere but keeps its slot, so the signer cannot sign again. An unauthorized call
 * updates nothing.
 */
export async function hideGuestbookEntry(
  entryId: string,
  ownerHandle: string,
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const me = await myProfileId(supabase)
  if (!me) return { error: 'Sign in first.' }

  const { data, error } = await supabase
    .from('spotlight_guestbook')
    .update({ hidden_at: new Date().toISOString() })
    .eq('id', entryId)
    .select('id')
  if (error) return { error: 'Could not hide that note. Try again.' }
  if (!data || data.length === 0) return { error: 'That note is already gone.' }

  revalidateGuestbook(ownerHandle)
  return {}
}
