// Contact ↔ Community merge (docs/NETWORK-CRM.md). Detects when a personal contact
// (network_contacts) and a member profile are the same person — by a HARD signal
// only (same email, or same phone digits) via the SECURITY DEFINER RPC
// `find_contact_matches` — and lets the OWNER merge them. Merging just sets
// network_contacts.linked_profile_id (a deliberate, reversible, owner-only link);
// the original logged contact fields are left untouched, so your notes survive and
// the member's live profile info is shown alongside. Server-only, owner-scoped.

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { signedUrl } from './store'

const db = () => createAdminClient() as unknown as SupabaseClient

/** A member-profile summary used to populate a merged contact card. */
export interface MatchedProfile {
  id: string
  displayName: string | null
  handle: string | null
  avatarUrl: string | null
  city: string | null
}

/** One "this contact is a member" suggestion: the logged contact + the member it
 *  hard-matches, and which signal matched. */
export interface ContactMatchSuggestion {
  contact: {
    id: string
    displayName: string | null
    email: string | null
    phone: string | null
    title: string | null
    company: string | null
    avatarUrl: string | null
    source: string
  }
  profile: MatchedProfile
  matchOn: 'email' | 'phone'
}

/** Profile summaries by id (for hydrating suggestions / merged cards). */
export async function getProfileSummaries(ids: string[]): Promise<Map<string, MatchedProfile>> {
  const map = new Map<string, MatchedProfile>()
  const unique = [...new Set(ids)].filter(Boolean)
  if (!unique.length) return map
  const { data } = await db()
    .from('profiles')
    .select('id, display_name, handle, avatar_url, city')
    .in('id', unique)
  for (const r of (data as Record<string, unknown>[] | null) ?? []) {
    map.set(String(r.id), {
      id: String(r.id),
      displayName: (r.display_name as string) ?? null,
      handle: (r.handle as string) ?? null,
      avatarUrl: (r.avatar_url as string) ?? null,
      city: (r.city as string) ?? null,
    })
  }
  return map
}

/** Pending merge suggestions for an owner — their unlinked, undismissed contacts
 *  that hard-match a member. Empty when there's nothing to reconcile. */
export async function findContactMatches(ownerId: string): Promise<ContactMatchSuggestion[]> {
  const { data: matchRows } = await db().rpc('find_contact_matches', { p_owner: ownerId })
  const matches = (matchRows as { contact_id: string; profile_id: string; match_on: string }[] | null) ?? []
  if (!matches.length) return []

  const contactIds = matches.map((m) => m.contact_id)
  const [{ data: contactRows }, profileMap] = await Promise.all([
    db()
      .from('network_contacts')
      .select('id, display_name, email, phone, title, company, avatar_path, source')
      .eq('owner_id', ownerId)
      .in('id', contactIds),
    getProfileSummaries(matches.map((m) => m.profile_id)),
  ])
  const contactById = new Map(
    ((contactRows as Record<string, unknown>[] | null) ?? []).map((r) => [String(r.id), r]),
  )

  const out: ContactMatchSuggestion[] = []
  for (const m of matches) {
    const c = contactById.get(m.contact_id)
    const profile = profileMap.get(m.profile_id)
    if (!c || !profile) continue
    out.push({
      contact: {
        id: String(c.id),
        displayName: (c.display_name as string) ?? null,
        email: (c.email as string) ?? null,
        phone: (c.phone as string) ?? null,
        title: (c.title as string) ?? null,
        company: (c.company as string) ?? null,
        avatarUrl: c.avatar_path ? await signedUrl(c.avatar_path as string) : null,
        source: (c.source as string) ?? 'manual',
      },
      profile,
      matchOn: m.match_on === 'phone' ? 'phone' : 'email',
    })
  }
  return out
}

/** Merge: link an owned contact to a member profile. Idempotent and owner-scoped;
 *  only fills an empty link (won't silently re-point an already-merged contact).
 *  Original contact fields are untouched. */
export async function mergeContactProfile(
  ownerId: string,
  contactId: string,
  profileId: string,
): Promise<boolean> {
  const { error, data } = await db()
    .from('network_contacts')
    .update({ linked_profile_id: profileId, match_dismissed: false, updated_at: new Date().toISOString() })
    .eq('id', contactId)
    .eq('owner_id', ownerId)
    .is('linked_profile_id', null)
    .select('id')
  return !error && Array.isArray(data) && data.length > 0
}

/** Dismiss a merge suggestion so it stops surfacing. Reversible by re-merging. */
export async function dismissContactMatch(ownerId: string, contactId: string): Promise<boolean> {
  const { error } = await db()
    .from('network_contacts')
    .update({ match_dismissed: true })
    .eq('id', contactId)
    .eq('owner_id', ownerId)
  return !error
}

/** Unlink a merged contact (undo). Clears the link without re-suggesting. */
export async function unmergeContact(ownerId: string, contactId: string): Promise<boolean> {
  const { error } = await db()
    .from('network_contacts')
    .update({ linked_profile_id: null, match_dismissed: true, updated_at: new Date().toISOString() })
    .eq('id', contactId)
    .eq('owner_id', ownerId)
  return !error
}

/** The PRIVATE contact card the viewer keeps for a given member — shown only on that
 *  member's profile, only to the owner who merged it (their own logged data). Returns
 *  null when the viewer has no contact linked to this profile. Includes the owner's
 *  free-text notes so the original "how we met" detail rides along. */
export interface LinkedContactCard {
  id: string
  displayName: string | null
  email: string | null
  phone: string | null
  title: string | null
  company: string | null
  city: string | null
  website: string | null
  source: string
  createdAt: string | null
  avatarUrl: string | null
  notes: string[]
}

export async function getLinkedContactForProfile(
  ownerId: string,
  profileId: string,
): Promise<LinkedContactCard | null> {
  const { data } = await db()
    .from('network_contacts')
    .select('id, display_name, email, phone, title, company, city, website, source, avatar_path, created_at')
    .eq('owner_id', ownerId)
    .eq('linked_profile_id', profileId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (!data) return null
  const r = data as Record<string, unknown>

  const { data: noteRows } = await db()
    .from('network_contact_notes')
    .select('body')
    .eq('contact_id', String(r.id))
    .order('created_at', { ascending: false })
    .limit(5)

  return {
    id: String(r.id),
    displayName: (r.display_name as string) ?? null,
    email: (r.email as string) ?? null,
    phone: (r.phone as string) ?? null,
    title: (r.title as string) ?? null,
    company: (r.company as string) ?? null,
    city: (r.city as string) ?? null,
    website: (r.website as string) ?? null,
    source: (r.source as string) ?? 'manual',
    createdAt: (r.created_at as string) ?? null,
    avatarUrl: r.avatar_path ? await signedUrl(r.avatar_path as string) : null,
    notes: ((noteRows as { body: string }[] | null) ?? []).map((n) => n.body).filter(Boolean),
  }
}
