// CAPTURE-NOW, CLAIM-ON-JOIN — the shared lead-grab engine (docs/CRM-MASTER-BUILD-PLAN.md §Phase 3,
// CRM-STRATEGY §4). One engine behind all five lead-grab "front doors":
//
//   1. Space QR lead-grab (offer-unlock + staff attribution)   [FULL — app/q/[slug] + qr-capture]
//   2. Vouched warm intro (member -> Space, Space <-> Space)    [engine hook + a stub surface]
//   3. Event / attendance capture (tier -> lifecycle stage)     [engine hook]
//   4. Consent-native lead magnet (capture = opt-in)            [engine hook]
//   5. Reciprocal share-back exchange                           [engine hook]
//
// THE MEMBRANE LAWS (docs/CRM-MASTER-BUILD-PLAN.md §1.3) are the invariant here:
//   • A capture writes a SEALED Space lead: contacts.space_id set, profile_id null, consent 'unknown'.
//   • It stamps an IMMUTABLE entry point (lead_entry_points, one per contact, set once, never
//     overwritten — enforced by unique(contact_id) + the DB trigger) recording the DOOR they came
//     through, and an APPEND-ONLY touchpoint (lead_touchpoints).
//   • JOIN is the only bridge: when a sealed lead signs up, the email match LINKS the lead to the new
//     profile (the profiles_sync_contact DB trigger sets contacts.profile_id automatically), we log a
//     'claim' touchpoint and retro-attribute, and the Space CRM shows them as a member with the
//     original door intact. We LINK, never copy the private overlay; consent never transfers.
//
// CONSENT POSTURE (deliverable 6): capture != marketing consent. A default sealed lead stays
// consent_state='unknown'. ONLY a consent-native door (lead magnet), an unlocked offer, or an accepted
// warm intro flips a lead to mailable ('subscribed'), and only from 'unknown' — an 'unsubscribed' lead
// is NEVER re-subscribed. Enforced in consentStateForDoor() below.
//
// SHAPE (mirrors lib/crm/interactions.ts + lib/crm/graduation.ts): the PURE helpers at the top have no
// Supabase / Next imports, so they unit-test in isolation (entry-point immutability, dedupe key, door
// consent, claim matching). The IO below reaches contacts + the two new tables through the UNTYPED
// admin client (not in the generated DB types yet, ADR-246). Every IO path is FAIL-SAFE: a capture can
// never break a scan or a signup — errors return null and the caller falls through to its normal flow.
//
// SCHEMA NOTE: public.contacts uniqueness is PER-SPACE — unique(space_id, lower(email)) (ADR-624,
// 20261164000000_contact_tenancy_per_space.sql), so the SAME email can be a separate contact in the ROOT
// space AND in an independent (white-label) Space's CRM. Every email lookup here is therefore scoped to a
// known space_id (a bare .maybeSingle() on email would throw on a multi-row address). A sealed lead is
// the row tagged with its Space's space_id; on signup the profiles_sync_contact trigger links profile_id
// on the ROOT contact only, never a tenant Space's lead row. A member down-spilling into a Space becomes
// a SEPARATE sealed tenant lead (see linkMemberToSpaceLead) — we never re-tag the root member contact.
// Back-compat: a scoped read returns the exact same row under the OLD global index, so this is
// behavior-preserving before the migration and correct after it.

import { createAdminClient } from '@/lib/supabase/admin'
import { recordContactInteraction } from '@/lib/crm/interactions'
import type { Json } from '@/lib/database.types'

// ── Doors ─────────────────────────────────────────────────────────────────────────────────────────

/** The lead-grab door taxonomy. Kept in lock-step with lead_entry_points.kind in the migration. */
export const LEAD_DOORS = ['space_qr', 'warm_intro', 'event', 'lead_magnet', 'share_back'] as const
export type LeadDoor = (typeof LEAD_DOORS)[number]

export function isLeadDoor(v: unknown): v is LeadDoor {
  return typeof v === 'string' && (LEAD_DOORS as readonly string[]).includes(v)
}

/** A human label for a door (fallback when the caller supplies none). Pure. */
export function doorLabel(door: LeadDoor): string {
  switch (door) {
    case 'space_qr':
      return 'QR scan'
    case 'warm_intro':
      return 'Warm intro'
    case 'event':
      return 'Event'
    case 'lead_magnet':
      return 'Lead magnet'
    case 'share_back':
      return 'Share back'
  }
}

export type ConsentState = 'unknown' | 'subscribed' | 'unsubscribed'

/** Options that can make a capture consent-native (mailable). */
export interface DoorConsentOpts {
  /** The scanner unlocked an offer behind the code (Space QR door). */
  offerUnlocked?: boolean
  /** The warm intro was accepted (double-opt-in complete). */
  introAccepted?: boolean
}

/**
 * PURE: is this door a mailable (consent-native) capture? Capture != marketing consent by default;
 * only a lead magnet (download == opt-in), an unlocked offer, or an accepted warm intro make a lead
 * mailable. Deterministic; no IO.
 */
export function isMailableDoor(door: LeadDoor, opts: DoorConsentOpts = {}): boolean {
  if (door === 'lead_magnet') return true
  if (door === 'space_qr') return !!opts.offerUnlocked
  if (door === 'warm_intro') return !!opts.introAccepted
  // event + share_back are never mailable on capture alone.
  return false
}

/**
 * PURE: the consent_state a capture should WRITE, given the door and the row's CURRENT consent. Never
 * downgrades and never re-subscribes an unsubscribed lead:
 *   • current 'unsubscribed' -> stays 'unsubscribed' (a hard opt-out is permanent).
 *   • current 'subscribed'   -> stays 'subscribed'.
 *   • current 'unknown'      -> 'subscribed' IFF the door is mailable, else 'unknown'.
 */
export function consentStateForDoor(
  door: LeadDoor,
  current: ConsentState = 'unknown',
  opts: DoorConsentOpts = {},
): ConsentState {
  if (current === 'unsubscribed') return 'unsubscribed'
  if (current === 'subscribed') return 'subscribed'
  return isMailableDoor(door, opts) ? 'subscribed' : 'unknown'
}

/**
 * PURE: the consent_state a MEMBERSHIP JOIN should write, given the row's current consent (ADR-797). A
 * join is an affirmative opt-in (the owner decided a join opts the member into that Space's member
 * emails), so 'unknown' becomes 'subscribed'. The one permanent rule still wins: a prior hard opt-out
 * ('unsubscribed') is NEVER resurrected. An already-'subscribed' row stays subscribed (idempotent).
 */
export function memberJoinConsent(current: ConsentState = 'unknown'): ConsentState {
  return current === 'unsubscribed' ? 'unsubscribed' : 'subscribed'
}

// ── Identity normalization (deterministic claim matching) ───────────────────────────────────────────

/** PURE: the canonical email key (lowercased, trimmed) or null. */
export function normalizeEmail(raw: string | null | undefined): string | null {
  const s = (raw ?? '').trim().toLowerCase()
  return s && s.includes('@') ? s : null
}

/** PURE: a deterministic phone match key — the last 10 digits (drops formatting + country code) or null. */
export function normalizePhoneKey(raw: string | null | undefined): string | null {
  const digits = (raw ?? '').replace(/\D+/g, '')
  if (!digits) return null
  return digits.length > 10 ? digits.slice(-10) : digits
}

// ── Pending lead-grab cookie (anonymous scan -> redeem on signup) ────────────────────────────────────

/** The cookie an anonymous Space-QR scan drops so the eventual signup redeems the lead-grab. */
export const LEAD_GRAB_COOKIE = 'fq_lead'
export const LEAD_GRAB_MAX_AGE = 60 * 60 * 24 * 30 // 30 days

/** The compact pending grab we persist in the cookie (keys short). */
export interface PendingLeadGrab {
  /** Space the lead belongs to. */
  s: string
  /** Door kind. */
  d: LeadDoor
  /** Code id scanned (optional). */
  c?: string
  /** Where/when met (event / Space / city). */
  w?: string
  /** Staff/owner who captured (code owner). */
  by?: string
  /** Offer unlocked (mailable). */
  o?: boolean
  /** A short label. */
  l?: string
}

/** PURE: serialize a pending grab for the cookie (URL-encoded JSON), or '' when invalid. */
export function encodeLeadGrab(grab: PendingLeadGrab): string {
  if (!grab || !grab.s || !isLeadDoor(grab.d)) return ''
  try {
    return encodeURIComponent(JSON.stringify(grab))
  } catch {
    return ''
  }
}

/** PURE: parse a pending-grab cookie value back to a record, or null (best-effort). */
export function parseLeadGrab(value: string | null | undefined): PendingLeadGrab | null {
  if (!value) return null
  try {
    const g = JSON.parse(decodeURIComponent(value)) as PendingLeadGrab
    if (!g || typeof g.s !== 'string' || !g.s || !isLeadDoor(g.d)) return null
    return g
  } catch {
    return null
  }
}

// ── Pure entry-point row builder ────────────────────────────────────────────────────────────────────

export interface EntryPointInput {
  spaceId: string
  contactId: string
  door: LeadDoor
  label?: string | null
  where?: string | null
  capturedByProfileId?: string | null
  codeId?: string | null
  metadata?: Record<string, unknown> | null
}

export interface EntryPointRow {
  space_id: string
  contact_id: string
  kind: LeadDoor
  label: string | null
  captured_where: string | null
  captured_by_profile_id: string | null
  code_id: string | null
  metadata: Record<string, unknown>
}

const MAX_LABEL = 120
const MAX_WHERE = 160

function clip(raw: string | null | undefined, max: number): string | null {
  const s = (raw ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
  return s.length ? s : null
}

/**
 * PURE: build the immutable entry-point insert row, or null when invalid (missing space / contact, or
 * an unknown door). Deterministic; the caller inserts insert-if-absent so it is written ONCE.
 */
export function buildEntryPointRow(input: EntryPointInput): EntryPointRow | null {
  const spaceId = (input.spaceId ?? '').trim()
  const contactId = (input.contactId ?? '').trim()
  if (!spaceId || !contactId) return null
  if (!isLeadDoor(input.door)) return null
  const metadata =
    input.metadata && typeof input.metadata === 'object' && !Array.isArray(input.metadata)
      ? input.metadata
      : {}
  return {
    space_id: spaceId,
    contact_id: contactId,
    kind: input.door,
    label: clip(input.label ?? doorLabel(input.door), MAX_LABEL),
    captured_where: clip(input.where, MAX_WHERE),
    captured_by_profile_id: (input.capturedByProfileId ?? '').trim() || null,
    code_id: (input.codeId ?? '').trim() || null,
    metadata,
  }
}

// ── IO: the untyped admin-client seam (new tables not in generated types yet, ADR-246) ───────────────

// The query builder for tables not yet in the generated types (ADR-246) is intentionally loose;
// the chain (select/insert/update -> eq/ilike/in/order/...) is untyped here by design.
/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyTable = {
  select: (cols: string) => any
  insert: (rows: Record<string, unknown> | Record<string, unknown>[]) => any
  update: (patch: Record<string, unknown>) => any
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function table(name: string): AnyTable {
  return (createAdminClient() as unknown as { from: (t: string) => AnyTable }).from(name)
}

/** The platform ROOT space id — contacts backfilled to root (20260713010000) are unclaimed, so we may
 *  tag them to a real Space; a row already tagged to a DIFFERENT real Space is left alone. Cached. */
let rootSpaceIdCache: string | null | undefined
async function rootSpaceId(): Promise<string | null> {
  if (rootSpaceIdCache !== undefined) return rootSpaceIdCache
  try {
    const { data } = (await createAdminClient()
      .from('spaces')
      .select('id')
      .eq('type', 'root')
      .maybeSingle()) as { data: { id?: string } | null }
    rootSpaceIdCache = data?.id ?? null
  } catch {
    rootSpaceIdCache = null
  }
  return rootSpaceIdCache
}

interface ContactRow {
  id: string
  email: string | null
  space_id: string | null
  profile_id: string | null
  consent_state: string | null
  display_name: string | null
  meta: Record<string, unknown> | null
}

const CONTACT_COLS = 'id, email, space_id, profile_id, consent_state, display_name, meta'

/** Resolve the ONE contact for an email WITHIN a given Space. Per-space tenancy: uniqueness is
 *  (space_id, lower(email)), so a Space-scoped read yields at most one row and `.maybeSingle()` is safe.
 *  Never leave this unscoped — a bare email lookup can span Spaces and throw on multi-row. FAIL-SAFE. */
async function findContactByEmail(email: string, spaceId: string): Promise<ContactRow | null> {
  try {
    const { data } = (await table('contacts')
      .select(CONTACT_COLS)
      .eq('space_id', spaceId)
      .eq('email', email.toLowerCase())
      .maybeSingle()) as { data: ContactRow | null }
    return data ?? null
  } catch {
    return null
  }
}

/** ALL contact rows sharing an email across Spaces (per-space tenancy: an address can live in the root
 *  space AND in one or more tenant Spaces). Set-returning — never `.maybeSingle()` — so a multi-row
 *  address is safe under the per-space unique index. FAIL-SAFE: [] on any error. */
async function findContactsByEmail(email: string): Promise<ContactRow[]> {
  try {
    const { data } = (await table('contacts').select(CONTACT_COLS).eq('email', email.toLowerCase())) as {
      data: ContactRow[] | null
    }
    return data ?? []
  } catch {
    return []
  }
}

async function findContactByProfile(profileId: string): Promise<ContactRow | null> {
  try {
    const { data } = (await table('contacts')
      .select(CONTACT_COLS)
      .eq('profile_id', profileId)
      .maybeSingle()) as { data: ContactRow | null }
    return data ?? null
  } catch {
    return null
  }
}

/** Whether we may tag a contact row's space_id to `spaceId`: only if it is currently unclaimed
 *  (null or an UNCLAIMED root backfill row) or already this space. Never hijacks another real Space's
 *  lead, and — per per-space tenancy (ADR-624) — never re-tags a root contact that already carries a
 *  real member (`profile_id` set); that row is the member's PLATFORM record, not adoptable stock. */
async function mayClaimSpace(current: string | null, spaceId: string, profileId: string | null): Promise<boolean> {
  if (!current || current === spaceId) return true
  if (profileId) return false // a linked member's root contact is never re-taggable to a tenant Space
  const root = await rootSpaceId()
  return !!root && current === root
}

/**
 * Stamp the IMMUTABLE entry point for a contact, insert-if-absent. Returns true when a NEW door was
 * written, false when one already existed (never overwritten) or on any error. The DB also guards this
 * with unique(contact_id) + the no-overwrite trigger; this is the code-side invariant.
 */
export async function stampEntryPoint(input: EntryPointInput): Promise<boolean> {
  const row = buildEntryPointRow(input)
  if (!row) return false
  try {
    // Insert-if-absent: the FIRST door wins forever. Pre-check the unique(contact_id) so a re-scan is a
    // clean no-op rather than a guaranteed-failing insert; the DB unique + no-overwrite trigger remain
    // the hard backstop against any concurrent double-insert.
    const { data: existing } = (await table('lead_entry_points')
      .select('id')
      .eq('contact_id', row.contact_id)
      .maybeSingle()) as { data: { id?: string } | null }
    if (existing) return false
    const { data, error } = (await table('lead_entry_points')
      .insert([row as unknown as Record<string, unknown>])
      .select('id')
      .maybeSingle()) as { data: { id?: string } | null; error: unknown }
    if (error || !data) return false
    return true
  } catch {
    return false
  }
}

/** The immutable entry point for a contact, or null. */
export async function getEntryPoint(contactId: string): Promise<EntryPointRow & { created_at?: string } | null> {
  try {
    const { data } = (await table('lead_entry_points')
      .select('space_id, contact_id, kind, label, captured_where, captured_by_profile_id, code_id, metadata, created_at')
      .eq('contact_id', contactId)
      .maybeSingle()) as { data: (EntryPointRow & { created_at?: string }) | null }
    return data ?? null
  } catch {
    return null
  }
}

export interface TouchpointInput {
  spaceId: string
  contactId: string
  kind: string
  channel?: string | null
  note?: string | null
  actorProfileId?: string | null
  metadata?: Record<string, unknown> | null
}

/** Append one touchpoint to the log. Fail-safe: returns false on any error, never throws. */
export async function logTouchpoint(input: TouchpointInput): Promise<boolean> {
  const spaceId = (input.spaceId ?? '').trim()
  const contactId = (input.contactId ?? '').trim()
  const kind = (input.kind ?? '').trim().slice(0, 40)
  if (!spaceId || !contactId || !kind) return false
  try {
    const { error } = (await table('lead_touchpoints').insert([
      {
        space_id: spaceId,
        contact_id: contactId,
        kind,
        channel: clip(input.channel, 40),
        note: clip(input.note, 280),
        actor_profile_id: (input.actorProfileId ?? '').trim() || null,
        metadata:
          input.metadata && typeof input.metadata === 'object' && !Array.isArray(input.metadata)
            ? input.metadata
            : {},
      },
    ])) as { error: unknown }
    return !error
  } catch {
    return false
  }
}

/** Merge an acquisition snapshot onto contacts.meta WITHOUT clobbering (first-write-wins on the door).
 *  Best-effort; a missing column simply no-ops. */
async function stampContactAcquisition(
  contact: ContactRow,
  door: LeadDoor,
  where: string | null,
  label: string | null,
): Promise<void> {
  try {
    const meta = (contact.meta && typeof contact.meta === 'object' ? contact.meta : {}) as Record<string, unknown>
    if (meta.acquisition) return // immutable first-touch — never overwrite
    const acquisition = {
      channel: door === 'space_qr' ? 'qr_scan' : door,
      source: 'lead_grab',
      door,
      campaign: label ?? null,
      where: where ?? null,
      stamped_at: new Date().toISOString(),
    }
    await table('contacts')
      .update({ meta: { ...meta, acquisition } as unknown as Json, updated_at: new Date().toISOString() })
      .eq('id', contact.id)
  } catch {
    /* best-effort */
  }
}

// ── The capture engine ───────────────────────────────────────────────────────────────────────────

export interface CaptureLeadInput {
  spaceId: string
  door: LeadDoor
  /** Identity — at least one of email / phone is required to seal a claimable lead. */
  email?: string | null
  phone?: string | null
  displayName?: string | null
  /** Met-context (event / Space / city) stamped onto the entry point. */
  where?: string | null
  label?: string | null
  /** Staff attribution (the code owner / the operator who ran the intro). */
  capturedByProfileId?: string | null
  codeId?: string | null
  offerUnlocked?: boolean
  introAccepted?: boolean
  /** Timeline touch channel (qr / in_person / event / system). Defaults by door. */
  channel?: string | null
  metadata?: Record<string, unknown> | null
}

export interface CaptureResult {
  contactId: string
  /** True when this call created the immutable entry point (first capture), false on a refresh. */
  firstTouch: boolean
}

/** The default timeline channel per door. */
function channelForDoor(door: LeadDoor): 'in_person' | 'event' | 'system' {
  if (door === 'space_qr' || door === 'warm_intro' || door === 'share_back') return 'in_person'
  if (door === 'event') return 'event'
  return 'system'
}

/**
 * Capture-now: seal a Space lead from an email/phone-bearing door (lead magnet, warm intro, event,
 * share-back, or a Space-QR capture that collected contact details). Idempotent + fail-safe:
 *   • upserts the sealed contact by (space_id, email) — a clean per-space upsert (ADR-624);
 *   • stamps the immutable entry point ONCE (never overwritten on a re-capture);
 *   • appends a touchpoint (capture / rescan) + a CRM interaction with metadata.entry_point;
 *   • applies consent per the door (default 'unknown'; mailable only for consent-native doors).
 * Returns { contactId, firstTouch } or null (no identity / any error → the caller falls through).
 */
export async function captureLead(input: CaptureLeadInput): Promise<CaptureResult | null> {
  try {
    const spaceId = (input.spaceId ?? '').trim()
    if (!spaceId || !isLeadDoor(input.door)) return null
    const email = normalizeEmail(input.email)
    const phoneKey = normalizePhoneKey(input.phone)
    if (!email && !phoneKey) return null // nothing to claim on later

    const opts: DoorConsentOpts = { offerUnlocked: input.offerUnlocked, introAccepted: input.introAccepted }
    const where = clip(input.where, MAX_WHERE)
    const label = clip(input.label ?? doorLabel(input.door), MAX_LABEL)

    // 1. Resolve / seal the contact by (space_id, email) — the per-space key (ADR-624).
    let contact = email ? await findContactByEmail(email, spaceId) : null
    const nowIso = new Date().toISOString()

    if (!contact) {
      if (!email) return null // phone-only capture with no existing row: no email column to seal on
      const consent = consentStateForDoor(input.door, 'unknown', opts)
      const { data: inserted } = (await table('contacts')
        .insert([
          {
            email,
            space_id: spaceId,
            display_name: (input.displayName ?? '').trim() || null,
            consent_state: consent,
            source: `lead_${input.door}`,
            meta: phoneKey ? { phone: input.phone ?? null, phone_key: phoneKey } : {},
            last_seen_at: nowIso,
          },
        ])
        .select(CONTACT_COLS)
        .maybeSingle()) as { data: ContactRow | null }
      contact = inserted ?? null
      if (!contact) return null
    } else {
      // Existing row: never downgrade. Tag the Space only if unclaimed; lift consent only unknown->sub.
      const patch: Record<string, unknown> = { last_seen_at: nowIso, updated_at: nowIso }
      if (await mayClaimSpace(contact.space_id, spaceId, contact.profile_id)) patch.space_id = spaceId
      const nextConsent = consentStateForDoor(input.door, (contact.consent_state as ConsentState) ?? 'unknown', opts)
      if (nextConsent !== (contact.consent_state ?? 'unknown')) patch.consent_state = nextConsent
      if (!contact.display_name && input.displayName) patch.display_name = input.displayName.trim() || null
      try {
        await table('contacts').update(patch).eq('id', contact.id)
      } catch {
        /* best-effort */
      }
    }

    // 2. Immutable entry point (once) + acquisition snapshot.
    const firstTouch = await stampEntryPoint({
      spaceId,
      contactId: contact.id,
      door: input.door,
      label,
      where,
      capturedByProfileId: input.capturedByProfileId,
      codeId: input.codeId,
      metadata: input.metadata,
    })
    await stampContactAcquisition(contact, input.door, where, label)

    // 3. Touchpoint (capture on first touch, rescan after) + CRM interaction.
    await logTouchpoint({
      spaceId,
      contactId: contact.id,
      kind: firstTouch ? 'capture' : 'rescan',
      channel: input.channel ?? channelForDoor(input.door),
      note: where ? `${label} at ${where}` : label,
      actorProfileId: input.capturedByProfileId,
      metadata: { door: input.door },
    })
    await recordInteractionForCapture(spaceId, contact.id, input.door, where, label, input.channel ?? null, input.capturedByProfileId ?? null)

    return { contactId: contact.id, firstTouch }
  } catch {
    return null
  }
}

/** The Space's owner profile id (spaces.owner_profile_id), or null when unset (e.g. the platform ROOT
 *  space, whose owner is null). A lead-capture interaction row needs a REAL profile id for its NOT-NULL
 *  owner_profile_id FK; the Space owner is that stand-in when a capture had no staff attributor.
 *  FAIL-SAFE: null on any error. */
async function spaceOwnerProfileId(spaceId: string): Promise<string | null> {
  const sid = (spaceId ?? '').trim()
  if (!sid) return null
  try {
    const { data } = (await createAdminClient()
      .from('spaces')
      .select('owner_profile_id')
      .eq('id', sid)
      .maybeSingle()) as { data: { owner_profile_id?: string | null } | null }
    return data?.owner_profile_id ?? null
  } catch {
    return null
  }
}

/** Record the capture on the unified CRM timeline (imported seam; never throws). */
async function recordInteractionForCapture(
  spaceId: string,
  contactId: string,
  door: LeadDoor,
  where: string | null,
  label: string | null,
  channel: string | null,
  capturedByProfileId: string | null,
): Promise<void> {
  const ch = (channel ?? channelForDoor(door)) as 'in_person' | 'event' | 'system'
  // owner_profile_id is NOT NULL and a real FK to profiles(id). A lead-capture has no PERSONAL owner —
  // it belongs to the Space (scope is `space_id`, the 2nd arg, which every read of these rows filters
  // on) — but the row still needs a REAL profile id to satisfy the FK. Use the staff attributor when
  // present, else the Space's owner profile. When NEITHER exists (e.g. the root space has no owner), we
  // SKIP the row rather than insert an FK-violating one that the DB would reject and the .catch() swallow
  // (which silently dropped the "Lead captured via …" timeline row before this fix).
  const owner = (capturedByProfileId ?? '').trim() || (await spaceOwnerProfileId(spaceId))
  if (!owner) return
  await recordContactInteraction(
    {
      ownerProfileId: owner,
      subjectKind: 'contact',
      subjectId: contactId,
      channel: ch === 'in_person' || ch === 'event' || ch === 'system' ? ch : 'system',
      direction: 'inbound',
      summary: where ? `Lead captured via ${doorLabel(door)} at ${where}` : `Lead captured via ${doorLabel(door)}`,
      source: 'system',
      metadata: { entry_point: { door, where, label } },
    },
    spaceId,
  ).catch(() => {})
}

/**
 * DOWN-SPILL: a SIGNED-IN member scanned a Space lead-grab code. Under per-space tenancy (ADR-624) the
 * member enters this Space as a SEPARATE sealed tenant lead — never by re-tagging their platform (root)
 * contact into the Space (that would move a member's root record into a tenant CRM: tenancy corruption).
 * We use the member's root contact ONLY to read their identity (email/display name), then resolve or
 * create THIS Space's row by (space_id, email) and stamp the door / touchpoint / interaction on it.
 * Idempotent (re-scan refreshes met-context, never a duplicate door) + fail-safe. Returns the contactId.
 */
export async function linkMemberToSpaceLead(input: {
  spaceId: string
  profileId: string
  door: LeadDoor
  where?: string | null
  label?: string | null
  codeId?: string | null
  capturedByProfileId?: string | null
  offerUnlocked?: boolean
}): Promise<string | null> {
  try {
    const spaceId = (input.spaceId ?? '').trim()
    const profileId = (input.profileId ?? '').trim()
    if (!spaceId || !profileId) return null

    // Identify the member by their platform (root) contact — used ONLY to read identity, NEVER as the row
    // we tag into the Space. The tenant lead is keyed on the member's email.
    const member = await findContactByProfile(profileId)
    const email = member?.email ? normalizeEmail(member.email) : null
    if (!member || !email) return null // no CRM row / no email — nothing to link; caller falls through

    const where = clip(input.where, MAX_WHERE)
    const label = clip(input.label ?? doorLabel(input.door), MAX_LABEL)
    const nowIso = new Date().toISOString()

    // Resolve THIS Space's row for the member's email; create a sealed tenant lead if absent. Scoped to
    // (space_id, email) so it is safe under both indexes and never touches the member's root contact. The
    // tenant lead stays profile_id NULL (a white-label CRM's lead is not the platform member record); the
    // join is recorded as a touchpoint, not by linking profile_id here.
    let contact = await findContactByEmail(email, spaceId)
    if (!contact) {
      const consent = consentStateForDoor(input.door, 'unknown', { offerUnlocked: input.offerUnlocked })
      const { data: inserted } = (await table('contacts')
        .insert([
          {
            email,
            space_id: spaceId,
            display_name: member.display_name ?? null,
            consent_state: consent,
            source: `lead_${input.door}`,
            last_seen_at: nowIso,
          },
        ])
        .select(CONTACT_COLS)
        .maybeSingle()) as { data: ContactRow | null }
      contact = inserted ?? null
      if (!contact) return null // e.g. pre-migration collision with a root row — fail-safe no-op
    } else {
      const patch: Record<string, unknown> = { last_seen_at: nowIso, updated_at: nowIso }
      const nextConsent = consentStateForDoor(input.door, (contact.consent_state as ConsentState) ?? 'unknown', {
        offerUnlocked: input.offerUnlocked,
      })
      if (nextConsent !== (contact.consent_state ?? 'unknown')) patch.consent_state = nextConsent
      if (!contact.display_name && member.display_name) patch.display_name = member.display_name
      try {
        await table('contacts').update(patch).eq('id', contact.id)
      } catch {
        /* best-effort */
      }
    }

    const firstTouch = await stampEntryPoint({
      spaceId,
      contactId: contact.id,
      door: input.door,
      label,
      where,
      capturedByProfileId: input.capturedByProfileId,
      codeId: input.codeId,
      metadata: { member: true },
    })
    await stampContactAcquisition(contact, input.door, where, label)
    await logTouchpoint({
      spaceId,
      contactId: contact.id,
      kind: firstTouch ? 'capture' : 'rescan',
      channel: channelForDoor(input.door),
      note: where ? `${label} at ${where}` : label,
      actorProfileId: profileId,
      metadata: { door: input.door, member: true },
    })
    await recordInteractionForCapture(spaceId, contact.id, input.door, where, label, null, input.capturedByProfileId ?? null)
    return contact.id
  } catch {
    return null
  }
}

/**
 * MEMBERSHIP JOIN -> a mailable Space contact (ADR-797). When someone JOINS a Space (member.joined),
 * materialize (or refresh) THIS Space's contact for them so the welcome / onboarding automation can reach
 * them. This is the bridge the `member.joined` trigger needs: a tenant Space's contacts carry profile_id
 * NULL (the membrane law), so the runtime cannot resolve a member's Space contact by (space_id,
 * profile_id) — it must resolve by EMAIL, which is what this returns.
 *
 * CONSENT: unlike a lead-grab capture (which stays 'unknown' until an explicit opt-in), a JOIN is an
 * AFFIRMATIVE opt-in — the owner decided a join opts the member into that Space's own member emails
 * (ADR-797). So the contact is SUBSCRIBED. The one hard rule that still wins: a prior 'unsubscribed' is
 * PERMANENT and is never resurrected (mirrors consentStateForDoor / the opt-in funnel's permanence).
 *
 * TENANCY: the row is keyed (space_id, email) with profile_id NULL — a tenant Space's contact is never the
 * member's platform (root) record — exactly like linkMemberToSpaceLead. The member's root contact is read
 * ONLY to resolve their email + name. Idempotent + fail-safe. Returns the Space contactId, or null when
 * the member has no resolvable email (nothing to materialize; the caller's join still succeeds).
 */
export async function ensureSpaceMemberContact(spaceId: string, profileId: string): Promise<string | null> {
  try {
    const sid = (spaceId ?? '').trim()
    const pid = (profileId ?? '').trim()
    if (!sid || !pid) return null

    // Identity from the member's platform (root) contact — read ONLY, never tagged into the Space.
    const member = await findContactByProfile(pid)
    const email = member?.email ? normalizeEmail(member.email) : null
    if (!member || !email) return null // no CRM row / no email — nothing to materialize; caller falls through

    const nowIso = new Date().toISOString()
    const existing = await findContactByEmail(email, sid)
    if (existing) {
      // A join is affirmative opt-in: lift 'unknown' -> 'subscribed'. NEVER resurrect a hard opt-out.
      const current = (existing.consent_state as ConsentState) ?? 'unknown'
      const next = memberJoinConsent(current)
      const patch: Record<string, unknown> = { last_seen_at: nowIso, updated_at: nowIso }
      if (next !== current) patch.consent_state = next
      if (!existing.display_name && member.display_name) patch.display_name = member.display_name
      try {
        await table('contacts').update(patch).eq('id', existing.id)
      } catch {
        /* best-effort: the contact exists; a consent-bump miss self-heals on the next join/opt-in */
      }
      return existing.id
    }

    const { data: inserted } = (await table('contacts')
      .insert([
        {
          email,
          space_id: sid,
          display_name: member.display_name ?? null,
          // A join opts in (ADR-797); a later unsubscribe still wins permanently (checked on re-join above).
          consent_state: 'subscribed',
          source: 'membership_join',
          last_seen_at: nowIso,
        },
      ])
      .select(CONTACT_COLS)
      .maybeSingle()) as { data: ContactRow | null }
    return inserted?.id ?? null // e.g. a pre-migration collision with a root row — fail-safe no-op
  } catch {
    return null
  }
}

/**
 * CLAIM the anonymous pending grab at signup: the scanner joined, so the profiles_sync_contact trigger
 * has already created their contacts row by email. Redeem the fq_lead cookie into a real Space link
 * (down-spill) + a 'claim' touchpoint, keeping the ORIGINAL door. Fail-safe. Returns the contactId.
 */
export async function claimPendingLeadGrab(
  profileId: string,
  grab: PendingLeadGrab | null,
): Promise<string | null> {
  if (!grab || !profileId) return null
  const contactId = await linkMemberToSpaceLead({
    spaceId: grab.s,
    profileId,
    door: grab.d,
    where: grab.w ?? null,
    label: grab.l ?? null,
    codeId: grab.c ?? null,
    capturedByProfileId: grab.by ?? null,
    offerUnlocked: grab.o,
  })
  if (contactId) {
    await logTouchpoint({
      spaceId: grab.s,
      contactId,
      kind: 'claim',
      channel: 'system',
      note: 'Joined Frequency and claimed on signup',
      actorProfileId: profileId,
      metadata: { door: grab.d, redeemed: 'pending_grab' },
    })
  }
  return contactId
}

/**
 * CLAIM-ON-JOIN safety net: a new member finished signup. The profiles_sync_contact DB trigger already
 * linked any sealed lead sharing their email (setting contacts.profile_id). Here we log the 'claim'
 * touchpoint + retro-attribute for any sealed lead that carried an entry point, so the Space sees the
 * join on the lead's log with the original door intact. Deterministic email match; fail-safe.
 */
export async function claimLeadOnSignup(profileId: string, email: string | null | undefined): Promise<void> {
  try {
    if (!profileId) return
    const key = normalizeEmail(email)
    // Per-space tenancy (ADR-624): one email can resolve to MULTIPLE contact rows (the root member row
    // PLUS a sealed lead in each tenant Space). Resolve the SET and claim every row that carried an entry
    // point — never a single unscoped `.maybeSingle()` (which throws on a multi-row address post-migration).
    const contacts = key ? await findContactsByEmail(key) : []
    if (contacts.length === 0) {
      const byProfile = await findContactByProfile(profileId)
      if (byProfile) contacts.push(byProfile)
    }
    for (const contact of contacts) {
      const entry = await getEntryPoint(contact.id)
      if (!entry) continue // not a lead-grab lead — nothing to claim on this row
      await logTouchpoint({
        spaceId: entry.space_id,
        contactId: contact.id,
        kind: 'claim',
        channel: 'system',
        note: 'Joined Frequency and claimed on signup',
        actorProfileId: profileId,
        metadata: { door: entry.kind, redeemed: 'email_match' },
      })
    }
  } catch {
    /* best-effort */
  }
}

// ── The other four front doors ───────────────────────────────────────────────────────────────────────
// Each is a thin wrapper over captureLead with the door + consent posture pre-set, so a surface can call
// it without re-deriving the membrane/consent rules. Front door #1 (Space QR) is served by
// app/q/[slug]/route.ts + linkMemberToSpaceLead; doors #2-#5 are served by the public capture surfaces
// under app/(capture)/{intro,checkin,unlock,exchange} (each a page.tsx + actions.ts that calls the
// matching wrapper below). The mint side lives in app/(main)/spaces/[slug]/crm/doors.

/**
 * FRONT DOOR #2 — vouched warm intro (member -> Space, or Space <-> Space partner share), DOUBLE-OPT-IN.
 * Capture seals the lead as NOT mailable (introAccepted defaults false) until the person accepts on the
 * accept surface (app/(capture)/intro), which calls acceptWarmIntro().
 */
export async function captureWarmIntro(input: {
  spaceId: string
  email?: string | null
  phone?: string | null
  displayName?: string | null
  /** The member / partner who vouched (staff attribution). */
  vouchedByProfileId?: string | null
  where?: string | null
  label?: string | null
}): Promise<CaptureResult | null> {
  return captureLead({
    spaceId: input.spaceId,
    door: 'warm_intro',
    email: input.email,
    phone: input.phone,
    displayName: input.displayName,
    capturedByProfileId: input.vouchedByProfileId,
    where: input.where,
    label: input.label ?? 'Warm intro',
    introAccepted: false, // double-opt-in: not mailable until accepted
    channel: 'in_person',
  })
}

/** FRONT DOOR #2 (accept step): the introduced party accepted — flip the lead mailable + log it.
 *  Reached from the double-opt-in confirmation surface app/(capture)/intro. */
export async function acceptWarmIntro(spaceId: string, contactId: string): Promise<boolean> {
  try {
    const { data } = (await table('contacts')
      .select('id, consent_state')
      .eq('id', contactId)
      .maybeSingle()) as { data: { id: string; consent_state: string | null } | null }
    if (!data) return false
    const next = consentStateForDoor('warm_intro', (data.consent_state as ConsentState) ?? 'unknown', {
      introAccepted: true,
    })
    if (next !== (data.consent_state ?? 'unknown')) {
      await table('contacts').update({ consent_state: next, updated_at: new Date().toISOString() }).eq('id', contactId)
    }
    return logTouchpoint({ spaceId, contactId, kind: 'intro_accepted', channel: 'system', note: 'Warm intro accepted' })
  } catch {
    return false
  }
}

/**
 * FRONT DOOR #3 — event / attendance capture. Seals an attendee as a lead and records the attendance
 * tier so a Space can map tier -> lifecycle stage in its pipeline. Not mailable on capture (attendance
 * != consent). Served by the event check-in capture surface app/(capture)/checkin.
 */
export async function captureEventLead(input: {
  spaceId: string
  email?: string | null
  phone?: string | null
  displayName?: string | null
  eventTitle?: string | null
  /** e.g. 'attended' | 'rsvp' | 'vip' — the Space maps this to a lifecycle stage. */
  tier?: string | null
  capturedByProfileId?: string | null
}): Promise<CaptureResult | null> {
  return captureLead({
    spaceId: input.spaceId,
    door: 'event',
    email: input.email,
    phone: input.phone,
    displayName: input.displayName,
    where: input.eventTitle,
    label: input.eventTitle ?? 'Event',
    capturedByProfileId: input.capturedByProfileId,
    channel: 'event',
    metadata: input.tier ? { tier: input.tier } : undefined,
  })
}

/**
 * FRONT DOOR #4 — consent-native lead magnet: the download / unlock IS the opt-in, so this door captures
 * the lead as MAILABLE ('subscribed'). Only call this when the surface presented a clear consent notice.
 * Served by the lead-magnet unlock surface app/(capture)/unlock (which carries the consent notice).
 */
export async function captureLeadMagnet(input: {
  spaceId: string
  email: string
  displayName?: string | null
  magnetLabel?: string | null
}): Promise<CaptureResult | null> {
  return captureLead({
    spaceId: input.spaceId,
    door: 'lead_magnet',
    email: input.email,
    displayName: input.displayName,
    label: input.magnetLabel ?? 'Lead magnet',
    channel: 'system',
  })
}

/**
 * FRONT DOOR #5 — reciprocal share-back exchange (both parties capture each other, consent-gated). Seals
 * the lead NOT mailable on capture. TODO: build the reciprocal handshake surface (a la HiHello/Blinq).
 */
export async function captureShareBack(input: {
  spaceId: string
  email?: string | null
  phone?: string | null
  displayName?: string | null
  capturedByProfileId?: string | null
  where?: string | null
}): Promise<CaptureResult | null> {
  return captureLead({
    spaceId: input.spaceId,
    door: 'share_back',
    email: input.email,
    phone: input.phone,
    displayName: input.displayName,
    capturedByProfileId: input.capturedByProfileId,
    where: input.where,
    label: 'Share back',
    channel: 'in_person',
  })
}

// ── Reads for the Space "Lead capture / Entry points" surface ────────────────────────────────────────

export interface SpaceLead {
  contactId: string
  displayName: string | null
  email: string | null
  door: LeadDoor
  doorLabel: string
  where: string | null
  consentState: ConsentState
  /** Claimed = the lead joined Frequency (contacts.profile_id set). */
  claimed: boolean
  capturedAt: string | null
}

/**
 * The Space's captured leads with their immutable door + claimed status, newest door first. Service-role
 * read joined by contact_id; the caller (the gated Space CRM route) has authorized the Space scope.
 * FAIL-SAFE: [] on any error.
 */
export async function listSpaceLeads(spaceId: string, limit = 200): Promise<SpaceLead[]> {
  try {
    const sid = (spaceId ?? '').trim()
    if (!sid) return []
    const capped = Math.min(Math.max(limit, 1), 500)
    const { data: entries } = (await table('lead_entry_points')
      .select('contact_id, kind, label, captured_where, created_at')
      .eq('space_id', sid)
      .order('created_at', { ascending: false })
      .limit(capped)) as {
      data:
        | { contact_id: string; kind: string; label: string | null; captured_where: string | null; created_at: string }[]
        | null
    }
    const rows = entries ?? []
    if (rows.length === 0) return []
    const contactIds = [...new Set(rows.map((r) => r.contact_id))]
    const { data: contacts } = (await table('contacts')
      .select('id, display_name, email, consent_state, profile_id')
      .in('id', contactIds)) as {
      data: { id: string; display_name: string | null; email: string | null; consent_state: string | null; profile_id: string | null }[] | null
    }
    const byId = new Map((contacts ?? []).map((c) => [c.id, c]))
    return rows.map((r) => {
      const c = byId.get(r.contact_id)
      const door = (isLeadDoor(r.kind) ? r.kind : 'space_qr') as LeadDoor
      return {
        contactId: r.contact_id,
        displayName: c?.display_name ?? null,
        email: c?.email ?? null,
        door,
        doorLabel: r.label ?? doorLabel(door),
        where: r.captured_where ?? null,
        consentState: ((c?.consent_state as ConsentState) ?? 'unknown') as ConsentState,
        claimed: !!c?.profile_id,
        capturedAt: r.created_at ?? null,
      }
    })
  } catch {
    return []
  }
}

/** Count of captured leads + how many have claimed (joined). Fail-safe to zeros. */
export async function spaceLeadStats(spaceId: string): Promise<{ total: number; claimed: number; mailable: number }> {
  const leads = await listSpaceLeads(spaceId, 500)
  return {
    total: leads.length,
    claimed: leads.filter((l) => l.claimed).length,
    mailable: leads.filter((l) => l.consentState === 'subscribed').length,
  }
}
