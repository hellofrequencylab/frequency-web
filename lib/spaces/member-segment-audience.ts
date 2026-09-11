import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveSpaceBroadcastAudience } from '@/lib/spaces/broadcast-audience'
import { loadRootSpaceId } from '@/lib/spaces/store'
import {
  audienceEmailsByProfile,
  pairSpaceContacts,
  type RootContactRow,
  type SpaceContactRow,
} from '@/lib/crm/contact-audience'

// THE MEMBER-SEGMENT AUDIENCE (LIVE-293). The Space Message center is retired; its one capability
// Email could not do — targeting MEMBERS, one membership tier, one of the Space's circles, or one
// event's RSVPs — moved here, behind the Email composer's audience picker. The DM and Dispatch lanes
// were dropped on purpose (owner ruling 2026-09-10); the targeting was not.
//
// 🔴 THE JOIN IS BY EMAIL, NEVER BY profile_id. Per-space contact tenancy (ADR-624) makes a TENANT
// Space's contacts carry `profile_id` NULL BY LAW: they are keyed (space_id, lower(email)) and the
// member's platform record lives in the ROOT space. So narrowing a Space's OWN contacts by
// `.in('profile_id', ...)` asks for a combination the schema forbids and returns nobody, on every
// Space except the root hub. lib/spaces/audiences.ts already does exactly that for its `place` facet,
// which is why this path deliberately does NOT reuse it: it pairs through lib/crm/contact-audience.ts
// by ADDRESS, the key every contact writer actually uses, exactly as the retiring route did.
//
// PRIVACY (ADR-863) is unchanged by the move. A member's auth-account email is delivery data they
// never gave the Space, so it is never read: the addresses come from the member's ROOT contact record
// (their platform CRM row), and a member is emailable only when THIS Space already holds a contact of
// its own for that address. Nothing new is disclosed to the operator.
//
// Every read is service-role BEHIND the caller's editor gate, bounded by the audience, and FAIL-SAFE:
// a broken read degrades to nobody, never a throw and never a wider send.

/** How many profile ids one root-contact read will ask for. A segment is already capped upstream
 *  (lib/spaces/broadcast-audience.ts), so this is the second belt, not the first. */
const ROOT_LOOKUP_CAP = 5000

/** Untyped admin handle: `contacts` is not in the generated types (ADR-246 convention). */
function db(): { from: (t: string) => any } { // eslint-disable-line @typescript-eslint/no-explicit-any
  return createAdminClient() as never
}

/**
 * Which of a Space's OWN contact rows belong to a member segment.
 *
 * `segmentKey` is one of the broadcast-audience keys: `members`, `tier:<id>`, `circle:<id>`,
 * `event:<id>`. It is ALWAYS re-resolved server-side from the key (ADR-274), so a client can never
 * hand over a recipient list. `spaceContacts` are the rows the caller already read scoped to
 * `space_id = spaceId`; pairing against them keeps the read count at one extra query and keeps the
 * "contacts of THIS Space only" rule structural rather than repeated.
 *
 * Returns the matching contact ids. FAIL-SAFE to an EMPTY set, which narrows to nobody: on a send
 * surface, too few recipients is a missing email and too many is one that cannot be recalled.
 */
export async function contactIdsInMemberSegment(
  spaceId: string,
  segmentKey: string,
  spaceContacts: readonly SpaceContactRow[],
): Promise<Set<string>> {
  const empty = new Set<string>()
  if (!spaceId || !segmentKey || spaceContacts.length === 0) return empty

  // 1. The segment's members, re-resolved from the key alone.
  let profileIds: string[] = []
  try {
    profileIds = await resolveSpaceBroadcastAudience(spaceId, [segmentKey])
  } catch {
    return empty
  }
  if (profileIds.length === 0) return empty
  const wanted = profileIds.slice(0, ROOT_LOOKUP_CAP)

  // 2. Their ROOT contact records, for their addresses only. profile_id is legitimate HERE and only
  //    here: the root space is the one space where a contact carries a profile link.
  const rootSpaceId = await loadRootSpaceId()
  if (!rootSpaceId) return empty
  let rootRows: RootContactRow[] | null = null
  try {
    const { data } = await db()
      .from('contacts')
      .select('profile_id, email')
      .eq('space_id', rootSpaceId)
      .in('profile_id', wanted)
    rootRows = (data ?? null) as RootContactRow[] | null
  } catch {
    return empty
  }
  const emailByProfile = audienceEmailsByProfile(rootRows, wanted)
  if (emailByProfile.size === 0) return empty

  // 3. Pair those addresses to the rows THIS Space holds. BY EMAIL. Pure (lib/crm/contact-audience).
  const paired = pairSpaceContacts(emailByProfile, spaceContacts)
  return new Set(paired.map((r) => r.contactId))
}
