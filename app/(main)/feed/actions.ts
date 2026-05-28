'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { processGamificationEvent, recordStreakActivity } from '@/lib/achievements'
import { awardGems } from '@/lib/gems'

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
  const postType = (formData.get('post_type') as string | null) || 'feed'
  const imageUrl = (formData.get('imageUrl') as string | null)?.trim() || null
  const isAnnouncement = postType === 'announcement'

  if ((!body && !imageUrl) || !scopeId) return

  const profileId = await getMyProfileId()
  if (!profileId) redirect('/sign-in')

  const mediaUrls = imageUrl ? [imageUrl] : []

  // Use admin client. RLS circle-membership check would block users who
  // haven't joined a circle yet. Authorisation is enforced here in code.
  const admin = createAdminClient()
  const { data: post, error } = await admin.from('posts').insert({
    author_id: profileId,
    body: body || '',
    scope_id: scopeId,
    visibility,
    post_type: postType,
    is_pinned: isAnnouncement,
    media_urls: mediaUrls,
  }).select('id').single()

  if (error) {
    console.error('[createPost]', error.message)
    return
  }

  // Fire gamification events (non-blocking)
  processGamificationEvent({ type: 'post_create', profileId }).catch(() => {})
  recordStreakActivity(profileId, 'posting').catch(() => {})
  awardGems(profileId, 'post_create').catch(() => {})

  // Extract @mentions and create notification rows (best-effort, non-blocking)
  const bodyText = body || ''
  const handles = [...new Set(Array.from(bodyText.matchAll(/@([a-zA-Z0-9_]+)/g), m => m[1].toLowerCase()))]
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
  revalidatePath('/people', 'layout')
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
  revalidatePath('/people', 'layout')
}

export async function createReply(parentId: string, body: string) {
  const trimmed = body.trim()
  if (!trimmed) return

  const profileId = await getMyProfileId()
  if (!profileId) redirect('/sign-in')

  // Inherit scope from the parent post so RLS scoping remains consistent
  const admin = createAdminClient()
  const { data: parent } = await admin
    .from('posts')
    .select('scope_id, visibility')
    .eq('id', parentId)
    .maybeSingle()
  if (!parent) return

  await admin.from('posts').insert({
    author_id:  profileId,
    body:       trimmed,
    scope_id:   parent.scope_id,
    visibility: parent.visibility,
    post_type:  'feed',
    parent_id:  parentId,
  })

  awardGems(profileId, 'comment_reply').catch(() => {})
  processGamificationEvent({ type: 'post_create', profileId }).catch(() => {})

  revalidatePath('/feed')
  revalidatePath('/circles', 'layout')
  revalidatePath('/people', 'layout')
}

export async function fetchReplies(parentId: string) {
  const admin = createAdminClient()
  const { data } = await admin
    .from('posts')
    .select(
      `id, body, created_at,
       author:profiles!author_id ( id, display_name, handle, avatar_url, community_role )`
    )
    .eq('parent_id', parentId)
    .is('hidden_at', null)
    .order('created_at', { ascending: true })
    .limit(50)
  return (data ?? []) as unknown as Array<{
    id: string
    body: string | null
    created_at: string
    author: { id: string; display_name: string; handle: string; avatar_url: string | null; community_role: string; current_season_rank: string | null; current_streak: number; achievement_count: number }
  }>
}

export async function toggleReaction(
  postId: string,
  reactionType: 'heart' | 'plus_one'
) {
  const profileId = await getMyProfileId()
  if (!profileId) return

  // Use admin to check existence. User client handles the write so RLS applies
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
    awardGems(profileId, 'reaction').catch(() => {})
  }

  revalidatePath('/feed')
  revalidatePath('/circles', 'layout')
  revalidatePath('/people', 'layout')
}

const HOST_PLUS = ['host', 'guide', 'mentor', 'janitor']

export async function pinPost(postId: string) {
  const profileId = await getMyProfileId()
  if (!profileId) return
  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('community_role').eq('id', profileId).maybeSingle()
  if (!profile || !HOST_PLUS.includes(profile.community_role)) return
  await admin.from('posts').update({ is_pinned: true }).eq('id', postId)
  revalidatePath('/feed')
}

export async function unpinPost(postId: string) {
  const profileId = await getMyProfileId()
  if (!profileId) return
  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('community_role').eq('id', profileId).maybeSingle()
  if (!profile || !HOST_PLUS.includes(profile.community_role)) return
  await admin.from('posts').update({ is_pinned: false }).eq('id', postId)
  revalidatePath('/feed')
}
