'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendDispatchNotificationEmail } from '@/lib/email'

type CommunityRole = 'member' | 'crew' | 'host' | 'guide' | 'mentor' | 'janitor'
const HIERARCHY: CommunityRole[] = ['member', 'crew', 'host', 'guide', 'mentor', 'janitor']
function hasRole(role: CommunityRole, min: CommunityRole) {
  return HIERARCHY.indexOf(role) >= HIERARCHY.indexOf(min)
}

async function getCallerProfile(): Promise<{ id: string; community_role: CommunityRole } | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const admin = createAdminClient()
  const { data } = await admin
    .from('profiles')
    .select('id, community_role')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  return data as { id: string; community_role: CommunityRole } | null
}

async function getCallerProfileId(): Promise<string | null> {
  const p = await getCallerProfile()
  return p?.id ?? null
}

function makeExcerpt(body: string): string {
  return body.replace(/[#*_`[\]]/g, '').replace(/\s+/g, ' ').trim().slice(0, 200)
}

export async function createAndPublishDispatch(fd: FormData) {
  const caller = await getCallerProfile()
  if (!caller || !hasRole(caller.community_role, 'host')) throw new Error('Unauthorized')

  const title          = (fd.get('title') as string)?.trim()
  const body           = (fd.get('body') as string)?.trim()
  const dispatch_type  = (fd.get('dispatch_type') as string) || 'post'
  const audience_scope = fd.get('audience_scope') as string
  const audience_id    = (fd.get('audience_id') as string)?.trim()

  if (!title || !body || !audience_scope || !audience_id) throw new Error('Missing required fields')

  const excerpt = makeExcerpt(body)
  const admin   = createAdminClient()

  const { data: dispatch, error } = await admin
    .from('dispatches')
    .insert({
      title,
      body,
      excerpt,
      dispatch_type,
      audience_scope,
      audience_id,
      author_id:    caller.id,
      status:       'published',
      published_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (error) throw new Error(error.message)

  revalidatePath('/broadcast')
  revalidatePath('/feed')

  // Fire-and-forget email fan-out
  ;(async () => {
    try {
      const { data: authorProfile } = await admin
        .from('profiles')
        .select('display_name')
        .eq('id', caller.id)
        .maybeSingle()
      const authorName = authorProfile?.display_name ?? 'A host'
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://hellofrequency.com'
      const dispatchUrl = `${appUrl}/broadcast/${dispatch.id}`

      let profileIds: string[] = []
      if (audience_scope === 'circle') {
        const { data } = await admin.from('memberships').select('profile_id').eq('circle_id', audience_id).eq('status', 'active')
        profileIds = (data ?? []).map((m: any) => m.profile_id)
      } else if (audience_scope === 'hub') {
        const { data: circles } = await admin.from('circles').select('id').eq('hub_id', audience_id)
        const cids = (circles ?? []).map((c: any) => c.id)
        if (cids.length > 0) {
          const { data } = await admin.from('memberships').select('profile_id').in('circle_id', cids).eq('status', 'active')
          profileIds = (data ?? []).map((m: any) => m.profile_id)
        }
      } else if (audience_scope === 'nexus') {
        const { data: hubs } = await admin.from('hubs').select('id').eq('nexus_id', audience_id)
        const hids = (hubs ?? []).map((h: any) => h.id)
        if (hids.length > 0) {
          const { data: circles } = await admin.from('circles').select('id').in('hub_id', hids)
          const cids = (circles ?? []).map((c: any) => c.id)
          if (cids.length > 0) {
            const { data } = await admin.from('memberships').select('profile_id').in('circle_id', cids).eq('status', 'active')
            profileIds = (data ?? []).map((m: any) => m.profile_id)
          }
        }
      }
      profileIds = [...new Set(profileIds)]
      if (!profileIds.length) return
      const { data: profiles } = await admin.from('profiles').select('display_name, auth_user_id').in('id', profileIds)
      if (!profiles?.length) return
      for (const profile of profiles) {
        if (!profile.auth_user_id) continue
        const { data: { user } } = await admin.auth.admin.getUserById(profile.auth_user_id)
        if (!user?.email) continue
        await sendDispatchNotificationEmail({ to: user.email, recipientName: profile.display_name, authorName, dispatchTitle: title, excerpt, dispatchUrl })
      }
    } catch (err) {
      console.error('[createAndPublishDispatch] email fan-out failed:', err)
    }
  })()
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
