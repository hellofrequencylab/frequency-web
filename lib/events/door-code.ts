// THE EVENT DOOR CODE (LIVE-945, ADR-1784, docs/LOYALTY.md section 6). One dynamic code per event that a
// host prints or writes to an NFC tag. A tap or scan lands on the universal resolver (app/q/[slug]),
// whose event branch already does the whole door: a signed-out guest lands on the guest RSVP door, a
// member is marked going and, once the event has started, checked in through checkInEvent (window,
// host switch, RSVP and ticket gates unchanged), which pays event_attend. Nothing new runs on a tap.
//
// The row is a plain qr_codes row: destination_type 'event', purpose 'event_door:<event id>' (the
// (owner_profile_id, purpose) index is a FULL unique index, so the purpose carries the event id), no
// owner_profile_id (an anonymous tap must reach the guest door, not the inviter capture form that an
// owner-stamped event code opens). Minted once per event and reused after that. Service-role writes
// (qr_codes RLS denies client reads), after the caller's event.editSettings gate in the page.

import { createAdminClient } from '@/lib/supabase/admin'
import { generateSlug } from '@/lib/qr/codes'
import { shortLinkUrl, withMedium } from '@/lib/qr/links'

interface EventDoorCode {
  slug: string
  /** The link to print as a QR. */
  url: string
  /** The same link stamped `?m=nfc`, the one to write to a tag so the scan logs as a tap. */
  nfcUrl: string
}

/** The purpose a door code carries, unique per event under the (owner, purpose) index. */
export function doorPurpose(eventId: string): string {
  return `event_door:${eventId}`
}

/** The door code as the host sees it. Pure over the slug. */
export function doorCodeFor(slug: string): EventDoorCode {
  const url = shortLinkUrl(slug)
  return { slug, url, nfcUrl: withMedium(url, 'nfc') }
}

interface CodeLite {
  slug: string
}

/** Create-or-get the event's door code. Null when the row could not be read or made (the page shows an
 *  empty state rather than a broken code). The caller has already passed the event's manage gate. */
export async function ensureEventDoorCode(eventId: string, title: string, createdBy: string): Promise<EventDoorCode | null> {
  try {
    const db = createAdminClient()
    const purpose = doorPurpose(eventId)
    const { data: existing } = await db.from('qr_codes').select('slug').eq('event_id', eventId).eq('purpose', purpose).limit(1).maybeSingle()
    if (existing) return doorCodeFor((existing as CodeLite).slug)
    for (let i = 0; i < 5; i++) {
      const slug = generateSlug()
      const { data, error } = await db
        .from('qr_codes')
        .insert({
          slug,
          title: `Door: ${title}`.slice(0, 120),
          destination_type: 'event',
          event_id: eventId,
          active: true,
          created_by: createdBy,
          purpose,
        })
        .select('slug')
        .maybeSingle()
      if (data && !error) return doorCodeFor((data as CodeLite).slug)
      // A slug collision retries; a purpose collision means another request minted it first.
      const { data: raced } = await db.from('qr_codes').select('slug').eq('event_id', eventId).eq('purpose', purpose).limit(1).maybeSingle()
      if (raced) return doorCodeFor((raced as CodeLite).slug)
    }
    return null
  } catch {
    return null
  }
}
