'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

type CommunityRole = 'member' | 'crew' | 'host' | 'guide' | 'mentor'

const HIERARCHY: CommunityRole[] = ['member', 'crew', 'host', 'guide', 'mentor']

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

function hasRole(callerRole: CommunityRole, minRole: CommunityRole): boolean {
  return HIERARCHY.indexOf(callerRole) >= HIERARCHY.indexOf(minRole)
}

function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

// ── Member management ─────────────────────────────────────────────────────────

export async function assignRole(profileId: string, role: CommunityRole) {
  const caller = await getCallerProfile()
  if (!caller || !hasRole(caller.community_role, 'host')) throw new Error('Unauthorized')
  const admin = createAdminClient()
  const { error } = await admin.from('profiles').update({ community_role: role }).eq('id', profileId)
  if (error) throw new Error(error.message)
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

// ── Circles ───────────────────────────────────────────────────────────────────

export async function createCircle(fd: FormData) {
  const caller = await getCallerProfile()
  if (!caller || !hasRole(caller.community_role, 'host')) throw new Error('Unauthorized')

  const name    = (fd.get('name') as string).trim()
  const about   = (fd.get('about') as string)?.trim() || null
  const type    = (fd.get('type') as string) || 'in-person'
  const cap     = parseInt(fd.get('member_cap') as string) || 12
  const hub_id  = (fd.get('hub_id') as string) || null
  const status  = (fd.get('status') as string) || 'forming'
  const host_id = (fd.get('host_id') as string) || caller.id
  let slug      = slugify(name)

  const admin = createAdminClient()
  // Ensure unique slug
  const { data: existing } = await admin.from('circles').select('id').eq('slug', slug).maybeSingle()
  if (existing) slug = slug + '-' + Math.random().toString(36).slice(2, 5)

  const { error } = await admin.from('circles').insert({
    name, about, type, member_cap: cap, hub_id, status, slug,
    host_id, member_count: 0,
  })
  if (error) throw new Error(error.message)
  revalidatePath('/admin/circles')
  revalidatePath('/circles')
}

export async function updateCircle(id: string, fd: FormData) {
  const caller = await getCallerProfile()
  if (!caller || !hasRole(caller.community_role, 'host')) throw new Error('Unauthorized')
  const admin = createAdminClient()
  const { error } = await admin.from('circles').update({
    name:       (fd.get('name') as string).trim(),
    about:      (fd.get('about') as string)?.trim() || null,
    type:       fd.get('type') as string,
    member_cap: parseInt(fd.get('member_cap') as string) || 12,
    hub_id:     (fd.get('hub_id') as string) || null,
    status:     fd.get('status') as string,
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
  const status   = (fd.get('status') as string) || 'forming'
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
    status:   fd.get('status') as string,
    guide_id: (fd.get('guide_id') as string) || caller.id,
  }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/hubs')
}

// ── Nexuses ───────────────────────────────────────────────────────────────────

export async function createNexus(fd: FormData) {
  const caller = await getCallerProfile()
  if (!caller || !hasRole(caller.community_role, 'mentor')) throw new Error('Unauthorized')

  const name      = (fd.get('name') as string).trim()
  const cap       = parseInt(fd.get('member_cap') as string) || 100
  const status    = (fd.get('status') as string) || 'forming'
  const mentor_id = (fd.get('mentor_id') as string) || caller.id
  let slug        = slugify(name)

  const admin = createAdminClient()
  const { data: existing } = await admin.from('nexuses').select('id').eq('slug', slug).maybeSingle()
  if (existing) slug = slug + '-' + Math.random().toString(36).slice(2, 5)

  const { error } = await admin.from('nexuses').insert({ name, slug, member_cap: cap, status, mentor_id })
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
    status:     fd.get('status') as string,
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
    points_value:          parseInt(fd.get('points_value') as string) || 10,
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
    points_value:          parseInt(fd.get('points_value') as string) || 10,
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
