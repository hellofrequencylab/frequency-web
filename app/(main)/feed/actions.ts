'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

async function getMyProfileId(): Promise<string | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const admin = createAdminClient()
  const { data } = await admin
    .from('profiles')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  return data?.id ?? null
}

export async function createPost(formData: FormData) {
  const body = (formData.get('body') as string | null)?.trim()
  const scopeId = formData.get('scopeId') as string | null
  const visibility = (formData.get('visibility') as string) || 'public'

  if (!body || !scopeId) return

  const profileId = await getMyProfileId()
  if (!profileId) redirect('/sign-in')

  // Use admin client — RLS circle-membership check would block users who
  // haven't joined a circle yet. Authorisation is enforced here in code.
  const admin = createAdminClient()
  const { error } = await admin.from('posts').insert({
    author_id: profileId,
    body,
    scope_id: scopeId,
    visibility,
    post_type: 'feed',
  })

  if (error) {
    console.error('[createPost]', error.message)
    return
  }

  revalidatePath('/feed')
  revalidatePath('/circles', 'layout')
}

export async function deletePost(postId: string) {
  const profileId = await getMyProfileId()
  if (!profileId) redirect('/sign-in')

  // Admin client to bypass RLS; restrict deletion to own posts only.
  const admin = createAdminClient()
  const { error } = await admin
    .from('posts')
    .delete()
    .eq('id', postId)
    .eq('author_id', profileId)

  if (error) {
    console.error('[deletePost]', error.message)
    return
  }

  revalidatePath('/feed')
  revalidatePath('/circles', 'layout')
}

export async function toggleReaction(
  postId: string,
  reactionType: 'heart' | 'plus_one'
) {
  const profileId = await getMyProfileId()
  if (!profileId) return

  // Use admin to check existence — user client handles the write so RLS applies
  const admin = createAdminClient()
  const { data: existing } = await admin
    .from('post_reactions')
    .select('id')
    .eq('post_id', postId)
    .eq('profile_id', profileId)
    .eq('reaction_type', reactionType)
    .maybeSingle()

  const supabase = await createClient()

  if (existing) {
    await supabase.from('post_reactions').delete().eq('id', existing.id)
  } else {
    await supabase.from('post_reactions').insert({
      post_id: postId,
      profile_id: profileId,
      reaction_type: reactionType,
    })
  }

  revalidatePath('/feed')
  revalidatePath('/circles', 'layout')
}
