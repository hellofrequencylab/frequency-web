'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { slugify } from '@/lib/utils'

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

export async function createEvent(formData: FormData) {
  const title = (formData.get('title') as string | null)?.trim()
  const description = (formData.get('description') as string | null)?.trim() || null
  const location = (formData.get('location') as string | null)?.trim() || null
  const scopeId = formData.get('scopeId') as string | null
  const startsAt = formData.get('startsAt') as string | null
  const endsAt = (formData.get('endsAt') as string | null) || null

  if (!title || !scopeId || !startsAt) return

  const myProfileId = await getMyProfileId()
  if (!myProfileId) return

  const admin = createAdminClient()

  // Unique slug generation
  const base = slugify(title) + '-' + startsAt.slice(0, 10)
  let slug = base
  const { data: existing } = await admin
    .from('events')
    .select('slug')
    .eq('slug', slug)
    .maybeSingle()
  if (existing) {
    slug = base + '-' + Math.random().toString(36).slice(2, 6)
  }

  const supabase = await createClient()
  const { error } = await supabase.from('events').insert({
    title,
    description,
    location,
    scope_id: scopeId,
    scope_type: 'circle',   // always circle-scoped now
    starts_at: new Date(startsAt).toISOString(),
    ends_at: endsAt ? new Date(endsAt).toISOString() : null,
    host_id: myProfileId,
    slug,
  })

  if (error) {
    console.error('createEvent error', error)
    return
  }

  revalidatePath('/events')
  revalidatePath('/feed')
  revalidatePath('/circles', 'layout')
  redirect(`/events/${slug}`)
}

export async function toggleRSVP(eventId: string, currentStatus: string | null) {
  const myProfileId = await getMyProfileId()
  if (!myProfileId) return

  const admin = createAdminClient()
  const supabase = await createClient()

  const { data: existing } = await admin
    .from('event_rsvps')
    .select('id, status')
    .eq('event_id', eventId)
    .eq('profile_id', myProfileId)
    .maybeSingle()

  if (existing) {
    await supabase
      .from('event_rsvps')
      .update({ status: existing.status === 'going' ? 'not_going' : 'going' })
      .eq('id', existing.id)
  } else {
    await supabase.from('event_rsvps').insert({
      event_id: eventId,
      profile_id: myProfileId,
      status: 'going',
    })
  }

  revalidatePath('/events')
  revalidatePath('/feed')
  revalidatePath('/circles', 'layout')
}

export async function cancelEvent(eventId: string) {
  const myProfileId = await getMyProfileId()
  if (!myProfileId) return

  const supabase = await createClient()
  await supabase
    .from('events')
    .update({ is_cancelled: true })
    .eq('id', eventId)
    .eq('host_id', myProfileId)

  revalidatePath('/events')
  revalidatePath('/feed')
  revalidatePath('/circles', 'layout')
}
