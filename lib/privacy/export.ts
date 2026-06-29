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
// exactly one `profileId` and that id is the ONLY id any filter ever uses. There
// is no code path that can read another member's row:
//   • profiles ............ id = me
//   • posts ............... author_id = me
//   • practice_logs ....... profile_id = me
//   • practice_sessions ... profile_id = me
//   • event_rsvps ......... profile_id = me
//   • memberships ......... profile_id = me
//   • zap_transactions .... profile_id = me        (gamification ledger I own)
//   • gem_transactions .... profile_id = me        (gamification ledger I own)
//   • member_tags ......... profile_id = me        (tags assigned TO me)
//   • ai_member_context ... profile_id = me        (Vera's memory of me)
//   • consent_records ..... profile_id = me        (my consent history)
//   • network_contacts .... owner_id = me          (CRM rows I own)
//   • network_contact_notes/tags ... contact_id IN (my own contacts)
//
// We use the service-role admin client (mirrors lib/account.ts) so the export is
// complete regardless of per-table RLS coverage, BUT because the admin client
// bypasses RLS, the in-code filters above ARE the access control — they must stay
// scoped to `profileId`. Do not add a query here without an owner filter.

import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

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
    eventRsvps,
    memberships,
    zapTransactions,
    gemTransactions,
    memberTags,
    networkContacts,
    aiContextRes,
    consentRecords,
  ] = await Promise.all([
    db.from('profiles').select('*').eq('id', profileId).maybeSingle(),
    rows(db.from('posts').select('*').eq('author_id', profileId)),
    rows(db.from('practice_logs').select('*').eq('profile_id', profileId)),
    rows(db.from('practice_sessions').select('*').eq('profile_id', profileId)),
    rows(db.from('event_rsvps').select('*').eq('profile_id', profileId)),
    rows(db.from('memberships').select('*').eq('profile_id', profileId)),
    rows(db.from('zap_transactions').select('*').eq('profile_id', profileId)),
    rows(db.from('gem_transactions').select('*').eq('profile_id', profileId)),
    rows(db.from('member_tags').select('*').eq('profile_id', profileId)),
    rows(db.from('network_contacts').select('*').eq('owner_id', profileId)),
    db.from('ai_member_context').select('*').eq('profile_id', profileId).maybeSingle(),
    rows(db.from('consent_records').select('*').eq('profile_id', profileId)),
  ])

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
      consentRecords,
    },
  }
}
