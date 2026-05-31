'use server'

import { randomBytes } from 'crypto'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { getCallerProfile, type CommunityRole } from '@/lib/auth'
import type { Database } from '@/lib/database.types'
import { sendDispatchNotificationEmail } from '@/lib/email'
import { shouldSend } from '@/lib/notification-preferences'
import { sendPushToProfile } from '@/lib/push'
import { slugify } from '@/lib/utils'
import { recordEngagementEvent } from '@/lib/engagement/events'
import { awardZapsForAction } from '@/lib/zaps'
import { processGamificationEvent } from '@/lib/achievements'
import { atLeastRole } from '@/lib/core/roles'

// Role-ladder comparison — single source in lib/core/roles.
const hasRole = atLeastRole

// ── Member management ─────────────────────────────────────────────────────────

export async function assignRole(profileId: string, role: CommunityRole) {
  const caller = await getCallerProfile()
  if (!caller || !hasRole(caller.community_role, 'host')) throw new Error('Unauthorized')
  const admin = createAdminClient()
  const { error } = await admin.from('profiles').update({ community_role: role }).eq('id', profileId)
  if (error) throw new Error(error.message)
  processGamificationEvent({ type: 'role_change', profileId, role }).catch(() => {})
  revalidatePath('/admin')
}

export async function deactivateMember(profileId: string) {
  const caller = await getCallerProfile()
  if (!caller || !hasRole(caller.community_role, 'host')) throw new Error('Unauthorized')
  const admin = createAdminClient()
  const { error } = await admin.from('profiles').update({ is_active: false }).eq('id', profileId)
  if (error) throw new Error(error.message)
  revalidatePath('/admin')
}

export async function updateMemberProfile(profileId: string, fd: FormData) {
  const caller = await getCallerProfile()
  if (!caller || !hasRole(caller.community_role, 'janitor')) throw new Error('Unauthorized')
  const admin = createAdminClient()

  const updates: Database['public']['Tables']['profiles']['Update'] = {}
  const name = (fd.get('display_name') as string)?.trim()
  const handle = (fd.get('handle') as string)?.trim()
  const bio = (fd.get('bio') as string)?.trim()
  if (name) updates.display_name = name
  if (handle) updates.handle = handle
  if (bio !== undefined) updates.bio = bio || null

  const { error } = await admin.from('profiles').update(updates).eq('id', profileId)
  if (error) throw new Error(error.message)
  revalidatePath('/admin')
  revalidatePath('/admin/members')
  revalidatePath('/people', 'layout')
}

export async function reactivateMember(profileId: string) {
  const caller = await getCallerProfile()
  if (!caller || !hasRole(caller.community_role, 'janitor')) throw new Error('Unauthorized')
  const admin = createAdminClient()
  const { error } = await admin.from('profiles').update({ is_active: true }).eq('id', profileId)
  if (error) throw new Error(error.message)
  revalidatePath('/admin')
  revalidatePath('/admin/members')
}

export async function sendMagicLink(profileId: string) {
  const caller = await getCallerProfile()
  if (!caller || !hasRole(caller.community_role, 'janitor')) throw new Error('Unauthorized')

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('auth_user_id')
    .eq('id', profileId)
    .maybeSingle()
  if (!profile?.auth_user_id) throw new Error('Profile not found')

  const { data: { user } } = await admin.auth.admin.getUserById(profile.auth_user_id)
  if (!user?.email) throw new Error('No email found for this user')

  const { error } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: user.email,
    options: {
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://go.findafreq.com'}/auth/callback`,
    },
  })
  if (error) throw new Error(error.message)
  return { email: user.email }
}

export async function deleteUserAccount(profileId: string) {
  const caller = await getCallerProfile()
  if (!caller || !hasRole(caller.community_role, 'janitor')) throw new Error('Unauthorized')

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('auth_user_id, is_system')
    .eq('id', profileId)
    .maybeSingle()
  if (!profile) throw new Error('Profile not found')
  if (profile.is_system) throw new Error('The system account cannot be deleted.')

  await admin.from('profiles').update({ is_active: false }).eq('id', profileId)

  if (profile.auth_user_id) {
    const { error } = await admin.auth.admin.deleteUser(profile.auth_user_id)
    if (error) throw new Error(error.message)
  } else {
    // No linked auth user (e.g. an imported profile): delete the row directly.
    // FKs to profiles now cascade or set null, so this succeeds.
    const { error } = await admin.from('profiles').delete().eq('id', profileId)
    if (error) throw new Error(error.message)
  }

  revalidatePath('/admin')
  revalidatePath('/admin/members')
}

// ── Circles ───────────────────────────────────────────────────────────────────

export async function createCircle(fd: FormData) {
  const caller = await getCallerProfile()
  if (!caller) throw new Error('You need to be signed in.')

  const topical_channel_id = (fd.get('topical_channel_id') as string) || null

  // Admin-managed circles still need host+. Bottom-up circles created from
  // a topical channel (the "I want to start a local crew practicing X" path)
  // are open to any signed-in member.
  if (!topical_channel_id && !hasRole(caller.community_role, 'host')) {
    throw new Error('Unauthorized')
  }

  const name    = (fd.get('name') as string).trim()
  const about   = (fd.get('about') as string)?.trim() || null
  const type    = ((fd.get('type') as string) || 'in-person') as Database['public']['Enums']['circle_type']
  const cap     = parseInt(fd.get('member_cap') as string) || 12
  const hub_id  = (fd.get('hub_id') as string) || null
  const status  = ((fd.get('status') as string) || 'forming') as Database['public']['Enums']['group_status']
  const host_id = (fd.get('host_id') as string) || caller.id
  let slug      = slugify(name)

  const admin = createAdminClient()
  // Ensure unique slug
  const { data: existing } = await admin.from('circles').select('id').eq('slug', slug).maybeSingle()
  if (existing) slug = slug + '-' + Math.random().toString(36).slice(2, 5)

  const { data: circle, error } = await admin.from('circles').insert({
    name, about, type, member_cap: cap, hub_id, status, slug,
    host_id, member_count: 0,
    ...(topical_channel_id ? { topical_channel_id } : {}),
  }).select('id').single()
  if (error) throw new Error(error.message)

  // The host is a member of their own circle (so they can post, log practice,
  // and use it fully). member_count is trigger-maintained on membership insert.
  await admin.from('memberships').insert({
    profile_id: host_id,
    circle_id: circle.id,
    status: 'active',
  })

  // Lifecycle reward: starting a circle (once per circle). Routes through the
  // engagement ledger (idempotent); credits live today, will land in the Vault
  // for free users once the entitlement layer ships (ADR-037).
  try {
    const { recorded } = await recordEngagementEvent({
      idempotencyKey: `circle_start:${circle.id}`,
      source: 'web',
      eventType: 'circle.started',
      actorProfileId: host_id,
      context: { circleId: circle.id },
    })
    if (recorded) await awardZapsForAction(host_id, 'circle_start')
  } catch {
    // a reward failure must never block circle creation
  }

  // Announce the new circle to the wider audience (hub members, or the topical
  // channel's followers if the circle has no hub). Cluster visibility resolves
  // that audience at read time; scope_id stays the circle so it also shows on
  // the circle page and in the host's own feed.
  await admin.from('posts').insert({
    author_id:  host_id,
    body:       about ? `Started a new circle: ${name}.\n\n${about}` : `Started a new circle: ${name}.`,
    scope_id:   circle.id,
    visibility: 'cluster',
    post_type:  'announcement',
    is_pinned:  true,
  })

  revalidatePath('/admin/circles')
  revalidatePath('/circles')
  revalidatePath('/channels')
  revalidatePath('/feed')
}

export async function updateCircle(id: string, fd: FormData) {
  const caller = await getCallerProfile()
  if (!caller || !hasRole(caller.community_role, 'host')) throw new Error('Unauthorized')
  const admin = createAdminClient()
  const { error } = await admin.from('circles').update({
    name:       (fd.get('name') as string).trim(),
    about:      (fd.get('about') as string)?.trim() || null,
    type:       fd.get('type') as Database['public']['Enums']['circle_type'],
    member_cap: parseInt(fd.get('member_cap') as string) || 12,
    hub_id:     (fd.get('hub_id') as string) || null,
    status:     fd.get('status') as Database['public']['Enums']['group_status'],
    host_id:    (fd.get('host_id') as string) || caller.id,
  }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/circles')
  revalidatePath('/circles')
}

export async function archiveCircle(id: string) {
  const caller = await getCallerProfile()
  if (!caller || !hasRole(caller.community_role, 'host')) throw new Error('Unauthorized')
  const admin = createAdminClient()
  const { error } = await admin.from('circles').update({ status: 'archived' }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/circles')
  revalidatePath('/circles')
}

// ── Invite links ─────────────────────────────────────────────────────────────

export async function createInviteLink(circleId: string): Promise<{ token: string }> {
  const caller = await getCallerProfile()
  if (!caller || !hasRole(caller.community_role, 'host')) throw new Error('Unauthorized')

  const token = randomBytes(12).toString('base64url')
  const admin = createAdminClient()

  // Deactivate any previous active link for this circle
  await admin
    .from('invite_links')
    .update({ is_active: false })
    .eq('circle_id', circleId)
    .eq('is_active', true)

  const { error } = await admin.from('invite_links').insert({
    token,
    circle_id:  circleId,
    created_by: caller.id,
  })
  if (error) throw new Error(error.message)

  revalidatePath('/admin/circles')
  return { token }
}

export async function revokeInviteLink(id: string) {
  const caller = await getCallerProfile()
  if (!caller || !hasRole(caller.community_role, 'host')) throw new Error('Unauthorized')

  const admin = createAdminClient()
  const { error } = await admin
    .from('invite_links')
    .update({ is_active: false })
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/circles')
}

// Public action. No role check, but validates token
export async function joinViaInviteLink(token: string): Promise<{ circleId: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const admin = createAdminClient()

  // Fetch and validate link
  const { data: link } = await admin
    .from('invite_links')
    .select('id, circle_id, created_by, max_uses, used_count, expires_at, is_active')
    .eq('token', token)
    .maybeSingle()

  if (!link || !link.is_active) throw new Error('Invite link is invalid or no longer active')
  if (link.expires_at && new Date(link.expires_at) < new Date()) throw new Error('Invite link has expired')
  if (link.max_uses > 0 && link.used_count >= link.max_uses) throw new Error('Invite link has reached its maximum uses')

  // Get caller profile
  const { data: profile } = await admin
    .from('profiles')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (!profile) throw new Error('Profile not found')

  // Check not already a member
  const { data: existing } = await admin
    .from('memberships')
    .select('id')
    .eq('circle_id', link.circle_id)
    .eq('profile_id', profile.id)
    .maybeSingle()

  if (!existing) {
    const { error: joinError } = await admin.from('memberships').insert({
      circle_id:  link.circle_id,
      profile_id: profile.id,
      status:     'active',
    })
    if (joinError) throw new Error(joinError.message)

    // Increment used_count and update circle member_count
    await admin
      .from('invite_links')
      .update({ used_count: link.used_count + 1 })
      .eq('id', link.id)

    // Best-effort member count increment. Manual update since we may not have the RPC
    const { data: circleData } = await admin
      .from('circles')
      .select('member_count')
      .eq('id', link.circle_id)
      .maybeSingle()
    if (circleData) {
      await admin
        .from('circles')
        .update({ member_count: (circleData.member_count ?? 0) + 1 })
        .eq('id', link.circle_id)
    }

    // Lifecycle reward: the inviter, when someone they invited actually joins
    // (once per inviter+invitee). Real-world outreach -> zaps. Routes through
    // the ledger; will land in the Vault for free inviters once ADR-037 ships.
    if (link.created_by && link.created_by !== profile.id) {
      try {
        const { recorded } = await recordEngagementEvent({
          idempotencyKey: `invite_accepted:${link.created_by}:${profile.id}`,
          source: 'web',
          eventType: 'invite.accepted',
          actorProfileId: link.created_by,
          context: { circleId: link.circle_id, invitee: profile.id },
        })
        if (recorded) await awardZapsForAction(link.created_by, 'invite_accepted')
      } catch {
        // a reward failure must never block the join
      }
    }
  }

  revalidatePath('/circles')
  revalidatePath('/feed')
  return { circleId: link.circle_id }
}

// ── Channels ──────────────────────────────────────────────────────────────────

export async function archiveChannel(id: string) {
  const caller = await getCallerProfile()
  if (!caller || !hasRole(caller.community_role, 'host')) throw new Error('Unauthorized')
  const admin = createAdminClient()
  const { error } = await admin.from('channels').update({ is_public: false }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/channels')
  revalidatePath('/channels')
}

// ── Hubs ──────────────────────────────────────────────────────────────────────

export async function createHub(fd: FormData) {
  const caller = await getCallerProfile()
  if (!caller || !hasRole(caller.community_role, 'guide')) throw new Error('Unauthorized')

  const name     = (fd.get('name') as string).trim()
  const nexus_id = (fd.get('nexus_id') as string) || null
  const status   = ((fd.get('status') as string) || 'forming') as Database['public']['Enums']['group_status']
  const guide_id = (fd.get('guide_id') as string) || caller.id
  let slug       = slugify(name)

  const admin = createAdminClient()
  const { data: existing } = await admin.from('hubs').select('id').eq('slug', slug).maybeSingle()
  if (existing) slug = slug + '-' + Math.random().toString(36).slice(2, 5)

  const { error } = await admin.from('hubs').insert({ name, slug, nexus_id, status, guide_id })
  if (error) throw new Error(error.message)
  revalidatePath('/admin/hubs')
}

export async function updateHub(id: string, fd: FormData) {
  const caller = await getCallerProfile()
  if (!caller || !hasRole(caller.community_role, 'guide')) throw new Error('Unauthorized')
  const admin = createAdminClient()
  const { error } = await admin.from('hubs').update({
    name:     (fd.get('name') as string).trim(),
    nexus_id: (fd.get('nexus_id') as string) || null,
    status:   fd.get('status') as Database['public']['Enums']['group_status'],
    guide_id: (fd.get('guide_id') as string) || caller.id,
  }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/hubs')
}

// ── Nexuses ───────────────────────────────────────────────────────────────────

export async function createNexus(fd: FormData) {
  const caller = await getCallerProfile()
  if (!caller || !hasRole(caller.community_role, 'mentor')) throw new Error('Unauthorized')

  const name       = (fd.get('name') as string).trim()
  const cap        = parseInt(fd.get('member_cap') as string) || 100
  const status     = ((fd.get('status') as string) || 'forming') as Database['public']['Enums']['group_status']
  const mentor_id  = (fd.get('mentor_id') as string) || caller.id
  const outpost_id = (fd.get('outpost_id') as string) || null
  if (!outpost_id) throw new Error('An outpost is required.')
  let slug         = slugify(name)

  const admin = createAdminClient()
  const { data: existing } = await admin.from('nexuses').select('id').eq('slug', slug).maybeSingle()
  if (existing) slug = slug + '-' + Math.random().toString(36).slice(2, 5)

  const { error } = await admin.from('nexuses').insert({ name, slug, member_cap: cap, status, mentor_id, outpost_id })
  if (error) throw new Error(error.message)
  revalidatePath('/admin/nexuses')
}

export async function updateNexus(id: string, fd: FormData) {
  const caller = await getCallerProfile()
  if (!caller || !hasRole(caller.community_role, 'mentor')) throw new Error('Unauthorized')
  const admin = createAdminClient()
  const { error } = await admin.from('nexuses').update({
    name:       (fd.get('name') as string).trim(),
    member_cap: parseInt(fd.get('member_cap') as string) || 100,
    status:     fd.get('status') as Database['public']['Enums']['group_status'],
    mentor_id:  (fd.get('mentor_id') as string) || caller.id,
  }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/nexuses')
}

// ── Crew tasks ────────────────────────────────────────────────────────────────

export async function createCrewTask(fd: FormData) {
  const caller = await getCallerProfile()
  if (!caller || !hasRole(caller.community_role, 'host')) throw new Error('Unauthorized')
  const admin = createAdminClient()
  const { error } = await admin.from('crew_tasks').insert({
    name:                  (fd.get('name') as string).trim(),
    task_type:             fd.get('task_type') as string,
    zaps_value:            parseInt(fd.get('zaps_value') as string) || 10,
    is_repeatable:         fd.get('is_repeatable') === 'true',
    requires_verification: fd.get('requires_verification') === 'true',
  })
  if (error) throw new Error(error.message)
  revalidatePath('/admin/crew-tasks')
  revalidatePath('/crew')
}

export async function updateCrewTask(id: string, fd: FormData) {
  const caller = await getCallerProfile()
  if (!caller || !hasRole(caller.community_role, 'host')) throw new Error('Unauthorized')
  const admin = createAdminClient()
  const { error } = await admin.from('crew_tasks').update({
    name:                  (fd.get('name') as string).trim(),
    task_type:             fd.get('task_type') as string,
    zaps_value:            parseInt(fd.get('zaps_value') as string) || 10,
    is_repeatable:         fd.get('is_repeatable') === 'true',
    requires_verification: fd.get('requires_verification') === 'true',
  }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/crew-tasks')
  revalidatePath('/crew')
}

export async function deleteCrewTask(id: string) {
  const caller = await getCallerProfile()
  if (!caller || !hasRole(caller.community_role, 'host')) throw new Error('Unauthorized')
  const admin = createAdminClient()
  const { error } = await admin.from('crew_tasks').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/crew-tasks')
  revalidatePath('/crew')
}

// ── Dispatches ───────────────────────────────────────────────────────────────

type DispatchScope = 'circle' | 'hub' | 'nexus'

function makeExcerpt(body: string, maxLen = 200): string {
  // Strip markdown syntax for the plain-text excerpt
  const plain = body
    .replace(/#{1,6}\s+/g, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/\[(.+?)\]\(.+?\)/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/\n+/g, ' ')
    .trim()
  return plain.length <= maxLen ? plain : plain.slice(0, maxLen).trimEnd() + '…'
}

export async function createDispatch(fd: FormData): Promise<{ id: string }> {
  const caller = await getCallerProfile()
  if (!caller || !hasRole(caller.community_role, 'host')) throw new Error('Unauthorized')

  const title          = (fd.get('title') as string).trim()
  const body           = (fd.get('body') as string).trim()
  const dispatch_type  = (fd.get('dispatch_type') as string) || 'post'
  const audience_scope = fd.get('audience_scope') as DispatchScope
  const audience_id    = (fd.get('audience_id') as string).trim()
  const linked_task_id = (fd.get('linked_task_id') as string) || null
  const scheduled_raw  = fd.get('scheduled_for') as string | null
  const scheduled_for  = scheduled_raw ? new Date(scheduled_raw).toISOString() : null
  const pollOptionsRaw = fd.get('poll_options') as string | null
  const excerpt        = makeExcerpt(body)

  if (!title || !body || !audience_scope || !audience_id) throw new Error('Missing required fields')

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('dispatches')
    .insert({ title, body, excerpt, dispatch_type, audience_scope, audience_id, linked_task_id, scheduled_for, author_id: caller.id })
    .select('id')
    .single()
  if (error) throw new Error(error.message)

  // Save poll options when type is 'poll'
  if (dispatch_type === 'poll' && pollOptionsRaw) {
    const options: string[] = JSON.parse(pollOptionsRaw)
    const validOptions = options.map(s => s.trim()).filter(Boolean)
    if (validOptions.length >= 2) {
      await admin.from('dispatch_poll_options').insert(
        validOptions.map((label, position) => ({ dispatch_id: data.id, label, position }))
      )
    }
  }

  revalidatePath('/admin/dispatches')
  revalidatePath('/broadcast')
  return { id: data.id }
}

export async function updateDispatch(id: string, fd: FormData) {
  const caller = await getCallerProfile()
  if (!caller || !hasRole(caller.community_role, 'host')) throw new Error('Unauthorized')

  const body           = (fd.get('body') as string).trim()
  const excerpt        = makeExcerpt(body)
  const dispatch_type  = (fd.get('dispatch_type') as string) || 'post'
  const linked_task_id = (fd.get('linked_task_id') as string) || null
  const scheduled_raw  = fd.get('scheduled_for') as string | null
  const scheduled_for  = scheduled_raw ? new Date(scheduled_raw).toISOString() : null
  const pollOptionsRaw = fd.get('poll_options') as string | null

  const admin = createAdminClient()
  const { error } = await admin.from('dispatches').update({
    title:          (fd.get('title') as string).trim(),
    body,
    excerpt,
    dispatch_type,
    audience_scope: fd.get('audience_scope') as DispatchScope,
    audience_id:    (fd.get('audience_id') as string).trim(),
    linked_task_id,
    scheduled_for,
    updated_at:     new Date().toISOString(),
  }).eq('id', id)
  if (error) throw new Error(error.message)

  // Replace poll options on update
  if (dispatch_type === 'poll' && pollOptionsRaw) {
    const options: string[] = JSON.parse(pollOptionsRaw)
    const validOptions = options.map(s => s.trim()).filter(Boolean)
    if (validOptions.length >= 2) {
      await admin.from('dispatch_poll_options').delete().eq('dispatch_id', id)
      await admin.from('dispatch_poll_options').insert(
        validOptions.map((label, position) => ({ dispatch_id: id, label, position }))
      )
    }
  }

  revalidatePath('/admin/dispatches')
  revalidatePath('/broadcast')
  revalidatePath(`/broadcast/${id}`)
}

export async function publishDispatch(id: string) {
  const caller = await getCallerProfile()
  if (!caller || !hasRole(caller.community_role, 'host')) throw new Error('Unauthorized')

  const admin = createAdminClient()
  const { error } = await admin.from('dispatches').update({
    status:       'published',
    published_at: new Date().toISOString(),
    updated_at:   new Date().toISOString(),
  }).eq('id', id)
  if (error) throw new Error(error.message)

  revalidatePath('/admin/dispatches')
  revalidatePath('/broadcast')
  revalidatePath(`/broadcast/${id}`)
  revalidatePath('/feed')

  // Fire-and-forget email fan-out. Never block publish on email failure
  ;(async () => {
    try {
      const { data: dispatch } = await admin
        .from('dispatches')
        .select('id, title, excerpt, audience_scope, audience_id, author:profiles!author_id(display_name)')
        .eq('id', id)
        .maybeSingle()
      if (!dispatch) return

      const authorName  = (dispatch.author as any)?.display_name ?? 'A host'
      const excerpt     = dispatch.excerpt ?? ''
      const appUrl      = process.env.NEXT_PUBLIC_APP_URL ?? 'https://hellofrequency.com'
      const dispatchUrl = `${appUrl}/broadcast/${id}`

      let profileIds: string[] = []
      if (dispatch.audience_scope === 'circle') {
        const { data } = await admin.from('memberships').select('profile_id').eq('circle_id', dispatch.audience_id).eq('status', 'active')
        profileIds = (data ?? []).map((m: any) => m.profile_id)
      } else if (dispatch.audience_scope === 'hub') {
        const { data: circles } = await admin.from('circles').select('id').eq('hub_id', dispatch.audience_id)
        const cids = (circles ?? []).map((c: any) => c.id)
        if (cids.length > 0) {
          const { data } = await admin.from('memberships').select('profile_id').in('circle_id', cids).eq('status', 'active')
          profileIds = (data ?? []).map((m: any) => m.profile_id)
        }
      } else if (dispatch.audience_scope === 'nexus') {
        const { data: hubs } = await admin.from('hubs').select('id').eq('nexus_id', dispatch.audience_id)
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

      const { data: profiles } = await admin.from('profiles').select('id, display_name, auth_user_id').in('id', profileIds)
      if (!profiles?.length) return

      for (const profile of profiles) {
        if (!profile.auth_user_id) continue

        if (await shouldSend(profile.id, 'email', 'dispatches')) {
          const { data: { user } } = await admin.auth.admin.getUserById(profile.auth_user_id)
          if (user?.email) {
            await sendDispatchNotificationEmail({
              to:                 user.email,
              recipientName:      profile.display_name,
              recipientProfileId: profile.id,
              authorName,
              dispatchTitle:      dispatch.title,
              excerpt,
              dispatchUrl,
            })
          }
        }

        if (await shouldSend(profile.id, 'push', 'dispatches')) {
          await sendPushToProfile(profile.id, {
            title: `📡 ${dispatch.title}`,
            body:  excerpt || `New dispatch from ${authorName}`,
            url:   `/broadcast/${dispatch.id}`,
            tag:   `dispatch-${dispatch.id}`,
          })
        }
      }
    } catch (err) {
      console.error('[publishDispatch] email fan-out failed:', err)
    }
  })()
}

export async function unpublishDispatch(id: string) {
  const caller = await getCallerProfile()
  if (!caller || !hasRole(caller.community_role, 'host')) throw new Error('Unauthorized')

  const admin = createAdminClient()
  const { error } = await admin
    .from('dispatches')
    .update({ status: 'draft', updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(error.message)

  revalidatePath('/admin/dispatches')
  revalidatePath('/broadcast')
  revalidatePath(`/broadcast/${id}`)
  revalidatePath('/feed')
}

export async function deleteDispatch(id: string) {
  const caller = await getCallerProfile()
  if (!caller || !hasRole(caller.community_role, 'host')) throw new Error('Unauthorized')

  const admin = createAdminClient()
  const { error } = await admin.from('dispatches').delete().eq('id', id)
  if (error) throw new Error(error.message)

  revalidatePath('/admin/dispatches')
  revalidatePath('/broadcast')
  revalidatePath('/feed')
}

// ── Events ────────────────────────────────────────────────────────────────────

export async function toggleCancelEvent(id: string, cancel: boolean) {
  const caller = await getCallerProfile()
  if (!caller || !hasRole(caller.community_role, 'host')) throw new Error('Unauthorized')
  const admin = createAdminClient()
  const { error } = await admin.from('events').update({ is_cancelled: cancel }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/events')
  revalidatePath('/events')
  revalidatePath('/feed')
}

export async function updateEventDetails(id: string, fd: FormData) {
  const caller = await getCallerProfile()
  if (!caller || !hasRole(caller.community_role, 'host')) throw new Error('Unauthorized')
  const admin = createAdminClient()
  const startsAt = fd.get('starts_at') as string
  const endsAt   = fd.get('ends_at') as string
  const { error } = await admin.from('events').update({
    title:       (fd.get('title') as string).trim(),
    description: (fd.get('description') as string)?.trim() || null,
    location:    (fd.get('location') as string)?.trim() || null,
    starts_at:   startsAt ? new Date(startsAt).toISOString() : undefined,
    ends_at:     endsAt   ? new Date(endsAt).toISOString()   : null,
  }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/events')
  revalidatePath('/events')
  revalidatePath('/feed')
}

// ── Season rank controls ──────────────────────────────────────────────────────

export async function toggleSeasonComplete(profileId: string, complete: boolean) {
  const caller = await getCallerProfile()
  if (!caller || !hasRole(caller.community_role, 'guide')) throw new Error('Unauthorized')
  const admin = createAdminClient()
  const { error } = await admin
    .from('profiles')
    .update({ season_challenges_complete: complete })
    .eq('id', profileId)
  if (error) throw new Error(error.message)
  revalidatePath('/admin')
}

export async function assignLuminary(profileId: string) {
  const caller = await getCallerProfile()
  if (!caller || !hasRole(caller.community_role, 'guide')) throw new Error('Unauthorized')
  const admin = createAdminClient()
  const { error } = await admin
    .from('profiles')
    .update({ current_season_rank: 'luminary', season_challenges_complete: true })
    .eq('id', profileId)
  if (error) throw new Error(error.message)
  processGamificationEvent({ type: 'rank_change', profileId, rank: 'luminary' }).catch(() => {})
  revalidatePath('/admin')
}

// ── Crew task verification ────────────────────────────────────────────────────

export async function approveVerification(completionId: string) {
  const caller = await getCallerProfile()
  if (!caller || !hasRole(caller.community_role, 'host')) throw new Error('Unauthorized')
  const admin = createAdminClient()
  const { error } = await admin
    .from('crew_completions')
    .update({ verified_by: caller.id })
    .eq('id', completionId)
    .is('verified_by', null)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/crew-tasks')
}

export async function rejectVerification(completionId: string) {
  const caller = await getCallerProfile()
  if (!caller || !hasRole(caller.community_role, 'host')) throw new Error('Unauthorized')
  const admin = createAdminClient()
  const { error } = await admin
    .from('crew_completions')
    .delete()
    .eq('id', completionId)
    .is('verified_by', null)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/crew-tasks')
}
