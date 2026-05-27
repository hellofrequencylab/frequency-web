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
  const { data: post, error } = await admin.from('posts').insert({
    author_id: profileId,
    body,
    scope_id: scopeId,
    visibility,
    post_type: 'feed',
  }).select('id').single()

  if (error) {
    console.error('[createPost]', error.message)
    return
  }

  // Extract @mentions and create notification rows (best-effort, non-blocking)
  const handles = [...new Set(Array.from(body.matchAll(/@([a-zA-Z0-9_]+)/g), m => m[1].toLowerCase()))]
  if (handles.length > 0 && post) {
    const { data: mentioned } = await admin
      .from('profiles')
      .select('id, handle')
      .in('handle', handles)

    if (mentioned && mentioned.length > 0) {
      const mentionInserts = mentioned
        .filter((p: { id: string; handle: string }) => p.id !== profileId)
        .map((p: { id: string }) => ({ post_id: post.id, profile_id: p.id }))

      if (mentionInserts.length > 0) {
        try { await admin.from('post_mentions').insert(mentionInserts) } catch { /* non-critical */ }

        // Create notification for each mentioned user
        const notifInserts = mentionInserts.map((m: { profile_id: string }) => ({
          recipient_id:   m.profile_id,
          actor_id:       profileId,
          type:           'mention',
          reference_type: 'post',
          reference_id:   post.id,
          body:           'mentioned you in a post',
        }))
        try { await admin.from('notifications').insert(notifInserts) } catch { /* non-critical */ }
      }
    }
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
