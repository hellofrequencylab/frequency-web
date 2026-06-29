// In-person QR capture (CRM-STRATEGY §4, ADR-361, P2). When a signed-in member
// scans another member's personal connect QR, we create a PRIVATE contact in the
// scanner's My Contacts, pre-filled from the scanned member's PUBLIC profile and
// stamped with where/when they met. This is one-way: it never adds the scanned
// person to the marketing `contacts` DB and never notifies them. The reciprocal
// handshake is a later phase, out of scope here.
//
// Everything reuses the existing `network_contacts` shape and the untyped admin
// handle (repo convention, cf. store.ts). FAIL-SAFE by contract: any error returns
// null so the /q/<slug> scan + redirect can never break.

import type { Database } from '@/lib/database.types'
import { createAdminClient } from '@/lib/supabase/admin'
import { parseVcard } from '@/lib/vcard'
import { addNote, touchLastContacted } from './store'
import type { MetContext } from './types'

type NetworkContactInsert = Database['public']['Tables']['network_contacts']['Insert']
type NetworkContactUpdate = Database['public']['Tables']['network_contacts']['Update']

const db = () => createAdminClient()

/** The scanned member's PUBLIC profile fields, safe to copy into a private note. */
interface PublicProfile {
  displayName: string | null
  /** Professional title, only if the member opted to share it on their card. */
  title: string | null
}

/** Read the scanned member's public profile (display name + opted-in card title). */
async function readPublicProfile(profileId: string): Promise<PublicProfile | null> {
  const { data } = await db()
    .from('profiles')
    .select('display_name, vcard')
    .eq('id', profileId)
    .maybeSingle()
  if (!data) return null
  const r = data as Record<string, unknown>
  // The professional title is the member-controlled, opt-in vCard field — never a
  // cosmetic flair. parseVcard returns it only when the member chose to share it.
  const vcard = parseVcard(r.vcard)
  return {
    displayName: (r.display_name as string) ?? null,
    title: vcard.title,
  }
}

/** Compose the human-readable "Met via QR" connection note from the context. */
function metNote(at: string | null): string {
  // No em dashes in brand copy (CONTENT-VOICE). Plain, factual.
  return at ? `Met via QR at ${at}.` : 'Met via QR.'
}

export interface MetContextInput {
  /** The event/Space name where they met, if the code carried one. */
  at?: string | null
  /** The day they met (defaults to today). */
  on?: string | null
}

/**
 * Capture a contact from an in-person QR scan, or refresh an existing one.
 *
 * - Skips a self-scan (`scannerId === ownerProfileId`).
 * - Dedupes: if the scanner already has a contact `linked_profile_id = ownerProfileId`,
 *   it does NOT create a duplicate — it bumps `last_contacted_at`, refreshes the
 *   met-context, and returns that contact's id.
 * - Else creates a private `qr_scan` contact pre-filled from the owner's public
 *   profile, with the met-context stamped into `details.metContext` and a
 *   "Met via QR" connection note.
 *
 * Returns the contact id, or null on a skip / any error (the caller falls back to
 * its normal redirect so the scan never breaks).
 */
export async function captureQrContact(
  scannerId: string,
  ownerProfileId: string,
  metContext: MetContextInput = {},
): Promise<string | null> {
  try {
    // Never capture yourself.
    if (!scannerId || !ownerProfileId || scannerId === ownerProfileId) return null

    const at = (metContext.at ?? '').trim() || null
    const on = (metContext.on ?? '').trim() || new Date().toISOString().slice(0, 10)
    const met: MetContext = { via: 'qr', at, on }

    // Dedupe: one contact per (scanner, linked member). Refresh, don't duplicate.
    const { data: existing } = await db()
      .from('network_contacts')
      .select('id, details')
      .eq('owner_id', scannerId)
      .eq('linked_profile_id', ownerProfileId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (existing) {
      const id = String((existing as { id: string }).id)
      const prevDetails =
        ((existing as { details?: Record<string, unknown> }).details as Record<string, unknown>) ?? {}
      await db()
        .from('network_contacts')
        .update({
          details: { ...prevDetails, metContext: met },
          updated_at: new Date().toISOString(),
        } as unknown as NetworkContactUpdate)
        .eq('id', id)
        .eq('owner_id', scannerId)
      // A re-scan is a fresh touch.
      await touchLastContacted(scannerId, id)
      return id
    }

    // New capture, pre-filled from the public profile.
    const profile = await readPublicProfile(ownerProfileId)
    const nowIso = new Date().toISOString()
    const { data: created, error } = await db()
      .from('network_contacts')
      .insert({
        owner_id: scannerId,
        source: 'qr_scan',
        visibility: 'private',
        linked_profile_id: ownerProfileId,
        display_name: profile?.displayName ?? null,
        title: profile?.title ?? null,
        // The linked member's avatar renders via linked_profile_id; never copy the
        // public profile photo into the private bucket.
        avatar_path: null,
        details: { metContext: met },
        // last_contacted_at lands via the P1 migration; not in the generated types
        // yet, so the whole payload rides an untyped cast (repo convention).
        last_contacted_at: nowIso,
      } as unknown as NetworkContactInsert)
      .select('id')
      .maybeSingle()
    if (error || !created) return null
    const id = String((created as { id: string }).id)

    // The "Met via QR ..." line, through the existing note path (kind = connection).
    await addNote(scannerId, id, metNote(at), 'connection', scannerId)

    return id
  } catch {
    // FAIL-SAFE: a missing column/table must never break the scan/redirect.
    return null
  }
}
