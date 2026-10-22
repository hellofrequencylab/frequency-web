// MEMBER CARDS, Swap contacts (LIVE-1282, ADR-1874, docs/LOYALTY.md "Member cards"). Someone looking
// at a card's face presses Swap contacts and leaves their name and a way to reach them. This is the
// CONSENT-GATED half of the exchange that ADR-361 and CRM-STRATEGY §4 left for later: the person is
// giving their details on purpose, so they may land in the card owner's book.
//
//   • A member's card: a PRIVATE network_contacts row in the OWNER's My Contacts, source 'nfc_card',
//     details.metContext { via: 'nfc_card', on: today }, plus a connection note (the qr-capture shape).
//     A signed-in tapper is linked by linked_profile_id; the link comes from the session, never the form.
//     Deduped: one contact per (owner, linked member) or (owner, email); a re-swap refreshes it.
//   • A Space's card: a SEALED Space lead through the share-back door of lib/crm/lead-capture.ts. The
//     membrane laws are that file's: contacts.space_id set, profile_id null, consent 'unknown' (a swap
//     is not marketing consent), an immutable entry point and an append-only touchpoint.
//
// The pure validation sits at the top (swap.test.ts); the IO below it is FAIL-SAFE: any error returns
// null and the caller says the save did not happen. Authorization is the caller's: the action resolves
// the card from its token on the server and passes the resolved card here.

import type { Json } from '@/lib/database.types'
import { createAdminClient } from '@/lib/supabase/admin'
import { addNote, touchLastContacted } from '@/lib/connections/store'
import type { MetContext } from '@/lib/connections/types'
import { captureLead, normalizeEmail } from '@/lib/crm/lead-capture'
import { logCardTap, type TappedCard } from './store'
import { payCardSwap } from './rewards'

// ── Pure ─────────────────────────────────────────────────────────────────────────────────────────

export const SWAP_LIMITS = { nameMax: 120, emailMax: 254, phoneMax: 40, noteMax: 500 } as const

/** A swap that passed validation. Empty optional fields are null. */
interface SwapInput {
  name: string
  email: string | null
  phone: string | null
  note: string | null
}

type SwapValidation = { ok: true; value: SwapInput } | { ok: false; error: string }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function text(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

/**
 * Validate what the Swap contacts form sent. A name and a way back (email or phone) are required; a
 * Space's card needs an email, because a sealed lead is keyed by email (lead-capture.ts captureLead).
 * Errors are the line the form prints. Pure.
 */
export function validateSwapInput(raw: unknown, opts: { forSpace?: boolean } = {}): SwapValidation {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const name = text(r.name).replace(/\s+/g, ' ')
  const email = text(r.email).toLowerCase()
  const phone = text(r.phone)
  const note = text(r.note)

  if (!name) return { ok: false, error: 'Add your name.' }
  if (name.length > SWAP_LIMITS.nameMax) return { ok: false, error: 'That name is too long.' }
  if (email && (email.length > SWAP_LIMITS.emailMax || !EMAIL_RE.test(email))) {
    return { ok: false, error: 'That email does not look right.' }
  }
  if (phone) {
    const digits = phone.replace(/\D+/g, '')
    if (phone.length > SWAP_LIMITS.phoneMax || digits.length < 7 || digits.length > 15 || /[^\d\s+().-]/.test(phone)) {
      return { ok: false, error: 'That phone number does not look right.' }
    }
  }
  if (opts.forSpace && !email) return { ok: false, error: 'Add your email so they can reach you.' }
  if (!email && !phone) return { ok: false, error: 'Add an email or a phone number.' }
  if (note.length > SWAP_LIMITS.noteMax) return { ok: false, error: `Keep the note under ${SWAP_LIMITS.noteMax} characters.` }

  return { ok: true, value: { name, email: email || null, phone: phone || null, note: note || null } }
}

/** The connection note on the owner's contact. Plain, no em dashes (CONTENT-VOICE). Pure. */
export function swapNoteText(note: string | null): string {
  const base = 'Swapped contacts by tapping your Frequency card.'
  return note ? `${base} They said: ${note}` : base
}

/** Today as yyyy-mm-dd (UTC), the met-context date. */
function today(now = new Date()): string {
  return now.toISOString().slice(0, 10)
}

// ── IO ───────────────────────────────────────────────────────────────────────────────────────────

// network_contacts goes through the untyped admin handle like lib/connections/qr-capture.ts: the
// 'nfc_card' source is newer than the generated types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function db(): any {
  return createAdminClient()
}

/**
 * Write the swap into a MEMBER owner's My Contacts. Returns the contact id, or null on any error.
 * `tapperProfileId` comes from the session (never the form) and must not be the owner.
 */
async function swapIntoMemberBook(ownerProfileId: string, input: SwapInput, tapperProfileId: string | null): Promise<string | null> {
  try {
    if (!ownerProfileId || (tapperProfileId && tapperProfileId === ownerProfileId)) return null
    const met: MetContext = { via: 'nfc_card', at: null, on: today() }
    const nowIso = new Date().toISOString()
    const email = normalizeEmail(input.email)

    // Dedupe: the linked member first, then the email. A re-swap refreshes, never duplicates.
    let existing: { id: string; details: Record<string, unknown> | null; linked_profile_id: string | null } | null = null
    if (tapperProfileId) {
      const { data } = await db()
        .from('network_contacts')
        .select('id, details, linked_profile_id')
        .eq('owner_id', ownerProfileId)
        .eq('linked_profile_id', tapperProfileId)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()
      existing = data ?? null
    }
    if (!existing && email) {
      const { data } = await db()
        .from('network_contacts')
        .select('id, details, linked_profile_id')
        .eq('owner_id', ownerProfileId)
        .eq('email', email)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()
      existing = data ?? null
    }

    let id: string
    if (existing) {
      id = String(existing.id)
      const patch: Record<string, unknown> = {
        details: { ...(existing.details ?? {}), metContext: met },
        updated_at: nowIso,
      }
      if (email) patch.email = email
      if (input.phone) patch.phone = input.phone
      // Link a contact found by email only when it is not linked yet; never re-point someone else's link.
      if (tapperProfileId && !existing.linked_profile_id) patch.linked_profile_id = tapperProfileId
      const { error } = await db().from('network_contacts').update(patch).eq('id', id).eq('owner_id', ownerProfileId)
      if (error) return null
      await touchLastContacted(ownerProfileId, id)
    } else {
      const { data: created, error } = await db()
        .from('network_contacts')
        .insert({
          owner_id: ownerProfileId,
          source: 'nfc_card',
          visibility: 'private',
          linked_profile_id: tapperProfileId,
          display_name: input.name,
          email,
          phone: input.phone,
          // A linked member's avatar renders via linked_profile_id; nothing is copied into the bucket.
          avatar_path: null,
          details: { metContext: met } as unknown as Json,
          last_contacted_at: nowIso,
        })
        .select('id')
        .maybeSingle()
      if (error || !created) return null
      id = String(created.id)
    }

    await addNote(ownerProfileId, id, swapNoteText(input.note), 'connection', null)
    return id
  } catch {
    return null
  }
}

/**
 * Write the swap as a sealed lead in a SPACE's CRM (the share-back door). Returns the contact id, or
 * null. The person holding the Space's card is the staff attribution.
 */
async function swapIntoSpaceLeads(card: Pick<TappedCard, 'owner' | 'holderProfileId'>, input: SwapInput): Promise<string | null> {
  if (card.owner.kind !== 'space') return null
  const result = await captureLead({
    spaceId: card.owner.spaceId,
    door: 'share_back',
    email: input.email,
    phone: input.phone,
    displayName: input.name,
    where: 'Member card',
    label: 'Swapped contacts',
    capturedByProfileId: card.holderProfileId || null,
    channel: 'in_person',
    metadata: { via: 'nfc_card', ...(input.note ? { note: input.note } : {}) },
  })
  return result?.contactId ?? null
}

/**
 * The whole swap for a resolved card: write it to the owner's side, count it, pay the owner. Returns
 * true only when the write landed. The caller has already checked the card is live, not paused, takes
 * swaps, and is not the tapper's own.
 */
export async function performCardSwap(card: TappedCard, input: SwapInput, tapperProfileId: string | null): Promise<boolean> {
  const id = card.owner.kind === 'member' ? await swapIntoMemberBook(card.owner.profileId, input, tapperProfileId) : await swapIntoSpaceLeads(card, input)
  if (!id) return false
  // In this order: the swap landed, then it is counted, then the owner is paid (rewards.ts contract).
  await logCardTap(card, 'swap', tapperProfileId)
  if (card.owner.kind === 'member') {
    try {
      await payCardSwap(card.owner.profileId)
    } catch {
      /* a reward failure never undoes a landed swap */
    }
  }
  return true
}
