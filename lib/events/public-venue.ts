// THE EXACT VENUE AN EVENT'S PUBLIC JSON-LD MAY CARRY (ADR-1743, owner-ruled 2026-10-14).
//
// The venue columns (venue_name, street, postal_code, geog) are revoked from the anon key
// (migration 20270330000000, SCAN-209), and that revoke stays: it is what keeps a hidden address
// out of anyone's hands who holds the publishable key. This module reads them with the service role
// for ONE surface, the public event page: its structured data and, since ADR-1744, its visible
// where-line (publicPageWhere), so the two always agree. It applies the host's flag on the
// server before anything leaves: a hidden-address event returns `{ hide_address: true }` and no
// venue at all, so no caller can publish what it never received. lib/jsonld.ts checks the flag a
// second time (publishableVenue).
//
// Only a PUBLIC, PUBLISHED, not-removed event is read, the same rows the public page renders.
// No request data is read, so the page keeps its ISR window.

import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { pointFromGeog } from '@/lib/events/geo'
import type { EventVenue } from '@/lib/jsonld'

export interface PublicEventVenue {
  /** The host's flag. `null` when the read failed: treated as hidden by the schema builder. */
  hide_address: boolean | null
  venue: EventVenue | null
}

/** Pure: shape one row into what the schema may receive. Exported for the tests. */
export function venueFromRow(row: {
  hide_address: boolean | null
  venue_name: string | null
  street: string | null
  postal_code: string | null
  geog: unknown
} | null): PublicEventVenue {
  if (!row) return { hide_address: null, venue: null }
  // NULL in the column is not "visible": only an explicit false publishes (the column defaults to
  // false, so a real row always carries one or the other).
  if (row.hide_address !== false) return { hide_address: row.hide_address ?? null, venue: null }
  const point = pointFromGeog(row.geog)
  return {
    hide_address: false,
    venue: {
      name: row.venue_name,
      street: row.street,
      postal_code: row.postal_code,
      lat: point?.lat ?? null,
      lng: point?.lng ?? null,
    },
  }
}

/** The venue for the public event page's JSON-LD, or the hidden / unknown state. Fail-soft: any
 *  error reads as unknown, which publishes the city-level Place exactly as before. */
export async function getPublicEventVenue(slug: string): Promise<PublicEventVenue> {
  try {
    const { data, error } = await createAdminClient()
      .from('events')
      .select('hide_address, venue_name, street, postal_code, geog')
      .eq('slug', slug)
      .eq('visibility', 'public')
      .eq('status', 'published')
      .is('removed_at', null)
      .limit(1)
      .maybeSingle()
    if (error) throw error
    return venueFromRow((data as Parameters<typeof venueFromRow>[0]) ?? null)
  } catch (e) {
    console.error('[public-venue] read failed; the event schema falls back to the city-level Place:', e instanceof Error ? e.message : e)
    return { hide_address: null, venue: null }
  }
}
