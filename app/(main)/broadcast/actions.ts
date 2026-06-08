'use server'

import type { SupabaseClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCallerProfile } from '@/lib/auth'
import { sendDispatchNotificationEmail } from '@/lib/email'
import { shouldSend } from '@/lib/notification-preferences'
import { sendPushToProfile } from '@/lib/push'
import { atLeastRole } from '@/lib/core/roles'

// Role-ladder comparison — single source in lib/core/roles.
const hasRole = atLeastRole

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

  const isGlobal = audience_scope === 'global'
  // Global reaches every member — staff/janitor only (Phase D, ADR-088).
  if (isGlobal && !hasRole(caller.community_role, 'janitor')) {
    throw new Error('Only staff can broadcast globally.')
  }
  if (!title || !body || !audience_scope || (!isGlobal && !audience_id)) throw new Error('Missing required fields')

  const excerpt = makeExcerpt(body)
  const admin   = createAdminClient()

  // Association guard: an admin tier (janitor+) may broadcast anywhere; everyone else
  // may only broadcast to a scope they LEAD — the circle's host, the hub's guide, or
  // the nexus's mentor matching the audience.
  if (!hasRole(caller.community_role, 'janitor')) {
    let led = false
    if (audience_scope === 'circle') {
      const { data: c } = await admin.from('circles').select('host_id, hub_id').eq('id', audience_id).maybeSingle()
      if (c?.host_id === caller.id) led = true
      else if (c?.hub_id) {
        const { data: h } = await admin.from('hubs').select('guide_id, nexus_id').eq('id', c.hub_id).maybeSingle()
        if (h?.guide_id === caller.id) led = true
        else if (h?.nexus_id) {
          const { data: n } = await admin.from('nexus_regions').select('mentor_id').eq('id', h.nexus_id).maybeSingle()
          if (n?.mentor_id === caller.id) led = true
        }
      }
    } else if (audience_scope === 'hub') {
      const { data: h } = await admin.from('hubs').select('guide_id, nexus_id').eq('id', audience_id).maybeSingle()
      if (h?.guide_id === caller.id) led = true
      else if (h?.nexus_id) {
        const { data: n } = await admin.from('nexus_regions').select('mentor_id').eq('id', h.nexus_id).maybeSingle()
        if (n?.mentor_id === caller.id) led = true
      }
    } else if (audience_scope === 'nexus') {
      const { data: n } = await admin.from('nexus_regions').select('mentor_id').eq('id', audience_id).maybeSingle()
      if (n?.mentor_id === caller.id) led = true
    }
    if (!led) throw new Error('You can only broadcast to a circle, hub, or region you lead.')
  }

  // audience_id is nullable for global in the DB (dispatch_global_tier migration)
  // but not yet in the generated types — cast to the untyped client (repo convention).
  const { data: dispatch, error } = await (admin as unknown as SupabaseClient)
    .from('dispatches')
    .insert({
      title,
      body,
      excerpt,
      dispatch_type,
      audience_scope,
      audience_id:  isGlobal ? null : audience_id,
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
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://frequencylocal.com'
      const dispatchUrl = `${appUrl}/broadcast/${dispatch.id}`

      let profileIds: string[] = []
      if (isGlobal) {
        const { data } = await admin.from('profiles').select('id').eq('is_active', true).eq('is_demo', false)
        profileIds = (data ?? []).map((p) => p.id)
      } else if (audience_scope === 'circle') {
        const { data } = await admin.from('memberships').select('profile_id').eq('circle_id', audience_id).eq('status', 'active')
        profileIds = (data ?? []).map((m) => m.profile_id)
      } else if (audience_scope === 'hub') {
        const { data: circles } = await admin.from('circles').select('id').eq('hub_id', audience_id)
        const cids = (circles ?? []).map((c) => c.id)
        if (cids.length > 0) {
          const { data } = await admin.from('memberships').select('profile_id').in('circle_id', cids).eq('status', 'active')
          profileIds = (data ?? []).map((m) => m.profile_id)
        }
      } else if (audience_scope === 'nexus') {
        const { data: hubs } = await admin.from('hubs').select('id').eq('nexus_id', audience_id)
        const hids = (hubs ?? []).map((h) => h.id)
        if (hids.length > 0) {
          const { data: circles } = await admin.from('circles').select('id').in('hub_id', hids)
          const cids = (circles ?? []).map((c) => c.id)
          if (cids.length > 0) {
            const { data } = await admin.from('memberships').select('profile_id').in('circle_id', cids).eq('status', 'active')
            profileIds = (data ?? []).map((m) => m.profile_id)
          }
        }
      }
      profileIds = [...new Set(profileIds)]
      if (!profileIds.length) return
      const { data: profiles } = await admin.from('profiles').select('id, display_name, auth_user_id').in('id', profileIds)
      if (!profiles?.length) return
      for (const profile of profiles) {
        if (!profile.auth_user_id) continue

        if (await shouldSend(profile.id, 'email', 'dispatches')) {
          const { data: { user } } = await admin.auth.admin.getUserById(profile.auth_user_id)
          if (user?.email) {
            await sendDispatchNotificationEmail({ to: user.email, recipientName: profile.display_name, recipientProfileId: profile.id, authorName, dispatchTitle: title, excerpt, dispatchUrl })
          }
        }

        await sendPushToProfile(profile.id, {
          title: `📡 ${title}`,
          body:  excerpt || `New dispatch from ${authorName}`,
          url:   `/broadcast/${dispatch.id}`,
          tag:   `dispatch-${dispatch.id}`,
        }, 'dispatches')
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
