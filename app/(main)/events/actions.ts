'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMyProfileId } from '@/lib/auth'
import { slugify } from '@/lib/utils'
import { processGamificationEvent, recordStreakActivity } from '@/lib/achievements'
import { awardGems } from '@/lib/gems'
import { awardZaps, ZAP_AMOUNTS } from '@/lib/zaps'
import { generateOccurrencesForAnchor, type RecurrenceType } from '@/lib/event-recurrence'

const VALID_RECURRENCE: RecurrenceType[] = ['none', 'daily', 'weekly', 'monthly']

export async function createEvent(formData: FormData) {
  const title = (formData.get('title') as string | null)?.trim()
  const description = (formData.get('description') as string | null)?.trim() || null
  const location = (formData.get('location') as string | null)?.trim() || null
  const scopeId = formData.get('scopeId') as string | null
  const startsAt = formData.get('startsAt') as string | null
  const endsAt = (formData.get('endsAt') as string | null) || null

  const recurrenceRaw = (formData.get('recurrenceType') as string | null) ?? 'none'
  const recurrenceType: RecurrenceType = (VALID_RECURRENCE as string[]).includes(recurrenceRaw)
    ? (recurrenceRaw as RecurrenceType)
    : 'none'
  const recurrenceUntilRaw = (formData.get('recurrenceUntil') as string | null) || null
  const recurrenceUntil = recurrenceType !== 'none' && recurrenceUntilRaw
    ? new Date(recurrenceUntilRaw).toISOString()
    : null

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
  const { data: inserted, error } = await supabase.from('events').insert({
    title,
    description,
    location,
    scope_id: scopeId,
    scope_type: 'circle',   // always circle-scoped now
    starts_at: new Date(startsAt).toISOString(),
    ends_at: endsAt ? new Date(endsAt).toISOString() : null,
    host_id: myProfileId,
    slug,
    recurrence_type: recurrenceType,
    recurrence_until: recurrenceUntil,
  }).select('id').single()

  if (error) {
    console.error('createEvent error', error)
    return
  }

  // For recurring events, materialise the first batch of occurrences right
  // away so users see them immediately (cron also runs daily as a backstop).
  if (recurrenceType !== 'none' && inserted) {
    generateOccurrencesForAnchor(inserted.id).catch((e) =>
      console.error('[createEvent] occurrence generation:', e)
    )
  }

  processGamificationEvent({ type: 'event_host', profileId: myProfileId }).catch(() => {})
  // Hosting an in-person gathering is external/organizing → zaps (not gems).
  awardZaps(myProfileId, ZAP_AMOUNTS.event_host).catch(() => {})
  recordStreakActivity(myProfileId, 'hosting').catch(() => {})

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
    const newStatus = existing.status === 'going' ? 'not_going' : 'going'
    await supabase
      .from('event_rsvps')
      .update({ status: newStatus })
      .eq('id', existing.id)

    if (newStatus === 'going') {
      processGamificationEvent({ type: 'event_attend', profileId: myProfileId }).catch(() => {})
      recordStreakActivity(myProfileId, 'attendance').catch(() => {})
      // RSVP is a web action → gems. ATTENDANCE zaps are awarded at verified
      // check-in (ROADMAP P2.13), not on RSVP (which would be gameable).
      awardGems(myProfileId, 'event_rsvp').catch(() => {})
    }
  } else {
    await supabase.from('event_rsvps').insert({
      event_id: eventId,
      profile_id: myProfileId,
      status: 'going',
    })
    processGamificationEvent({ type: 'event_attend', profileId: myProfileId }).catch(() => {})
    recordStreakActivity(myProfileId, 'attendance').catch(() => {})
    awardGems(myProfileId, 'event_rsvp').catch(() => {})
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
