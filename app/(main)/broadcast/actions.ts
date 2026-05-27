'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

async function getCallerProfileId(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const admin = createAdminClient()
  const { data } = await admin
    .from('profiles')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  return data?.id ?? null
}

export async function toggleDispatchLike(dispatchId: string) {
  const profileId = await getCallerProfileId()
  if (!profileId) throw new Error('Unauthorized')

  const admin = createAdminClient()

  const { data: existing } = await admin
    .from('dispatch_likes')
    .select('id')
    .eq('dispatch_id', dispatchId)
    .eq('profile_id', profileId)
    .maybeSingle()

  if (existing) {
    await admin.from('dispatch_likes').delete().eq('id', existing.id)
  } else {
    await admin.from('dispatch_likes').insert({ dispatch_id: dispatchId, profile_id: profileId })
  }

  revalidatePath(`/broadcast/${dispatchId}`)
}

export async function addDispatchComment(dispatchId: string, body: string) {
  const profileId = await getCallerProfileId()
  if (!profileId) throw new Error('Unauthorized')

  const trimmed = body.trim()
  if (!trimmed || trimmed.length > 2000) throw new Error('Invalid comment')

  const admin = createAdminClient()
  const { error } = await admin.from('dispatch_comments').insert({
    dispatch_id: dispatchId,
    author_id:   profileId,
    body:        trimmed,
  })
  if (error) throw new Error(error.message)

  revalidatePath(`/broadcast/${dispatchId}`)
}

export async function deleteDispatchComment(commentId: string, dispatchId: string) {
  const profileId = await getCallerProfileId()
  if (!profileId) throw new Error('Unauthorized')

  const admin = createAdminClient()
  const { error } = await admin
    .from('dispatch_comments')
    .delete()
    .eq('id', commentId)
    .eq('author_id', profileId) // only own comments
  if (error) throw new Error(error.message)

  revalidatePath(`/broadcast/${dispatchId}`)
}

export async function castVote(optionId: string, dispatchId: string) {
  const profileId = await getCallerProfileId()
  if (!profileId) throw new Error('Unauthorized')

  const admin = createAdminClient()

  // Get all option IDs for this dispatch first
  const { data: options } = await admin
    .from('dispatch_poll_options')
    .select('id')
    .eq('dispatch_id', dispatchId)
  const optionIds = (options ?? []).map((o: { id: string }) => o.id)
  if (!optionIds.includes(optionId)) throw new Error('Invalid option')

  // Check if user already voted on any option for this dispatch
  const { data: existingVote } = await admin
    .from('dispatch_poll_votes')
    .select('id, option_id')
    .eq('profile_id', profileId)
    .in('option_id', optionIds)
    .maybeSingle()

  if (existingVote) {
    if (existingVote.option_id === optionId) {
      // Toggle off (unvote)
      await admin.from('dispatch_poll_votes').delete().eq('id', existingVote.id)
    } else {
      // Switch vote to new option
      await admin.from('dispatch_poll_votes').delete().eq('id', existingVote.id)
      await admin.from('dispatch_poll_votes').insert({ option_id: optionId, profile_id: profileId })
    }
  } else {
    await admin.from('dispatch_poll_votes').insert({ option_id: optionId, profile_id: profileId })
  }

  revalidatePath(`/broadcast/${dispatchId}`)
}
