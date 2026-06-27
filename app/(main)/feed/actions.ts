'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Database } from '@/lib/database.types'
import { getMyProfileId, getCallerProfile } from '@/lib/auth'
import { processGamificationEvent, recordStreakActivity } from '@/lib/achievements'
import { awardGems } from '@/lib/gems'
import { type ActionResult, ok, fail } from '@/lib/action-result'
import {
  assembleThread,
  aggregateReactionState,
  type RawComment,
  type CommentThread,
} from '@/lib/feed/comment-thread'

const HOST_PLUS = ['host', 'guide', 'mentor', 'janitor']

// Is this profile an active member of the circle? Gates writes/reads on
// group-scoped (private circle) content.
async function isActiveMember(
  admin: ReturnType<typeof createAdminClient>,
  profileId: string,
  circleId: string,
): Promise<boolean> {
  const { data } = await admin
    .from('memberships')
    .select('id')
    .eq('profile_id', profileId)
    .eq('circle_id', circleId)
    .eq('status', 'active')
    .maybeSingle()
  return !!data
}

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
  processGamificationEvent({ type: 'post_create', profileId }).catch((e) => console.error('[feed gamification]', e))
  recordStreakActivity(profileId, 'posting').catch((e) => console.error('[feed gamification]', e))
  awardGems(profileId, 'post_create').catch((e) => console.error('[feed gamification]', e))

  // Notify mentioned members (best-effort, non-blocking).
  if (post) await fanOutMentions(admin, post.id, body || '', profileId, 'a post')

  revalidatePath('/feed')
  revalidatePath('/circles', 'layout')
  revalidatePath('/people', 'layout')
}

export async function deletePost(postId: string) {
  const caller = await getCallerProfile()
  if (!caller) redirect('/sign-in')

  // Admin client to bypass RLS. The author may delete their own post; host+
  // (and admin tiers) may delete any post for moderation. The menu offers the
  // same set, so the server must honor it — otherwise a host deleting someone
  // else's post silently no-ops.
  const admin = createAdminClient()
  const canModerate = HOST_PLUS.includes(caller.community_role)

  let query = admin.from('posts').delete().eq('id', postId)
  if (!canModerate) query = query.eq('author_id', caller.id)

  const { error } = await query

  if (error) {
    console.error('[deletePost]', error.message)
    return
  }

  revalidatePath('/feed')
  revalidatePath('/circles', 'layout')
  revalidatePath('/people', 'layout')
}

export async function createReply(parentId: string, body: string) {
  const trimmed = body.trim().slice(0, 5000)
  if (!trimmed) return

  const profileId = await getMyProfileId()
  if (!profileId) redirect('/sign-in')

  // Inherit scope from the parent post so RLS scoping remains consistent
  const admin = createAdminClient()
  const { data: parent } = await admin
    .from('posts')
    .select('scope_id, visibility, author_id')
    .eq('id', parentId)
    .maybeSingle()
  if (!parent) return

  // Self-reply guard: replying to your OWN post grants nothing (anti-farming).
  // A user can't pump Gems or a comment badge by talking to himself.
  const isSelfReply = parent.author_id === profileId

  // Replying inside a circle requires active membership, same as a top-level
  // group post (createPost above) — otherwise any user could post into a
  // private circle's thread by replying.
  if (parent.visibility === 'group') {
    if (!parent.scope_id || !(await isActiveMember(admin, profileId, parent.scope_id))) return
  }

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

  // Only reward replies to OTHER people's posts — never your own.
  if (!isSelfReply) {
    awardGems(profileId, 'comment_reply').catch((e) => console.error('[feed gamification]', e))
    processGamificationEvent({ type: 'post_create', profileId }).catch((e) => console.error('[feed gamification]', e))
  }

  // No revalidation: PostReplies re-fetches the thread (and re-derives the count)
  // optimistically right after this resolves, so revalidating the feed here would
  // only refetch the whole feed RPC for nothing (the same wasted work as the old
  // reaction lag).
}

// The columns every comment row needs (author drives avatar + ProfileFlair).
const COMMENT_SELECT = `id, body, created_at, parent_id,
       author:profiles!author_id ( id, display_name, handle, avatar_url, membership_tier )`

// Cap the subtree so a runaway thread can't fan out unbounded. Top-level comments
// are bounded here; nested replies are fetched in ONE follow-up over those ids.
const TOP_LEVEL_LIMIT = 100
const NESTED_LIMIT = 300

/**
 * Fetch the full 2-level comment subtree for a root post.
 *
 * Two batched queries (no N+1):
 *   1. direct children   — `parent_id = parentId`
 *   2. nested replies    — `parent_id IN (childIds)` (one round-trip)
 * then ONE `post_reactions` read over every comment id for heart counts +
 * whether the viewer reacted. The same private-circle gate and `hidden_at IS NULL`
 * filter apply to BOTH comment queries.
 *
 * Returns top-level comments (each with a `replies` array) plus the subtree
 * `total` — the count the comment badge should show.
 */
export async function fetchReplies(parentId: string): Promise<CommentThread> {
  const empty: CommentThread = { comments: [], total: 0 }

  const profileId = await getMyProfileId()
  if (!profileId) return empty

  const admin = createAdminClient()
  // Don't expose replies inside a private circle to non-members.
  const { data: parent } = await admin
    .from('posts')
    .select('scope_id, visibility')
    .eq('id', parentId)
    .maybeSingle()
  if (!parent) return empty
  if (parent.visibility === 'group') {
    if (!parent.scope_id || !(await isActiveMember(admin, profileId, parent.scope_id))) return empty
  }

  // 1. Direct children of the root post.
  const { data: topRows } = await admin
    .from('posts')
    .select(COMMENT_SELECT)
    .eq('parent_id', parentId)
    .is('hidden_at', null)
    .order('created_at', { ascending: true })
    .limit(TOP_LEVEL_LIMIT)

  const topLevel = (topRows ?? []) as unknown as RawComment[]
  const topIds = topLevel.map((c) => c.id)

  // 2. One batched follow-up for the nested replies (children of the children).
  let nested: RawComment[] = []
  if (topIds.length > 0) {
    const { data: nestedRows } = await admin
      .from('posts')
      .select(COMMENT_SELECT)
      .in('parent_id', topIds)
      .is('hidden_at', null)
      .order('created_at', { ascending: true })
      .limit(NESTED_LIMIT)
    nested = (nestedRows ?? []) as unknown as RawComment[]
  }

  // 3. One reaction read over every comment id (top-level + nested) — heart only,
  //    aggregated in code so the viewer's button seeds with correct state. Mirrors
  //    how the feed loader derives a post's reaction state, but batched.
  const allIds = [...topIds, ...nested.map((r) => r.id)]
  let reactions = new Map<string, { reaction_count: number; viewer_reacted: boolean }>()
  if (allIds.length > 0) {
    const { data: reactionRows } = await admin
      .from('post_reactions')
      .select('post_id, profile_id')
      .in('post_id', allIds)
      .eq('reaction_type', 'heart')
    reactions = aggregateReactionState(
      (reactionRows ?? []) as Array<{ post_id: string; profile_id: string }>,
      profileId,
    )
  }

  return assembleThread(topLevel, nested, reactions)
}

// Toggle the caller's heart / plus on a post. This is the site's highest-frequency
// interaction, so it is deliberately lean: the client (ReactionButton) owns the
// optimistic UI and tells us the DIRECTION it just applied (`activate`), so we do
// exactly ONE idempotent write and NO revalidation (the client already reflects the
// change; revalidating would refetch the whole feed and reintroduce the old lag).
// Returns the new {active, count} so the client can reconcile its base state.
export async function toggleReaction(
  postId: string,
  reactionType: 'heart' | 'plus_one',
  activate: boolean,
): Promise<ActionResult<{ active: boolean; count: number }>> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Not signed in')

  // The user client so RLS applies (a member may only react as themselves).
  const supabase = await createClient()

  if (activate) {
    // Idempotent insert against the unique (post_id, profile_id, reaction_type)
    // constraint: a double-tap that races just no-ops instead of erroring.
    // `.select()` returns the row only when this upsert actually INSERTED — a
    // duplicate (ignored) yields no rows. We use that to award only on a
    // genuinely-new reaction (anti-farming: un-react/re-react can't pump the cap).
    const { data: inserted, error } = await supabase
      .from('post_reactions')
      .upsert(
        { post_id: postId, profile_id: profileId, reaction_type: reactionType },
        { onConflict: 'post_id,profile_id,reaction_type', ignoreDuplicates: true },
      )
      .select('id')
    if (error) {
      console.error('[toggleReaction]', error.message)
      return fail('Could not save your reaction')
    }
    // Only a first-time reaction to someone ELSE's post earns a gem.
    const isNewReaction = (inserted?.length ?? 0) > 0
    if (isNewReaction) {
      const admin = createAdminClient()
      const { data: post } = await admin
        .from('posts')
        .select('author_id')
        .eq('id', postId)
        .maybeSingle()
      if (post && post.author_id !== profileId) {
        awardGems(profileId, 'reaction').catch((e) => console.error('[feed gamification]', e))
      }
    }
  } else {
    // Idempotent un-react: delete by the natural key, no pre-existence check.
    const { error } = await supabase
      .from('post_reactions')
      .delete()
      .match({ post_id: postId, profile_id: profileId, reaction_type: reactionType })
    if (error) {
      console.error('[toggleReaction]', error.message)
      return fail('Could not remove your reaction')
    }
  }

  // Re-read this reaction's count so the client's base state stays exact even if a
  // concurrent reaction landed; cheap (a single indexed count on one post).
  const { count } = await supabase
    .from('post_reactions')
    .select('id', { count: 'exact', head: true })
    .eq('post_id', postId)
    .eq('reaction_type', reactionType)

  return ok({ active: activate, count: count ?? 0 })
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

/** Set your own avatar (the Zap menu's "Take a profile pic", ADR-230). The file
 *  is already in the avatars bucket (client upload, own folder); this persists
 *  the public URL onto the caller's own profile and nothing else. */
export async function updateMyAvatar(avatarUrl: string): Promise<void> {
  const profileId = await getMyProfileId()
  if (!profileId) throw new Error('Not signed in')
  if (!/^https:\/\//.test(avatarUrl) || avatarUrl.length > 600) throw new Error('Bad avatar URL')
  const admin = createAdminClient()
  const { error } = await admin.from('profiles').update({ avatar_url: avatarUrl }).eq('id', profileId)
  if (error) throw new Error(error.message)
  revalidatePath('/feed')
  revalidatePath('/people', 'layout')
}
