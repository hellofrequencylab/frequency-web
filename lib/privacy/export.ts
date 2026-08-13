// GDPR/CCPA "Download my data" — the EXPORT half of H2-5 (Foundation Hardening).
//
// Gathers a SINGLE member's own personal data into one plain JSON object so they
// can download a portable copy of everything we hold that is keyed to them. This
// is the data-access / data-portability right; the erasure/deletion half (which
// needs schema for anonymize-vs-cascade) is handled centrally and is NOT here.
//
// OWNER-SCOPING IS THE WHOLE SAFETY CONTRACT. Every query in this file is hard
// filtered to ONE profile id, the caller's own, passed in by the server action
// after it resolves the session (never a client-supplied id). The function takes
// exactly one `profileId`, and every filter value is derived from that id and
// nothing else. There is no code path that can read another member's row:
//   • profiles ............ id = me
//   • posts ............... author_id = me
//   • practice_logs ....... profile_id = me
//   • practice_sessions ... profile_id = me
//   • event_rsvps ......... profile_id = me  OR  guest_claimed_by = me (seats taken
//                                            as a signed-out guest, later claimed)
//                                            OR  guest_email = my own VERIFIED account
//                                            address, for guest seats never claimed
//   • memberships ......... profile_id = me
//   • zap_transactions .... profile_id = me        (gamification ledger I own)
//   • gem_transactions .... profile_id = me        (gamification ledger I own)
//   • member_tags ......... profile_id = me        (tags assigned TO me)
//   • ai_member_context ... profile_id = me        (Vera's memory of me)
//   • studio_draft ........ profile_id = me        (my unfinished Spark answers)
//   • consent_records ..... profile_id = me        (my consent history)
//   • network_contacts .... owner_id = me          (CRM rows I own)
//   • network_contact_notes/tags ... contact_id IN (my own contacts)
//
// ONE read filters on something other than the id itself, and it is called out here
// rather than buried: the unclaimed-guest-seat read matches `guest_email` against the
// caller's ACCOUNT EMAIL. That address is not an input — it is resolved server-side FROM
// `profileId` (profiles.auth_user_id → auth.users), so it is the caller's own address by
// construction, and the read only happens when `auth.users.email_confirmed_at` proves the
// address was verified (ADR-854). An unverified address is a claim, not an identity, and
// matching on one would export a stranger's RSVP history to whoever typed their address.
//
// We use the service-role admin client (mirrors lib/account.ts) so the export is
// complete regardless of per-table RLS coverage, BUT because the admin client
// bypasses RLS, the in-code filters above ARE the access control — they must stay
// scoped to `profileId`. Do not add a query here without an owner filter.

import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { escapeLike } from '@/lib/search-sanitize'

/** The assembled export. `meta` documents provenance; `data` holds the rows. */
export type MemberExport = {
  meta: {
    /** Schema version of THIS export shape, bumped if the section set changes. */
    format: 'frequency.member-export'
    version: 1
    /** The member this export belongs to (echoed for the downloader's records). */
    profileId: string
    /** ISO timestamp the export was assembled. */
    generatedAt: string
    /** The personal-data sections included, in stable order. */
    sections: readonly MemberExportSection[]
  }
  data: {
    profile: Record<string, unknown> | null
    posts: Record<string, unknown>[]
    practiceLogs: Record<string, unknown>[]
    practiceSessions: Record<string, unknown>[]
    eventRsvps: Record<string, unknown>[]
    memberships: Record<string, unknown>[]
    zapTransactions: Record<string, unknown>[]
    gemTransactions: Record<string, unknown>[]
    memberTags: Record<string, unknown>[]
    networkContacts: Record<string, unknown>[]
    networkContactNotes: Record<string, unknown>[]
    networkContactTags: Record<string, unknown>[]
    aiMemberContext: Record<string, unknown> | null
    /** Unfinished Spark wizard answers, staged so a draft follows the author across devices. */
    studioDrafts: Record<string, unknown>[]
    consentRecords: Record<string, unknown>[]
  }
}

export const MEMBER_EXPORT_SECTIONS = [
  'profile',
  'posts',
  'practiceLogs',
  'practiceSessions',
  'eventRsvps',
  'memberships',
  'zapTransactions',
  'gemTransactions',
  'memberTags',
  'networkContacts',
  'networkContactNotes',
  'networkContactTags',
  'aiMemberContext',
  'studioDrafts',
  'consentRecords',
] as const

export type MemberExportSection = (typeof MEMBER_EXPORT_SECTIONS)[number]

type Rows = Record<string, unknown>[]

/**
 * Assemble the caller's OWN personal data into one JSON object.
 *
 * @param profileId the SESSION-DERIVED caller id. The caller (the server action)
 *   resolves this from the auth session via getMyProfileId; it must never be a
 *   value supplied by the client. Every row returned is scoped to this id.
 */
export async function buildMemberExport(profileId: string): Promise<MemberExport> {
  const db = createAdminClient()
  // `studio_draft` is newer than the generated types (its migration ships unapplied, by design),
  // as are event_rsvps.guest_claimed_by and event_rsvps.guest_email, so those reads go through an
  // untyped handle. The owner filter is identical and is still the whole access control.
  // eslint-disable-next-line no-restricted-syntax -- studio_draft + event_rsvps.guest_claimed_by/guest_email aren't in lib/database.types.ts yet (untyped seam, ADR-246)
  const untyped = db as unknown as SupabaseClient

  // Each read is independently owner-scoped; run them in parallel. A failed read
  // surfaces as an empty section rather than poisoning the whole export — the
  // member still gets everything that succeeded (best-effort portability).
  const rows = async (
    promise: PromiseLike<{ data: Rows | null; error: unknown }>,
  ): Promise<Rows> => {
    const { data } = await promise
    return data ?? []
  }

  const [
    profileRes,
    posts,
    practiceLogs,
    practiceSessions,
    memberRsvps,
    claimedGuestRsvps,
    memberships,
    zapTransactions,
    gemTransactions,
    memberTags,
    networkContacts,
    aiContextRes,
    studioDrafts,
    consentRecords,
  ] = await Promise.all([
    db.from('profiles').select('*').eq('id', profileId).maybeSingle(),
    rows(db.from('posts').select('*').eq('author_id', profileId)),
    rows(db.from('practice_logs').select('*').eq('profile_id', profileId)),
    rows(db.from('practice_sessions').select('*').eq('profile_id', profileId)),
    rows(db.from('event_rsvps').select('*').eq('profile_id', profileId)),
    // The seats they took as a signed-out GUEST before they had an account, which
    // claim_guest_rsvps (20270303000100) attached to them at sign-up. That function converts a
    // guest row IN PLACE — it stamps guest_claimed_by AND back-fills profile_id — so as the
    // schema stands today these rows also satisfy the read above and the two sets overlap
    // (deduped by id below). The read exists anyway because the member's claim on this history
    // is the STAMP, not the back-fill: if the conversion ever stops writing profile_id, or a
    // future path stamps a claim without it, the export would silently drop everything they did
    // before signing up and nothing would notice. Portability rights do not begin at signup.
    // guest_claimed_by is not in lib/database.types.ts, so this read uses the untyped handle
    // already opened above (ADR-246); the owner filter is identical and is still the whole
    // access control.
    rows(untyped.from('event_rsvps').select('*').eq('guest_claimed_by', profileId)),
    rows(db.from('memberships').select('*').eq('profile_id', profileId)),
    rows(db.from('zap_transactions').select('*').eq('profile_id', profileId)),
    rows(db.from('gem_transactions').select('*').eq('profile_id', profileId)),
    rows(db.from('member_tags').select('*').eq('profile_id', profileId)),
    rows(db.from('network_contacts').select('*').eq('owner_id', profileId)),
    db.from('ai_member_context').select('*').eq('profile_id', profileId).maybeSingle(),
    rows(untyped.from('studio_draft').select('*').eq('profile_id', profileId)),
    rows(db.from('consent_records').select('*').eq('profile_id', profileId)),
  ])

  // The third kind of seat: an UNCLAIMED guest RSVP, still sitting at profile_id NULL with
  // guest_email set to this member's address. Neither read above can see it, so without this the
  // member's own export silently omits their own RSVPs. These rows are not an edge case that the
  // claim function will eventually mop up — claim_guest_rsvps (20270303000100) runs exactly once,
  // at onboarding, and only when the address is already confirmed. A seat taken with the same
  // address AFTER signing up is never claimed by anything, ever. Portability covers it anyway.
  //
  // 🔴 THE ADDRESS MUST BE PROVEN, NOT TYPED — this is the gate, and it is why the read is
  // conditional rather than unconditional. An auth.users row (and, via handle_new_auth_user, a
  // profile) exists from the moment someone TYPES an address at /sign-in, before any link is
  // clicked. So "my account carries this address" proves nothing on its own: sign up as a
  // stranger's address, never confirm it, and an email-matching export would hand you their RSVP
  // history for every event they ever took a guest seat at. `email_confirmed_at` is the ONLY thing
  // separating a proven address from a claimed one, so a null there skips this read entirely — it
  // never degrades to matching the unproven string. Same gate claim_guest_rsvps itself applies,
  // same rule as ADR-854: an unverified email may address a DELIVERY, but it may never key a thing
  // that is then handed over.
  const unclaimedGuestRsvps = await (async (): Promise<Rows> => {
    try {
      // The address is read FROM the caller's own profile row, never passed in — see the header.
      const authUserId = (profileRes.data as { auth_user_id?: string | null } | null)?.auth_user_id
      if (!authUserId) return []
      const { data: userRes } = await db.auth.admin.getUserById(authUserId)
      const user = userRes?.user as
        | { email?: string | null; email_confirmed_at?: string | null }
        | null
        | undefined
      if (!user?.email_confirmed_at) return []
      const email = user.email?.trim().toLowerCase()
      if (!email) return []
      // `.ilike` + escapeLike, not `.eq`, matching how lib/crm/lead-capture.ts matches addresses:
      // capture_guest_rsvp lowercases what it writes, but the column is plain text with no citext
      // behind it, so a row from any other path may be stored mixed-case and `.eq` would miss it.
      // escapeLike neutralizes the `%`/`_` LIKE wildcards so an address containing one matches
      // literally instead of turning into a pattern that spans other people's addresses.
      //
      // `profile_id IS NULL` is belt-and-braces on top of event_rsvps_identity_check (which already
      // forbids a row carrying both identities): it means that even if that constraint were ever
      // relaxed, an email match could never drag in a row that belongs to a different member.
      return rows(
        untyped
          .from('event_rsvps')
          .select('*')
          .is('profile_id', null)
          .ilike('guest_email', escapeLike(email)),
      )
    } catch {
      // Best-effort like every other section (see `rows` above): an auth lookup that fails costs
      // this one section, it does not cost the member the rest of their export.
      return []
    }
  })()

  // One RSVP row per id. A claimed guest seat carries BOTH profile_id and guest_claimed_by, so
  // it comes back from both owner-scoped reads above; the export should list it once.
  const seenRsvpIds = new Set<string>()
  const eventRsvps = [...memberRsvps, ...claimedGuestRsvps, ...unclaimedGuestRsvps].filter((r) => {
    if (typeof r.id !== 'string') return true
    if (seenRsvpIds.has(r.id)) return false
    seenRsvpIds.add(r.id)
    return true
  })

  // Network notes/tags are scoped through the contacts the member OWNS: collect
  // the owned contact ids first, then read only children of those ids. If the
  // member owns no contacts we skip the child reads entirely (no `.in([])`).
  const contactIds = networkContacts
    .map((c) => c.id)
    .filter((id): id is string => typeof id === 'string')

  const [networkContactNotes, networkContactTags] = contactIds.length
    ? await Promise.all([
        rows(db.from('network_contact_notes').select('*').in('contact_id', contactIds)),
        rows(db.from('network_contact_tags').select('*').in('contact_id', contactIds)),
      ])
    : [[], []]

  return {
    meta: {
      format: 'frequency.member-export',
      version: 1,
      profileId,
      generatedAt: new Date().toISOString(),
      sections: MEMBER_EXPORT_SECTIONS,
    },
    data: {
      profile: (profileRes.data as Record<string, unknown> | null) ?? null,
      posts,
      practiceLogs,
      practiceSessions,
      eventRsvps,
      memberships,
      zapTransactions,
      gemTransactions,
      memberTags,
      networkContacts,
      networkContactNotes,
      networkContactTags,
      aiMemberContext: (aiContextRes.data as Record<string, unknown> | null) ?? null,
      studioDrafts,
      consentRecords,
    },
  }
}
