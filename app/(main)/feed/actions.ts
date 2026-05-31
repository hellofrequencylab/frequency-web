'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Database } from '@/lib/database.types'
import { getMyProfileId } from '@/lib/auth'
import { processGamificationEvent, recordStreakActivity } from '@/lib/achievements'
import { awardGems } from '@/lib/gems'

const HOST_PLUS = ['host', 'guide', 'mentor', 'janitor']

// Notify members @mentioned in a post/reply body: store post_mentions + create
// in-app 'mention' notifications (best-effort). Shared by createPost + createReply.
async function fanOutMentions(
  admin: ReturnType<typeof createAdminClient>,
  postId: string,
  body: string,
  authorId: string,
  context: string,
) {
  const handles = [
    ...new Set(Array.from(body.matchAll(/@([a-zA-Z0-9_]+)/g), (m) => m[1].toLowerCase())),
  ]
  if (handles.length === 0) return
  const { data: mentioned } = await admin.from('profiles').select('id, handle').in('handle', handles)
  const targets = (mentioned ?? []).filter((p) => p.id !== authorId)
  if (targets.length === 0) return
  try {
    await admin
      .from('post_mentions')
      .insert(targets.map((p) => ({ post_id: postId, profile_id: p.id })))
  } catch {
    /* non-critical */
  }
  try {
    await admin.from('notifications').insert(
      targets.map((p) => ({
        recipient_id: p.id,
        actor_id: authorId,
        type: 'mention',
        reference_type: 'post',
        reference_id: postId,
        body: `mentioned you in ${context}`,
      })),
    )
  } catch {
    /* non-critical */
  }
}

export async function createPost(formData: FormData) {
  const body = (formData.get('body') as string | null)?.trim()
  const scopeId = formData.get('scopeId') as string | null
  const requestedVisibility = (formData.get('visibility') as string) || 'public'
  const postType = (formData.get('post_type') as string | null) || 'feed'
  const imageUrl = (formData.get('imageUrl') as string | null)?.trim() || null
  const isAnnouncement = postType === 'announcement'

  // A host announcement broadcasts beyond the circle (to the hub, or the
  // topical channel's followers if hub-less) — that wider reach is what
  // `cluster` visibility resolves. A member's post stays circle-only (`group`).
  const visibility = isAnnouncement ? 'cluster' : requestedVisibility

  if ((!body && !imageUrl) || !scopeId) return

  const profileId = await getMyProfileId()
  if (!profileId) redirect('/sign-in')

  // The admin client bypasses RLS, so authorisation MUST be enforced here.
  const admin = createAdminClient()

  // Announcements pin to the top and broadcast beyond the circle (cluster
  // reach) — restricted to host+. The UI hides the toggle for everyone else;
  // this stops a crafted request from self-elevating a post.
  if (isAnnouncement) {
    const { data: profile } = await admin
      .from('profiles')
      .select('community_role')
      .eq('id', profileId)
      .maybeSingle()
    if (!profile || !HOST_PLUS.includes(profile.community_role ?? '')) return
  }

  // Circle-scoped (`group`) posts require active membership in that circle.
  if (visibility === 'group') {
    const { data: membership } = await admin
      .from('memberships')
      .select('id')
      .eq('profile_id', profileId)
      .eq('circle_id', scopeId)
      .eq('status', 'active')
      .maybeSingle()
    if (!membership) return
  }

  const mediaUrls = imageUrl ? [imageUrl] : []

  const { data: post, error } = await admin.from('posts').insert({
    author_id: profileId,
    body: body || '',
    scope_id: scopeId,
    visibility: visibility as Database['public']['Tables']['posts']['Insert']['visibility'],
    post_type: postType as Database['public']['Tables']['posts']['Insert']['post_type'],
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

  // Notify mentioned members (best-effort, non-blocking).
  if (post) await fanOutMentions(admin, post.id, body || '', profileId, 'a post')

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

  const { data: reply } = await admin.from('posts').insert({
    author_id:  profileId,
    body:       trimmed,
    scope_id:   parent.scope_id,
    visibility: parent.visibility,
    post_type:  'feed',
    parent_id:  parentId,
  }).select('id').maybeSingle()

  // Notify members @mentioned in the reply (same fan-out as top-level posts).
  if (reply) await fanOutMentions(admin, reply.id, trimmed, profileId, 'a reply')

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

export async function pinPost(postId: string) {
  const profileId = await getMyProfileId()
  if (!profileId) return
  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('community_role').eq('id', profileId).maybeSingle()
  if (!profile || !HOST_PLUS.includes(profile.community_role ?? '')) return
  await admin.from('posts').update({ is_pinned: true }).eq('id', postId)
  revalidatePath('/feed')
}

export async function unpinPost(postId: string) {
  const profileId = await getMyProfileId()
  if (!profileId) return
  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('community_role').eq('id', profileId).maybeSingle()
  if (!profile || !HOST_PLUS.includes(profile.community_role ?? '')) return
  await admin.from('posts').update({ is_pinned: false }).eq('id', postId)
  revalidatePath('/feed')
}
