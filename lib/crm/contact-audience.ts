// PAIRING A MEMBER AUDIENCE TO A SPACE'S OWN CONTACT ROWS — the pure half of the broadcast
// email lane's recipient resolution.
//
// WHY THIS EXISTS. Under per-space contact tenancy (ADR-624) a tenant Space's contacts carry
// `profile_id` NULL by law: they are keyed on (space_id, lower(email)), and the member's
// platform record lives in the ROOT space. `ensureSpaceMemberContact` and
// `linkMemberToSpaceLead` both say so, and both insert without a profile link. So a lane that
// resolves its recipients with `.in('profile_id', …)` scoped to a TENANT space asks for a
// combination the data model forbids, and returns nothing, forever. That is exactly what the
// Space Message center did: its email channel could not reach anyone on any Space except the
// root hub, where the signup trigger happens to set both columns.
//
// THE JOIN THAT IS ACTUALLY CORRECT is the one every contact writer uses: EMAIL. Resolve each
// audience member's address from their ROOT contact (their platform CRM record — never the
// Auth account, ADR-863), then look for a row THIS Space already holds for that address. A
// member the Space has no contact card for is simply not emailable here, which is the rule
// ADR-863 set and this keeps: the address is only ever emitted because the Space already has
// it on a contact of its own. Nothing new is disclosed to the operator.
//
// Shape follows the house convention (lib/comms/send-gate.ts, lib/crm/contact-consent.ts): the
// decision is a PURE, exhaustively-tested function over explicit state, and the IO that gathers
// that state lives at the call site. The caller does the two reads; this does the pairing.

/** One row from the ROOT space: the member's platform contact record. `email` may be stored
 *  un-normalized (an OAuth signup / import path), so the pairing lowercases before matching. */
export interface RootContactRow {
  profile_id: string | null
  email: string | null
}

/** One row from the SENDING space: a contact card the Space itself holds. */
export interface SpaceContactRow {
  id: string
  email: string | null
}

/** A recipient the email lane may send to: the member, the Space's own contact id for them,
 *  and the address that Space holds. */
export interface ContactRecipient {
  profileId: string
  contactId: string
  email: string
}

const norm = (raw: string | null | undefined): string | null => {
  const s = (raw ?? '').trim().toLowerCase()
  return s.includes('@') ? s : null
}

/**
 * The addresses to look for in a Space, given the audience's ROOT contact rows. Lowercased,
 * de-duplicated, and restricted to the profiles actually in the audience — so the caller's
 * second read is bounded by the audience, never by the Space's whole contact book. PURE.
 */
export function audienceEmailsByProfile(
  rootRows: readonly RootContactRow[] | null | undefined,
  audienceProfileIds: readonly string[],
): Map<string, string> {
  const wanted = new Set(audienceProfileIds)
  const out = new Map<string, string>()
  for (const row of rootRows ?? []) {
    const profileId = (row?.profile_id ?? '').trim()
    const email = norm(row?.email)
    // First row wins, so a duplicate platform record can never flip an address mid-resolution.
    if (!profileId || !email || !wanted.has(profileId) || out.has(profileId)) continue
    out.set(profileId, email)
  }
  return out
}

/**
 * Pair the audience to the Space's own contact rows by address. A member is emailable only when
 * the Space holds a contact for their address; everyone else is dropped (they still reach the DM
 * and Dispatch lanes). De-duplicated by address, so two profiles sharing one mailbox are mailed
 * once. Deterministic in audience order; PURE.
 */
export function pairSpaceContacts(
  emailByProfile: ReadonlyMap<string, string>,
  spaceRows: readonly SpaceContactRow[] | null | undefined,
): ContactRecipient[] {
  const contactByEmail = new Map<string, string>()
  for (const row of spaceRows ?? []) {
    const email = norm(row?.email)
    const contactId = (row?.id ?? '').trim()
    if (!email || !contactId || contactByEmail.has(email)) continue
    contactByEmail.set(email, contactId)
  }

  const out: ContactRecipient[] = []
  const seen = new Set<string>()
  for (const [profileId, email] of emailByProfile) {
    const contactId = contactByEmail.get(email)
    if (!contactId || seen.has(email)) continue
    seen.add(email)
    out.push({ profileId, contactId, email })
  }
  return out
}
