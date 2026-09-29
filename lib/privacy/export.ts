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
//   • messages ............ sender_id = me         (direct messages I SENT; never the other side's)
//   • room_messages ....... author_id = me         (what I wrote in a room; embedding left out)
//   • friendships ......... user_a_id = me  OR  user_b_id = me  (two reads, deduped by id; the
//                                            other half is reduced to a handle, see below)
//   • notifications ....... recipient_id = me      (addressed to me; the actor reduced to a handle)
//   • space_members ....... profile_id = me        (my role on a Space's team, and since when)
//   • space_memberships ... member_profile_id = me (the Spaces I joined as a member, tier and date)
//   • crm_activities ...... created_by = me        (the CRM activities I logged)
//
// THE OTHER PERSON IS A HANDLE, NEVER A ROW (ADR-1582). Three of those reads name a second
// member: the other half of a friendship, whoever introduced it, the actor on a notification, the
// member who invited me to a Space. Each is embedded as that member's public `handle` through a
// many-to-one join on the FK column (`profiles!user_b_id(handle)`), and the raw profile id is
// dropped from the row, so the file says who without exporting anything else of theirs. The join
// cannot widen the read: the row it hangs off is already filtered to me.
//
// HOW THE TABLE LIST WAS CHOSEN, so the next reader re-runs it instead of trusting a number. On
// 2026-09-28, production `information_schema` (table_constraints of type FOREIGN KEY joined to
// constraint_column_usage where table_name = 'profiles', schema public) counted 212 tables keyed
// to a profile. Most are about a member THROUGH a Space or a system (a Space's CRM contact, a
// moderation log, a delivery row) and do not belong in a personal export. The rule is: a table
// joins this file when the member would say the row is theirs (they wrote it, it was addressed to
// them, or they are one side of it) and it is keyed to them by its own column. Anything keyed to a
// Space rather than a person stays out. The census named six; re-running it for "the Spaces I
// belong to" turned up that `space_members` holds only TEAM roles (viewer to admin), while a member
// who joined a Space is a `space_memberships` row (ADR-1395), so both are read.
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
    version: 2
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
    /** Direct messages the member sent. */
    messages: Record<string, unknown>[]
    /** What the member wrote in rooms. */
    roomMessages: Record<string, unknown>[]
    /** Friendships the member is one half of; the other half is `friend_handle`. */
    friendships: Record<string, unknown>[]
    /** Notifications addressed to the member; whoever acted is `actor_handle`. */
    notifications: Record<string, unknown>[]
    /** The member's role on each Space team they are part of, with the date it started. */
    spaceRoles: Record<string, unknown>[]
    /** The Spaces the member joined as a member, with tier, status and joined date. */
    spaceMemberships: Record<string, unknown>[]
    /** CRM activities the member logged. */
    crmActivities: Record<string, unknown>[]
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
  'messages',
  'roomMessages',
  'friendships',
  'notifications',
  'spaceRoles',
  'spaceMemberships',
  'crmActivities',
] as const

export type MemberExportSection = (typeof MEMBER_EXPORT_SECTIONS)[number]

type Rows = Record<string, unknown>[]

/** The one field a joined profile carries into the file: its public handle. */
function handleOf(joined: unknown): string | null {
  if (!joined || typeof joined !== 'object') return null
  const handle = (joined as { handle?: unknown }).handle
  return typeof handle === 'string' ? handle : null
}

/**
 * A friendship row as the member sees it: no profile ids, the other half as a handle, and
 * whether the member was the one who asked. `me` is the caller id the row was filtered on.
 */
export function reduceFriendship(row: Record<string, unknown>, me: string): Record<string, unknown> {
  const { user_a_id, user_b_id: _b, requested_by, a, b, introducer, ...rest } = row
  return {
    ...rest,
    friend_handle: handleOf(user_a_id === me ? b : a),
    requested_by_me: requested_by === me,
    introduced_by_handle: handleOf(introducer),
  }
}

// Column lists for the six person-keyed tables (ADR-1582). Each names what the member would
// recognise and leaves out internals: room_messages.embedding (a vector), notifications.dedupe_key.
const FRIENDSHIP_COLUMNS =
  'id, status, edge_type, how_met, met_at, met_context, requested_at, responded_at, circle_id, event_id, user_a_id, user_b_id, requested_by, a:profiles!user_a_id(handle), b:profiles!user_b_id(handle), introducer:profiles!introduced_by(handle)'
const NOTIFICATION_COLUMNS =
  'id, type, body, reference_type, reference_id, read_at, created_at, actor:profiles!actor_id(handle)'
const SPACE_ROLE_COLUMNS =
  'id, space_id, role, status, created_at, space:spaces!space_id(name, slug), inviter:profiles!invited_by(handle)'
const SPACE_MEMBERSHIP_COLUMNS =
  'id, space_id, status, billing_interval, started_at, created_at, space:spaces!space_id(name, slug), tier:space_membership_tiers!tier_id(name)'

/** A joined Space as two flat fields, so the file reads without an id lookup. */
function spaceFields(space: unknown): { space_name: string | null; space_slug: string | null } {
  const s = (space && typeof space === 'object' ? space : {}) as { name?: unknown; slug?: unknown }
  return {
    space_name: typeof s.name === 'string' ? s.name : null,
    space_slug: typeof s.slug === 'string' ? s.slug : null,
  }
}

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
    messages,
    roomMessages,
    friendshipsAsA,
    friendshipsAsB,
    notificationRows,
    spaceRoleRows,
    spaceMembershipRows,
    crmActivities,
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
    // The six person-keyed tables (LIVE-550, ADR-1582). Same shape as the fifteen above: one
    // owner column, compared to the caller id and nothing else. The embedded joins read a single
    // public column of the OTHER member, hung off a row that is already mine.
    rows(
      db.from('messages').select('id, conversation_id, body, created_at').eq('sender_id', profileId),
    ),
    rows(
      db
        .from('room_messages')
        .select('id, room_id, parent_id, body, media_url, created_at')
        .eq('author_id', profileId),
    ),
    rows(db.from('friendships').select(FRIENDSHIP_COLUMNS).eq('user_a_id', profileId)),
    rows(db.from('friendships').select(FRIENDSHIP_COLUMNS).eq('user_b_id', profileId)),
    rows(db.from('notifications').select(NOTIFICATION_COLUMNS).eq('recipient_id', profileId)),
    rows(db.from('space_members').select(SPACE_ROLE_COLUMNS).eq('profile_id', profileId)),
    rows(
      db
        .from('space_memberships')
        .select(SPACE_MEMBERSHIP_COLUMNS)
        .eq('member_profile_id', profileId),
    ),
    rows(db.from('crm_activities').select('*').eq('created_by', profileId)),
  ])

  // A friendship is one row with the member on either side, so it can only come back from one of
  // the two reads; the id dedupe is there so a malformed self-row cannot list twice.
  const seenFriendshipIds = new Set<unknown>()
  const friendships = [...friendshipsAsA, ...friendshipsAsB]
    .filter((r) => {
      if (seenFriendshipIds.has(r.id)) return false
      seenFriendshipIds.add(r.id)
      return true
    })
    .map((r) => reduceFriendship(r, profileId))

  const notifications = notificationRows.map(({ actor, ...rest }) => ({
    ...rest,
    actor_handle: handleOf(actor),
  }))

  const spaceRoles = spaceRoleRows.map(({ space, inviter, created_at, ...rest }) => ({
    ...rest,
    ...spaceFields(space),
    joined_at: created_at,
    invited_by_handle: handleOf(inviter),
  }))

  const spaceMemberships = spaceMembershipRows.map(({ space, tier, started_at, ...rest }) => {
    const t = (tier && typeof tier === 'object' ? tier : {}) as { name?: unknown }
    return {
      ...rest,
      ...spaceFields(space),
      tier_name: typeof t.name === 'string' ? t.name : null,
      joined_at: started_at,
    }
  })

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
      version: 2,
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
      messages,
      roomMessages,
      friendships,
      notifications,
      spaceRoles,
      spaceMemberships,
      crmActivities,
    },
  }
}
