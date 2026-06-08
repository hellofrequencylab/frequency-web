'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCallerProfile } from '@/lib/auth'
import { atLeastRole } from '@/lib/core/roles'
import { getEventCapabilities } from '@/lib/core/load-capabilities'
import { authorizeAction } from '@/lib/admin/guard'
import { slugify } from '@/lib/utils'

// Shared guard: community host+ (the floor for event management in /admin).
async function requireEventHost() {
  return authorizeAction(await getCallerProfile(), 'host', 'community')
}

// Scope-aware guard: the caller must hold event.editSettings on THIS event
// (they host it, manage its circle, or are community admin+/staff). Mirrors the
// pattern used by toggleCancelEvent / updateEventDetails in admin/actions.ts.
async function requireEventEditor(eventId: string) {
  const [caller, caps] = await Promise.all([getCallerProfile(), getEventCapabilities(eventId)])
  if (!caller) throw new Error('Unauthorized')
  if (caps.has('event.editSettings')) return caller
  if (atLeastRole(caller.community_role, 'admin')) return caller
  throw new Error('Unauthorized')
}

// ── Create ─────────────────────────────────────────────────────────────────────
// Admin-side create: identical to the member-facing action but explicitly gated
// with community host+ (no gamification awards — admin ops shouldn't game zaps).

export async function createEvent(fd: FormData) {
  const caller = await requireEventHost()
  const admin = createAdminClient()

  const title       = (fd.get('title') as string).trim()
  const description = (fd.get('description') as string)?.trim() || null
  const location    = (fd.get('location') as string)?.trim() || null
  const scopeId     = (fd.get('scope_id') as string).trim()
  const startsAt    = fd.get('starts_at') as string
  const endsAt      = (fd.get('ends_at') as string) || null

  if (!title || !scopeId || !startsAt) throw new Error('title, scope_id, and starts_at are required')

  const base = slugify(title) + '-' + startsAt.slice(0, 10)
  let slug   = base
  const { data: existing } = await admin.from('events').select('slug').eq('slug', slug).maybeSingle()
  if (existing) slug = base + '-' + Math.random().toString(36).slice(2, 6)

  const { error } = await admin.from('events').insert({
    title,
    description,
    location,
    scope_id:   scopeId,
    scope_type: 'circle',
    starts_at:  new Date(startsAt).toISOString(),
    ends_at:    endsAt ? new Date(endsAt).toISOString() : null,
    host_id:    caller.id,
    slug,
  })
  if (error) throw new Error(error.message)

  revalidatePath('/admin/events')
  revalidatePath('/events')
  revalidatePath('/feed')
}

// ── Update ────────────────────────────────────────────────────────────────────

export async function updateEvent(id: string, fd: FormData) {
  await requireEventEditor(id)
  const admin   = createAdminClient()
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

// ── Cancel / reinstate ────────────────────────────────────────────────────────

export async function cancelEvent(id: string) {
  await requireEventEditor(id)
  const admin = createAdminClient()
  const { error } = await admin.from('events').update({ is_cancelled: true }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/events')
  revalidatePath('/events')
  revalidatePath('/feed')
}

export async function reinstateEvent(id: string) {
  await requireEventEditor(id)
  const admin = createAdminClient()
  const { error } = await admin.from('events').update({ is_cancelled: false }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/events')
  revalidatePath('/events')
  revalidatePath('/feed')
}
