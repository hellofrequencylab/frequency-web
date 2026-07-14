'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCallerProfile } from '@/lib/auth'
import { sendDispatchNotificationEmail } from '@/lib/email'
import { resolveSendGate } from '@/lib/comms/send-gate'
import { sendPushToProfile } from '@/lib/push'
import { atLeastRole } from '@/lib/core/roles'
import { resolvePlaceTreeProfileIds, type PlaceType } from '@/lib/messaging/place-tree'
import { logDispatchRecipients, type DispatchRecipientRow } from '@/lib/messaging/dispatch-log'

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
  const { data: dispatch, error } = await (admin)
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

      // Resolve WHO to reach. Global is every active member; a place scope resolves through the
      // shared place-tree walker (the same path a campaign to `circle:/hub:/nexus:<id>` uses), so the
      // Dispatch and a campaign to the same scope agree on the recipient set.
      let profileIds: string[] = []
      if (isGlobal) {
        const { data } = await admin.from('profiles').select('id').eq('is_active', true).eq('is_demo', false)
        profileIds = (data ?? []).map((p) => p.id)
      } else if (audience_scope === 'circle' || audience_scope === 'hub' || audience_scope === 'nexus') {
        profileIds = await resolvePlaceTreeProfileIds({ type: audience_scope as PlaceType, id: audience_id })
      }
      profileIds = [...new Set(profileIds)]
      if (!profileIds.length) return
      const { data: profiles } = await admin.from('profiles').select('id, display_name, auth_user_id').in('id', profileIds)
      if (!profiles?.length) return

      // Per-recipient ledger (CRM Phase 5): record the send-gate outcome for each channel so the
      // Dispatch appears in the messaging control panel. Writing it is fire-safe (never breaks a send).
      const recipientRows: DispatchRecipientRow[] = []

      for (const profile of profiles) {
        if (!profile.auth_user_id) continue

        // EMAIL — route through the unified send-gate (suppression + consent + preference), the one
        // seam every outbound send passes. It replaces the ad-hoc shouldSend check so a suppressed or
        // consent-revoked address is honored here too.
        const { data: { user } } = await admin.auth.admin.getUserById(profile.auth_user_id)
        const email = user?.email ?? null
        const gate = await resolveSendGate(profile.id, 'email', 'dispatches', { email })
        if (gate.allowed && email) {
          try {
            await sendDispatchNotificationEmail({ to: email, recipientName: profile.display_name, recipientProfileId: profile.id, authorName, dispatchTitle: title, excerpt, dispatchUrl })
            recipientRows.push({ dispatch_id: dispatch.id, profile_id: profile.id, channel: 'email', status: 'sent', reason: null, email })
          } catch (sendErr) {
            recipientRows.push({ dispatch_id: dispatch.id, profile_id: profile.id, channel: 'email', status: 'failed', reason: sendErr instanceof Error ? sendErr.message.slice(0, 200) : 'send failed', email })
          }
        } else if (email) {
          // Denied by the gate: record WHY (suppressed vs pref/consent off) without sending.
          recipientRows.push({ dispatch_id: dispatch.id, profile_id: profile.id, channel: 'email', status: gate.reason === 'suppressed' ? 'suppressed' : 'skipped', reason: gate.reason, email })
        }

        // PUSH — sendPushToProfile runs the same gate internally and returns how many were delivered.
        const pushed = await sendPushToProfile(profile.id, {
          title: `📡 ${title}`,
          body:  excerpt || `New dispatch from ${authorName}`,
          url:   `/broadcast/${dispatch.id}`,
          tag:   `dispatch-${dispatch.id}`,
        }, 'dispatches')
        recipientRows.push({ dispatch_id: dispatch.id, profile_id: profile.id, channel: 'push', status: pushed > 0 ? 'sent' : 'skipped', reason: pushed > 0 ? null : 'no delivery (gate off or no subscription)', email: null })
      }

      await logDispatchRecipients(recipientRows)
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

  // Surface a failed write so the optimistic like button rolls back (it catches
  // a throw) instead of showing a like/unlike that never landed.
  if (existing) {
    const { error } = await admin.from('dispatch_likes').delete().eq('id', existing.id)
    if (error) throw new Error('Could not update your like')
  } else {
    const { error } = await admin.from('dispatch_likes').insert({ dispatch_id: dispatchId, profile_id: profileId })
    if (error) throw new Error('Could not update your like')
  }

  revalidatePath(`/broadcast/${dispatchId}`)
}

// Returns the created comment (with its author) so the client can render it
// immediately — the comment list seeds from a server snapshot that never
// refreshed after a post, so without this the new comment stayed invisible and
// re-submits duped it.
export type DispatchComment = {
  id: string
  body: string
  created_at: string
  author: { id: string; display_name: string; handle: string; avatar_url: string | null }
}

export async function addDispatchComment(dispatchId: string, body: string): Promise<DispatchComment> {
  const profileId = await getCallerProfileId()
  if (!profileId) throw new Error('Unauthorized')

  const trimmed = body.trim()
  if (!trimmed || trimmed.length > 2000) throw new Error('Invalid comment')

  const admin = createAdminClient()
  const { data, error } = await admin.from('dispatch_comments').insert({
    dispatch_id: dispatchId,
    author_id:   profileId,
    body:        trimmed,
  })
    .select(`id, body, created_at, author:profiles!author_id ( id, display_name, handle, avatar_url )`)
    .single()
  if (error || !data) throw new Error(error?.message ?? 'Could not post your comment')

  revalidatePath(`/broadcast/${dispatchId}`)
  return data as unknown as DispatchComment
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

  // Surface a failed write so the optimistic poll UI rolls back (it catches a
  // throw) instead of showing a vote that never landed.
  if (existingVote) {
    if (existingVote.option_id === optionId) {
      // Toggle off (unvote)
      const { error } = await admin.from('dispatch_poll_votes').delete().eq('id', existingVote.id)
      if (error) throw new Error('Could not record your vote')
    } else {
      // Switch vote to new option
      const { error: delError } = await admin.from('dispatch_poll_votes').delete().eq('id', existingVote.id)
      if (delError) throw new Error('Could not record your vote')
      const { error: insError } = await admin.from('dispatch_poll_votes').insert({ option_id: optionId, profile_id: profileId })
      if (insError) throw new Error('Could not record your vote')
    }
  } else {
    const { error } = await admin.from('dispatch_poll_votes').insert({ option_id: optionId, profile_id: profileId })
    if (error) throw new Error('Could not record your vote')
  }

  revalidatePath(`/broadcast/${dispatchId}`)
}
