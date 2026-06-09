'use server'

import type { SupabaseClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMyProfileId } from '@/lib/auth'
import { slugify } from '@/lib/utils'
import { processGamificationEvent, recordStreakActivity } from '@/lib/achievements'
import { awardGems } from '@/lib/gems'
import { awardZapsForAction } from '@/lib/zaps'
import { recordEngagementEvent } from '@/lib/engagement/events'
import { generateOccurrencesForAnchor, type RecurrenceType } from '@/lib/event-recurrence'
import { getCapacityInfo, promoteFromWaitlist } from '@/lib/events/capacity'

const VALID_RECURRENCE: RecurrenceType[] = ['none', 'daily', 'weekly', 'monthly']
const VALID_VISIBILITY = ['public', 'unlisted', 'circle_only', 'private']
const VALID_ENERGY = ['high_activation', 'grounding', 'social', 'ceremonial']

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

  // P0 fields (additive). Capacity is the only real scarcity signal; visibility
  // defaults to circle_only to preserve the pre-P0 model.
  const capacityRaw = (formData.get('capacity') as string | null)?.trim() || ''
  const capacityParsed = capacityRaw ? parseInt(capacityRaw, 10) : NaN
  const capacity = Number.isFinite(capacityParsed) && capacityParsed > 0 ? capacityParsed : null

  const visibilityRaw = (formData.get('visibility') as string | null) || 'circle_only'
  const visibility = VALID_VISIBILITY.includes(visibilityRaw) ? visibilityRaw : 'circle_only'

  const category = (formData.get('category') as string | null)?.trim() || 'gathering'

  const energyRaw = (formData.get('energyTag') as string | null) || ''
  const energyTag = VALID_ENERGY.includes(energyRaw) ? energyRaw : null

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
  // Cast: capacity/visibility/category/energy_tag are newer than the generated
  // DB types (lib/database.types.ts) — repo convention for not-yet-regenerated
  // columns (see lib/billing/*).
  const { data: inserted, error } = await (supabase as unknown as SupabaseClient)
    .from('events').insert({
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
      capacity,
      visibility,
      category,
      energy_tag: energyTag,
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

  processGamificationEvent({ type: 'event_host', profileId: myProfileId }).catch((e) => console.error('[events gamification]', e))
  // Hosting an in-person gathering is external/organizing → zaps (not gems).
  awardZapsForAction(myProfileId, 'event_host').catch((e) => console.error('[events gamification]', e))
  recordStreakActivity(myProfileId, 'hosting').catch((e) => console.error('[events gamification]', e))

  revalidatePath('/events')
  revalidatePath('/feed')
  revalidatePath('/circles', 'layout')
  redirect(`/events/${slug}`)
}

export async function toggleRSVP(eventId: string) {
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

  // Side-effects for an intent-to-attend RSVP (only when truly 'going', never on
  // waitlist). Gems are the first-RSVP web reward; attendance zaps come at
  // check-in. We keep the streak/achievement tick that already lived here.
  const onGoing = (firstTime: boolean) => {
    processGamificationEvent({ type: 'event_attend', profileId: myProfileId }).catch((e) => console.error('[events gamification]', e))
    recordStreakActivity(myProfileId, 'attendance').catch((e) => console.error('[events gamification]', e))
    if (firstTime) {
      // One row per (event, profile); the gem fires once on the first RSVP.
      awardGems(myProfileId, 'event_rsvp').catch((e) => console.error('[events gamification]', e))
    }
  }

  if (existing) {
    if (existing.status === 'going' || existing.status === 'waitlist') {
      // Withdraw. If we freed a confirmed seat, pull the next person off the
      // waitlist (warm proof of momentum, never fake scarcity).
      await supabase.from('event_rsvps').update({ status: 'not_going' }).eq('id', existing.id)
      if (existing.status === 'going') {
        await promoteFromWaitlist(eventId).catch((e) => { console.error('[events waitlist]', e); return null })
      }
    } else {
      // Re-join: honour real capacity — waitlist only when genuinely full.
      const { isFull } = await getCapacityInfo(eventId)
      const next = isFull ? 'waitlist' : 'going'
      await supabase.from('event_rsvps').update({ status: next }).eq('id', existing.id)
      if (next === 'going') onGoing(false)
    }
  } else {
    const { isFull } = await getCapacityInfo(eventId)
    const next = isFull ? 'waitlist' : 'going'
    await supabase.from('event_rsvps').insert({
      event_id: eventId,
      profile_id: myProfileId,
      status: next,
    })
    if (next === 'going') onGoing(true)
  }

  revalidatePath('/events', 'layout')
  revalidatePath('/feed')
  revalidatePath('/circles', 'layout')
}

export interface CheckInResult {
  ok: boolean
  alreadyCheckedIn?: boolean
  zapsAwarded?: number
}

// Verified-practice check-in (the North-Star `practice.verified` event). Server-
// authoritative: the event must be real, started, not cancelled, and the viewer
// must have RSVP'd 'going'. Idempotent per (event, profile); the first check-in
// records the ledger event, awards zaps, and ticks the attendance streak.
// (RSVP = gems web-action; check-in = zaps verified practice; see ADR-021/024.)
export async function checkInEvent(eventId: string): Promise<CheckInResult> {
  const myProfileId = await getMyProfileId()
  if (!myProfileId) return { ok: false }

  const admin = createAdminClient()
  const { data: ev } = await admin
    .from('events')
    .select('starts_at, is_cancelled')
    .eq('id', eventId)
    .maybeSingle()
  if (!ev || ev.is_cancelled || new Date(ev.starts_at) > new Date()) return { ok: false }

  const { data: rsvp } = await admin
    .from('event_rsvps')
    .select('status')
    .eq('event_id', eventId)
    .eq('profile_id', myProfileId)
    .maybeSingle()
  if (rsvp?.status !== 'going') return { ok: false }

  const { recorded } = await recordEngagementEvent({
    idempotencyKey: `event_checkin:${eventId}:${myProfileId}`,
    source: 'web',
    eventType: 'practice.verified',
    actorProfileId: myProfileId,
    context: { eventId, kind: 'event_checkin' },
    verifiedAt: new Date(),
  })
  if (!recorded) return { ok: true, alreadyCheckedIn: true }

  // Verified practice always earns zaps (regardless of channel) + a streak tick.
  let zapsAwarded = 0
  try {
    zapsAwarded = (await awardZapsForAction(myProfileId, 'event_attend')).amount
  } catch {
    // never let a reward read break the check-in
  }
  await recordStreakActivity(myProfileId, 'attendance').catch((e) => console.error('[events gamification]', e))
  return { ok: true, zapsAwarded }
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
