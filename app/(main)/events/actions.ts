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
import { awardCircleFieldForCheckin } from '@/lib/events/circle-field'
import { embedEvent } from '@/lib/events/embeddings'
import { sendEventRsvpConfirmationEmail } from '@/lib/email'
import { shouldSend } from '@/lib/notification-preferences'
import { buildGoogleCalendarUrl } from '@/components/events/add-to-calendar'

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

  // Embed the event for the matching engine (fire-and-forget; no-ops if AI off).
  if (inserted) {
    embedEvent(inserted.id).catch((e) => console.error('[events embed]', e))
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

// Same UTC rendering the reminder cron uses (app/api/cron/event-reminders) so the
// "when" line reads identically across the RSVP confirmation and later reminders —
// "Wed Jul 22 · 7:00 AM UTC". Timezone is explicit (we don't store per-profile TZ
// yet) so it's never ambiguous.
function formatEventWhen(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
    timeZone: 'UTC', timeZoneName: 'short',
  }).replace(',', '').replace(' at ', ' · ')
}

// Best-effort, non-blocking RSVP confirmation email. Mirrors the reminder cron's
// send path exactly: events-category email preference gate (`shouldSend`) +
// suppression guard (inside sendRawEmail) + enqueueEmail outbox. Never throws into
// the RSVP action — any failure is swallowed and logged. Only called on a real
// transition into 'going'/'waitlist' (the action's own branches), so it can't
// double-send on a repeat toggle within the same status.
async function sendRsvpConfirmation(
  eventId: string,
  profileId: string,
  status: 'going' | 'waitlist',
): Promise<void> {
  try {
    if (!(await shouldSend(profileId, 'email', 'events'))) return

    const admin = createAdminClient()

    const { data: ev } = await admin
      .from('events')
      .select('title, starts_at, ends_at, location, slug, description, scope_id, scope_type, is_cancelled, host:profiles!host_id ( display_name )')
      .eq('id', eventId)
      .maybeSingle()
    if (!ev || ev.is_cancelled) return

    const { data: profile } = await admin
      .from('profiles')
      .select('display_name, auth_user_id')
      .eq('id', profileId)
      .maybeSingle()
    if (!profile?.auth_user_id) return

    const { data: { user } } = await admin.auth.admin.getUserById(profile.auth_user_id)
    if (!user?.email) return

    let circleName: string | null = null
    if (ev.scope_type === 'circle' && ev.scope_id) {
      const { data: c } = await admin.from('circles').select('name').eq('id', ev.scope_id).maybeSingle()
      circleName = c?.name ?? null
    }

    const host = (ev as unknown as { host: { display_name: string | null } | null }).host
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://frequencylocal.com'
    const eventUrl = `${appUrl}/events/${ev.slug}`

    await sendEventRsvpConfirmationEmail({
      to:                 user.email,
      recipientName:      profile.display_name ?? 'there',
      recipientProfileId: profileId,
      eventTitle:         ev.title,
      whenAbsolute:       formatEventWhen(ev.starts_at),
      location:           ev.location,
      hostName:           host?.display_name ?? null,
      circleName,
      eventUrl,
      // Add-to-calendar reuses the same ICS route + Google URL builder the event
      // page uses; only sent for confirmed seats.
      icsUrl:             status === 'going' ? `${appUrl}/events/${ev.slug}/event.ics` : null,
      googleCalUrl:       status === 'going'
        ? buildGoogleCalendarUrl({
            title: ev.title, startsAt: ev.starts_at, endsAt: ev.ends_at,
            description: ev.description, location: ev.location,
          })
        : null,
      status,
    })
  } catch (e) {
    console.error('[events rsvp confirmation email]', e)
  }
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
      // Fire-and-forget confirmation — never blocks/breaks the RSVP (best-effort,
      // self-contained try-catch + pref/suppression gating inside the helper).
      sendRsvpConfirmation(eventId, myProfileId, next).catch((e) =>
        console.error('[events rsvp confirmation email]', e)
      )
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
    sendRsvpConfirmation(eventId, myProfileId, next).catch((e) =>
      console.error('[events rsvp confirmation email]', e)
    )
  }

  revalidatePath('/events', 'layout')
  revalidatePath('/feed')
  revalidatePath('/circles', 'layout')
}

// Explicit RSVP intent (going / maybe / not_going). Unlike `toggleRSVP` (which
// flips between attend/withdraw), this lets a member move directly between the
// three states the UI offers — Going, Interested (maybe), and stepping out.
// Self-authorized: only ever touches the caller's own RSVP row.
//
//   • 'going'      → honours real capacity (full ⇒ 'waitlist'); fires the
//                    confirmation email + the going side-effects, exactly like
//                    toggleRSVP. Never double-sends within the same status.
//   • 'maybe'      → soft interest. Does NOT consume capacity and NEVER emails.
//                    If the member was holding a confirmed seat, leaving it frees
//                    it, so we promote the next person off the waitlist.
//   • 'not_going'  → withdraw. Frees a seat + promotes from waitlist if needed.
export async function setRsvpStatus(eventId: string, intent: 'going' | 'maybe' | 'not_going') {
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

  const prevStatus = existing?.status ?? 'not_going'
  // A confirmed seat is freed when we move OUT of 'going' (to maybe/not_going).
  const heldSeat = prevStatus === 'going'

  // Side-effects for a true intent-to-attend (mirrors toggleRSVP's onGoing).
  const onGoing = (firstTime: boolean) => {
    processGamificationEvent({ type: 'event_attend', profileId: myProfileId }).catch((e) => console.error('[events gamification]', e))
    recordStreakActivity(myProfileId, 'attendance').catch((e) => console.error('[events gamification]', e))
    if (firstTime) {
      awardGems(myProfileId, 'event_rsvp').catch((e) => console.error('[events gamification]', e))
    }
  }

  if (intent === 'going') {
    // No-op if already confirmed (going/waitlist) — avoids a redundant email.
    if (prevStatus !== 'going' && prevStatus !== 'waitlist') {
      const { isFull } = await getCapacityInfo(eventId)
      const next = isFull ? 'waitlist' : 'going'
      if (existing) {
        await supabase.from('event_rsvps').update({ status: next }).eq('id', existing.id)
      } else {
        await supabase.from('event_rsvps').insert({
          event_id: eventId,
          profile_id: myProfileId,
          status: next,
        })
      }
      if (next === 'going') onGoing(!existing)
      sendRsvpConfirmation(eventId, myProfileId, next).catch((e) =>
        console.error('[events rsvp confirmation email]', e)
      )
    }
  } else {
    // maybe / not_going: a soft state, no email, no capacity consumed.
    // `plus_ones` isn't in the generated DB types yet → untyped cast (repo
    // convention for not-yet-regenerated columns; see lib/events/capacity.ts).
    const db = supabase as unknown as SupabaseClient
    if (existing) {
      if (existing.status !== intent) {
        // plus_ones only mean anything for a confirmed seat — clear on stepping back.
        await db
          .from('event_rsvps')
          .update({ status: intent, plus_ones: 0 })
          .eq('id', existing.id)
      }
    } else {
      await db.from('event_rsvps').insert({
        event_id: eventId,
        profile_id: myProfileId,
        status: intent,
        plus_ones: 0,
      })
    }
    // Freed a confirmed seat → pull the next person off the waitlist.
    if (heldSeat) {
      await promoteFromWaitlist(eventId).catch((e) => { console.error('[events waitlist]', e); return null })
    }
  }

  revalidatePath('/events', 'layout')
  revalidatePath('/feed')
  revalidatePath('/circles', 'layout')
}

// Capacity-neutral headcount the host cares about: how many guests a confirmed
// attendee is bringing. Self-authorized (only the caller's own row), clamped to
// [0, MAX_PLUS_ONES], and only meaningful for a 'going' RSVP — we no-op otherwise
// so it can't inflate a maybe/waitlist row. Does NOT consume seats (the capacity
// trigger counts 'going' rows, not plus_ones) and never emails.
const MAX_PLUS_ONES = 5

export async function setRsvpPlusOnes(eventId: string, plusOnes: number) {
  const myProfileId = await getMyProfileId()
  if (!myProfileId) return

  const n = Number.isFinite(plusOnes) ? Math.max(0, Math.min(MAX_PLUS_ONES, Math.trunc(plusOnes))) : 0

  const admin = createAdminClient()
  const supabase = await createClient()

  const { data: existing } = await admin
    .from('event_rsvps')
    .select('id, status')
    .eq('event_id', eventId)
    .eq('profile_id', myProfileId)
    .maybeSingle()

  // Only a confirmed attendee can bring guests — guard rather than create rows.
  if (!existing || existing.status !== 'going') return

  // `plus_ones` isn't in the generated DB types yet → untyped cast (repo
  // convention for not-yet-regenerated columns; see lib/events/capacity.ts).
  await (supabase as unknown as SupabaseClient)
    .from('event_rsvps')
    .update({ plus_ones: n })
    .eq('id', existing.id)

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
  // Collective gamification: credit the event's circle (no-op for non-circle events).
  await awardCircleFieldForCheckin(eventId, myProfileId).catch((e) => console.error('[circle field]', e))
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
