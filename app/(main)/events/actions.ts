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
import { awardCircleCurrentForCheckin } from '@/lib/events/circle-current'
import { embedEvent } from '@/lib/events/embeddings'
import { sendEventRsvpConfirmationEmail, sendEventCancelledEmail } from '@/lib/email'
import { shouldSend } from '@/lib/notification-preferences'
import { buildGoogleCalendarUrl } from '@/components/events/add-to-calendar'
import { refundAllForEvent } from '@/lib/billing/tickets'
import { getEventCapabilities } from '@/lib/core/load-capabilities'
import { isEventCohost } from '@/lib/events/cohosts'
import { isStaff } from '@/lib/core/roles'
import { getCallerProfile } from '@/lib/auth'

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
  await awardCircleCurrentForCheckin(eventId, myProfileId).catch((e) => console.error('[circle current]', e))
  return { ok: true, zapsAwarded }
}

// Host-marked check-in (slice B-3). The same verified-practice reward as a guest's
// self check-in (`checkInEvent`), but HOST-authorized: a host/cohost/staff marks a
// guest present, awarding that guest their attendance zaps + streak through the SAME
// idempotency key the self check-in uses (`event_checkin:{eventId}:{profileId}`), so
// a guest who self-checked-in and then got marked present (or vice versa) is never
// double-rewarded. Server-authoritative: the event must be real, started, not
// cancelled, the caller must be able to run it, and the target must have an RSVP.
export async function hostCheckInGuest(eventId: string, guestProfileId: string): Promise<CheckInResult> {
  const caller = await requireEventManager(eventId)
  if (!caller) return { ok: false }

  const admin = createAdminClient()
  const { data: ev } = await admin
    .from('events')
    .select('starts_at, is_cancelled')
    .eq('id', eventId)
    .maybeSingle()
  if (!ev || ev.is_cancelled || new Date(ev.starts_at) > new Date()) return { ok: false }

  // The guest must actually be on the event (going/waitlist/maybe) — a host can't
  // mint attendance for someone who never RSVP'd.
  const { data: rsvp } = await admin
    .from('event_rsvps')
    .select('status')
    .eq('event_id', eventId)
    .eq('profile_id', guestProfileId)
    .maybeSingle()
  if (!rsvp || !['going', 'waitlist', 'maybe'].includes(rsvp.status as string)) return { ok: false }

  // SAME idempotency key as self check-in → host-mark and self check-in collapse to
  // exactly one rewarded attendance per (event, guest).
  const { recorded } = await recordEngagementEvent({
    idempotencyKey: `event_checkin:${eventId}:${guestProfileId}`,
    source: 'web',
    eventType: 'practice.verified',
    actorProfileId: guestProfileId,
    context: { eventId, kind: 'event_checkin', markedBy: caller.id, host_marked: true },
    verifiedAt: new Date(),
  })
  if (!recorded) return { ok: true, alreadyCheckedIn: true }

  let zapsAwarded = 0
  try {
    zapsAwarded = (await awardZapsForAction(guestProfileId, 'event_attend')).amount
  } catch {
    // never let a reward read break the check-in
  }
  await recordStreakActivity(guestProfileId, 'attendance').catch((e) => console.error('[events gamification]', e))
  await awardCircleCurrentForCheckin(eventId, guestProfileId).catch((e) => console.error('[circle current]', e))

  revalidatePath(`/events`)
  return { ok: true, zapsAwarded }
}

// Shared authorization for the manage surface + host actions: the caller must be
// able to run THIS event — its host, a cohost, whoever manages its circle
// (event.editSettings), or platform staff (web_role, ADR-208). Returns the caller
// (for an author/markedBy stamp) or null. Re-checked server-side on every host
// action; never trusts the client.
export async function requireEventManager(
  eventId: string,
): Promise<{ id: string } | null> {
  const caller = await getCallerProfile()
  if (!caller) return null
  if (isStaff(caller.webRole)) return { id: caller.id }
  const caps = await getEventCapabilities(eventId)
  if (caps.has('event.editSettings')) return { id: caller.id }
  if (await isEventCohost(eventId, caller.id)) return { id: caller.id }
  return null
}

/** Resolve a profile's email + display name (email lives on the auth user). Returns
 *  null when there's no deliverable address. */
async function resolveRecipient(
  admin: ReturnType<typeof createAdminClient>,
  profileId: string,
): Promise<{ email: string; name: string } | null> {
  const { data: profile } = await admin
    .from('profiles')
    .select('display_name, auth_user_id')
    .eq('id', profileId)
    .maybeSingle()
  if (!profile?.auth_user_id) return null
  const { data: { user } } = await admin.auth.admin.getUserById(profile.auth_user_id)
  if (!user?.email) return null
  return { email: user.email, name: profile.display_name ?? 'there' }
}

// Cancel an event → refund every paid ticket → notify every RSVP'd guest. The member
// help doc promises this; this is where it happens (mirrors the admin path in
// app/(main)/admin/events/actions.ts, sharing the refundAllForEvent money helper).
//
// AUTHORIZATION: host / cohost / circle-manager / staff (requireEventManager),
// re-verified here. The refund + notify side effects run ONLY behind that gate.
//
// IDEMPOTENT: the `.eq('is_cancelled', false)` + `.select()` flip means a re-run
// (already cancelled) returns zero rows, so the refund + notify fan-out runs at most
// once per cancellation (the email-dedupe guard). refundAllForEvent is itself
// idempotent on the money side regardless, and is behind payoutsLive().
export async function cancelEvent(eventId: string) {
  const caller = await requireEventManager(eventId)
  if (!caller) return

  const admin = createAdminClient()

  const { data: flipped, error } = await admin
    .from('events')
    .update({ is_cancelled: true })
    .eq('id', eventId)
    .eq('is_cancelled', false)
    .select('id')
  if (error) {
    console.error('[cancelEvent] flip failed', error)
    return
  }
  const firstCancel = (flipped ?? []).length > 0

  revalidatePath('/events')
  revalidatePath('/feed')
  revalidatePath('/circles', 'layout')

  // Only fan out refunds + notifications on the live → cancelled transition.
  if (firstCancel) {
    await refundAndNotifyForCancelledEvent(eventId)
  }
}

interface CancelEventMeta {
  title: string
  slug: string
  starts_at: string
}

/** Refund every paid ticket for a just-cancelled event, then notify paid attendees
 *  (refunded) and free RSVP'd attendees (cancelled). MONEY-SAFE:
 *   • refundAllForEvent() is behind payoutsLive(), is idempotent, and frees inventory
 *     via the Stripe unwind — we never reimplement that here.
 *   • Email is best-effort + queued (durable outbox), so a mail hiccup never rolls
 *     back a refund; every send goes through the events-category consent gate
 *     (shouldSend) + suppression guard, exactly like every other event email.
 *  Invoked ONLY on the live → cancelled transition, so it never double-emails. */
async function refundAndNotifyForCancelledEvent(eventId: string): Promise<void> {
  const admin = createAdminClient()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://frequencylocal.com'

  const { data: eventData } = await admin
    .from('events')
    .select('title, slug, starts_at')
    .eq('id', eventId)
    .maybeSingle()
  const event = eventData as CancelEventMeta | null
  if (!event) return
  const eventUrl = `${appUrl}/events/${event.slug}`
  const whenAbsolute = formatEventWhen(event.starts_at)

  // ── 1. Refund every succeeded ticket (idempotent + frees inventory + payoutsLive gated)
  const { refundedBuyerIds } = await refundAllForEvent(eventId)
  const refundedSet = new Set(refundedBuyerIds)

  // ── 2. Notify refunded buyers (best-effort; never blocks/rolls back a refund). ─
  for (const buyerId of refundedSet) {
    try {
      if (!(await shouldSend(buyerId, 'email', 'events'))) continue
      const recipient = await resolveRecipient(admin, buyerId)
      if (!recipient) continue
      await sendEventCancelledEmail({
        to: recipient.email,
        recipientName: recipient.name,
        recipientProfileId: buyerId,
        eventTitle: event.title,
        whenAbsolute,
        eventUrl,
        refunded: true,
      })
    } catch (err) {
      console.error('[cancelEvent] notify (refunded) failed', { eventId, buyerId, err })
    }
  }

  // ── 3. Notify the rest of the RSVP'd guests (no money — just "it's cancelled").
  // Skip anyone already emailed as a refunded buyer to avoid a duplicate note.
  const { data: rsvpData } = await admin
    .from('event_rsvps')
    .select('profile_id')
    .eq('event_id', eventId)
    .eq('status', 'going')
  const rsvpProfileIds = ((rsvpData ?? []) as { profile_id: string }[]).map((r) => r.profile_id)

  for (const profileId of rsvpProfileIds) {
    if (refundedSet.has(profileId)) continue
    try {
      if (!(await shouldSend(profileId, 'email', 'events'))) continue
      const recipient = await resolveRecipient(admin, profileId)
      if (!recipient) continue
      await sendEventCancelledEmail({
        to: recipient.email,
        recipientName: recipient.name,
        recipientProfileId: profileId,
        eventTitle: event.title,
        whenAbsolute,
        eventUrl,
        refunded: false,
      })
    } catch (err) {
      console.error('[cancelEvent] notify (rsvp) failed', { eventId, profileId, err })
    }
  }
}
