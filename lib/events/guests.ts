// Event-invite capture loop — the single fail-safe orchestrator (ADR-154).
//
// Behind the public RSVP capture form (/rsvp/<token>): one captured person is written
// to THREE places, consent observed, with per-leg failure isolation so a failure in one
// leg never corrupts the others:
//   1. event_guests        — this event's invited-guest list                 (PRIORITY)
//   2. network_contacts     — the INVITER's personal book, source='event'     (PRIORITY)
//   3. contacts (marketing) — consent_state='unknown' (ADDED, never mailed)   (BEST-EFFORT)
//
// The privacy invariant (ADR-154, non-negotiable): the captured person stays PERSONAL.
// They enter the marketing DB only as consent_state='unknown' and become mailable only
// when they later confirm an email or sign up (the deliberate promotion, ADR-099). An
// existing lead/member is NEVER downgraded. The personal notes/tags of the inviter's book
// are untouched, and owner-scoping is enforced on every write (owner_id / inviter filter).
//
// authz-delegated: caller-trusted internal helper. The inviter + event are NEVER taken
// from the client — the calling action (app/(marketing)/rsvp/[token]/actions.ts) resolves
// them ONLY from a verified signed token (lib/qr/event-invite.ts) before invoking this.
// Every write is bound to the resolved inviter/event scope.

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadRootSpaceId } from '@/lib/spaces/store'
import { rewardConnectorCapture } from '@/lib/rewards/connector'

// event_guests + network_contacts + contacts are not all in the generated DB types yet
// (ADR-246), so we talk to them through an untyped fluent handle — the repo convention
// (cf. lib/crm/lead-capture.ts, lib/connections/store.ts). PromiseLike so the update legs
// (awaited directly, no maybeSingle) resolve on await.
interface Q extends PromiseLike<{ data: unknown; error: unknown }> {
  select(cols: string): Q
  insert(row: Record<string, unknown>): Q
  update(patch: Record<string, unknown>): Q
  eq(col: string, val: unknown): Q
  order(col: string, opts?: { ascending?: boolean }): Q
  limit(n: number): Q
  maybeSingle(): Promise<{ data: { id?: string; display_name?: string | null } | null; error: unknown }>
}
type AdminHandle = { from(table: string): Q }

export type GuestRsvpStatus = 'going' | 'maybe' | 'declined'

export interface EventGuestInput {
  /** The QR owner — resolved from the signed token, never the client. */
  inviterProfileId: string
  /** The stamped event — resolved from the signed token, never the client. */
  eventId: string
  displayName: string
  email: string
  phone?: string | null
  rsvpStatus?: GuestRsvpStatus | null
  /** Extra capture context (e.g. where/when), stored on the guest + personal rows. */
  meta?: Record<string, unknown>
}

export interface EventGuestResult {
  /** True when the PRIORITY legs (guest + personal book) both landed. */
  ok: boolean
  guestId: string | null
  networkContactId: string | null
  contactId: string | null
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

function normEmail(email: string): string {
  return email.trim().toLowerCase()
}

/**
 * Capture one event guest into the three books, transactionally-best-effort. Each leg is
 * isolated in its own try/catch so one failure cannot corrupt the others; the guest +
 * personal legs are the priority, the marketing leg is best-effort (a failure there is
 * swallowed and never fails the capture).
 */
export async function captureEventGuest(input: EventGuestInput): Promise<EventGuestResult> {
  const inviterProfileId = (input.inviterProfileId || '').trim()
  const eventId = (input.eventId || '').trim()
  const email = normEmail(input.email || '')
  const displayName = (input.displayName || '').trim() || null
  const phone = (input.phone || '').trim() || null
  const rsvpStatus = input.rsvpStatus ?? null
  const meta = input.meta && typeof input.meta === 'object' ? input.meta : {}

  const result: EventGuestResult = { ok: false, guestId: null, networkContactId: null, contactId: null }

  // Guard: without a resolved inviter/event or a valid email there is nothing to capture.
  if (!inviterProfileId || !eventId || !email || !EMAIL_RE.test(email)) return result

  const db = createAdminClient() as unknown as AdminHandle
  const nowIso = new Date().toISOString()

  // ── Leg 1 (PRIORITY): the event's guest list ────────────────────────────────
  // Dedupe on (event_id, email) so a form RESUBMIT refreshes the same guest row rather than minting a
  // duplicate. This is load-bearing: `result.guestId` is the connector reward's idempotency key AND the
  // Connector achievement counts event_guests rows — a bare insert let a resubmit re-pay the capture/RSVP
  // reward and inflate the connection count. One person + one event = one row (mirrors leg 2's dedupe).
  try {
    const { data: existingGuest } = await db
      .from('event_guests')
      .select('id')
      .eq('event_id', eventId)
      .eq('email', email)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    const existingGuestId = (existingGuest as { id?: string } | null)?.id ?? null
    if (existingGuestId) {
      await db
        .from('event_guests')
        .update({
          display_name: displayName ?? undefined,
          phone: phone ?? undefined,
          rsvp_status: rsvpStatus,
          meta,
        })
        .eq('id', existingGuestId)
      result.guestId = existingGuestId
    } else {
      const { data } = await db
        .from('event_guests')
        .insert({
          event_id: eventId,
          inviter_profile_id: inviterProfileId,
          display_name: displayName,
          email,
          phone,
          rsvp_status: rsvpStatus,
          source: 'event_qr',
          meta,
        })
        .select('id')
        .maybeSingle()
      result.guestId = (data as { id?: string } | null)?.id ?? null
    }
  } catch {
    // Isolated: a guest-list failure must not stop the personal-book leg.
  }

  // ── Leg 2 (PRIORITY): the INVITER's personal book (network_contacts) ─────────
  // Dedupe on (owner_id, lower(email)) so a resubmit refreshes rather than duplicates —
  // one person, one card. Owner-scoped on every read + write; visibility stays 'private',
  // and no photo is written (no file → the PRIVATE network-contacts bucket is untouched).
  try {
    const { data: existing } = await db
      .from('network_contacts')
      .select('id')
      .eq('owner_id', inviterProfileId)
      .eq('email', email)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    const existingId = (existing as { id?: string } | null)?.id ?? null
    if (existingId) {
      await db
        .from('network_contacts')
        .update({
          display_name: displayName ?? undefined,
          phone: phone ?? undefined,
          last_contacted_at: nowIso,
          updated_at: nowIso,
        })
        .eq('id', existingId)
        .eq('owner_id', inviterProfileId)
      result.networkContactId = existingId
    } else {
      const { data: created } = await db
        .from('network_contacts')
        .insert({
          owner_id: inviterProfileId,
          source: 'event',
          visibility: 'private',
          status: 'new',
          display_name: displayName,
          email,
          phone,
          extraction: { via: 'event_qr', eventId, rsvpStatus, ...meta },
          last_contacted_at: nowIso,
        })
        .select('id')
        .maybeSingle()
      result.networkContactId = (created as { id?: string } | null)?.id ?? null
    }
  } catch {
    // Isolated: a personal-book failure must not corrupt the guest list or marketing.
  }

  // The priority legs define success: the person is kept (guest list) and in the
  // inviter's personal book. The marketing leg below is a bonus, never a gate.
  result.ok = !!result.guestId && !!result.networkContactId

  // ── Leg 3 (BEST-EFFORT): the marketing DB (contacts) ────────────────────────
  // ADDED, NEVER MAILED: consent_state='unknown' (a lead, not a subscriber). Root-scoped
  // dedupe on (space_id=root, lower(email)); an existing lead/member keeps its own
  // source + consent (never downgraded). Links the personal card back via linked_contact_id.
  // Fully swallowed: a marketing failure never fails the capture (the person is already kept).
  try {
    const root = await loadRootSpaceId()
    if (root) {
      const { data: existingContact } = await db
        .from('contacts')
        .select('id, display_name')
        .eq('space_id', root)
        .eq('email', email)
        .maybeSingle()

      let contactId = (existingContact as { id?: string } | null)?.id ?? null
      if (contactId) {
        // Touch only — never clobber an existing lead/member's source or consent_state.
        await db
          .from('contacts')
          .update({
            display_name:
              (existingContact as { display_name?: string | null }).display_name ?? displayName ?? null,
            last_seen_at: nowIso,
            updated_at: nowIso,
          })
          .eq('id', contactId)
      } else {
        const { data: inserted } = await db
          .from('contacts')
          .insert({
            email,
            display_name: displayName,
            consent_state: 'unknown', // a lead — NOT subscribed, not marketable (ADR-099)
            source: 'event',
          })
          .select('id')
          .maybeSingle()
        contactId = (inserted as { id?: string } | null)?.id ?? null
      }

      // Link the personal card back to the marketing row (owner-scoped), like syncScanToCrm.
      if (contactId && result.networkContactId) {
        await db
          .from('network_contacts')
          .update({ linked_contact_id: contactId })
          .eq('id', result.networkContactId)
          .eq('owner_id', inviterProfileId)
      }
      result.contactId = contactId
    }
  } catch {
    // Swallowed by contract: the marketing leg is best-effort.
  }

  // ── Gamification hook (ADR-154 / ADR-777): reward the inviter for the OUTCOME ──
  // Additive, best-effort, rewrites nothing above. Pays the small capture ⚡ once the
  // guest is kept, plus the RSVP ⚡ when they stated going/maybe. Idempotent + daily-
  // capped inside grantConnectorOutcome; a reward failure never fails the capture.
  if (result.guestId || result.networkContactId) {
    await rewardConnectorCapture({
      inviterProfileId,
      eventId,
      guestId: result.guestId,
      email,
      rsvpStatus,
    })
  }

  return result
}

// ── Host read: this event's captured guest list (the operator reader for ADR-154) ──

/** One captured guest, as the event host reads it on the Manage dashboard. Card-only fields
 *  (name, email, stated RSVP, when they were captured, and who invited them). event_guests has
 *  no notes/tags, so nothing private is projected here. */
export interface EventGuestListItem {
  id: string
  displayName: string | null
  email: string | null
  rsvpStatus: GuestRsvpStatus | null
  /** When the guest was captured through a member's attributed event invite. */
  capturedAt: string
  /** The member whose invite captured them (event_guests.inviter_profile_id → profiles). */
  inviterName: string | null
}

/**
 * The captured guests for one event, newest first, for the host Manage dashboard (ADR-154).
 *
 * GATING: this is a SERVICE-ROLE read. The event_guests SELECT policy already lets the host read
 * their own event's rows, but the Manage surface reads through the admin client (which bypasses
 * RLS), so the caller MUST have authorized the viewer as the event host / admin BEFORE calling
 * this — exactly as the Manage page does (getEventCapabilities → 'event.editSettings', 404 on
 * miss), mirroring lib/events/[slug]/manage/load.ts. It NEVER exposes the inviter's other
 * contacts: it reads only THIS event's guest rows. FAIL-SAFE: [] on any error.
 */
export async function listEventGuests(eventId: string): Promise<EventGuestListItem[]> {
  const id = (eventId || '').trim()
  if (!id) return []
  try {
    // event_guests isn't in the generated DB types yet (ADR-246), so this read widens to an
    // untyped client — the same seam lib/events/[slug]/manage/load.ts uses for event_dispatches.
    // eslint-disable-next-line no-restricted-syntax -- event_guests not in generated types yet (ADR-246 exception)
    const admin = createAdminClient() as unknown as SupabaseClient
    const { data } = await admin
      .from('event_guests')
      .select(
        'id, display_name, email, rsvp_status, created_at, inviter:profiles!inviter_profile_id ( display_name )',
      )
      .eq('event_id', id)
      .order('created_at', { ascending: false })

    type Row = {
      id: string
      display_name: string | null
      email: string | null
      rsvp_status: GuestRsvpStatus | null
      created_at: string
      inviter: { display_name: string | null } | null
    }
    return ((data ?? []) as unknown as Row[]).map((r) => ({
      id: r.id,
      displayName: r.display_name,
      email: r.email,
      rsvpStatus: r.rsvp_status,
      capturedAt: r.created_at,
      inviterName: r.inviter?.display_name ?? null,
    }))
  } catch {
    return []
  }
}
