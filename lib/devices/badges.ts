// BADGE REQUESTS (LIVE-1180, docs/LOYALTY.md "Counter scanners"). A member taps "Get a scannable badge"
// on a Space's page and files one pending badge_requests row; the CyberUnicorn console in the admin menu
// lists the pending rows, and writing that member's card closes the rows it answers. A request filed
// against the Frequency root Space (loadRootSpaceId) asks for a Frequency-wide member card (LIVE-1282).
// The table is
// service-role only (scripts/table-grants.txt `internal`), so this file is its tenancy wall:
//   • the MEMBER side files and reads only the caller's own row (profile id from the session);
//   • the STAFF side (the queue, closing a row) runs behind consoleStaffGate.
// Reads FAIL-SAFE (null / []); writes FAIL-CLOSED. No 'use server' here; the actions are ./badge-actions.ts.

import { createAdminClient } from '@/lib/supabase/admin'
import { loadRootSpaceId } from '@/lib/spaces/store'
import { consoleStaffGate } from './store'

/** Where a member stands on a badge at one Space. */
type BadgeState = 'none' | 'requested' | 'has_card'

/** One pending request, as the console's queue lists it. */
export interface BadgeRequestRow {
  id: string
  spaceId: string
  spaceName: string
  spaceSlug: string
  memberName: string
  memberHandle: string | null
  createdAt: string
  /** Filed against the Frequency root Space: a request for a Frequency-wide member card. */
  frequencyWide: boolean
}

/** The caller's badge state at a Space: a live card that checks in here (this Space's, or a
 *  Frequency-wide member card) wins, then a pending request. */
export async function readBadgeState(spaceId: string, profileId: string): Promise<BadgeState> {
  try {
    const db = createAdminClient()
    const [{ count: cards }, { count: pending }] = await Promise.all([
      db
        .from('member_cards')
        .select('id', { count: 'exact', head: true })
        .eq('profile_id', profileId)
        .or(`space_id.eq.${spaceId},space_id.is.null`)
        .eq('active', true),
      db
        .from('badge_requests')
        .select('id', { count: 'exact', head: true })
        .eq('profile_id', profileId)
        .eq('space_id', spaceId)
        .eq('status', 'pending'),
    ])
    if ((cards ?? 0) > 0) return 'has_card'
    if ((pending ?? 0) > 0) return 'requested'
    return 'none'
  } catch {
    return 'none'
  }
}

/** File the caller's request. A second tap while one is pending is a no-op. */
export async function fileBadgeRequest(spaceId: string, profileId: string): Promise<boolean> {
  try {
    const { error } = await createAdminClient().from('badge_requests').insert({ space_id: spaceId, profile_id: profileId })
    // 23505: one is already pending (the partial unique index). That is the outcome the member wanted.
    return !error || error.code === '23505'
  } catch {
    return false
  }
}

/** The pending queue, oldest first. Staff only. */
export async function listBadgeRequests(limit = 50): Promise<BadgeRequestRow[]> {
  if (!(await consoleStaffGate())) return []
  try {
    const [rootId, { data }] = await Promise.all([
      loadRootSpaceId(),
      createAdminClient()
        .from('badge_requests')
        .select('id, space_id, created_at, spaces(name, brand_name, slug), profiles(display_name, handle)')
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(limit),
    ])
    type Row = {
      id: string
      space_id: string
      created_at: string
      spaces: { name: string | null; brand_name: string | null; slug: string } | null
      profiles: { display_name: string | null; handle: string | null } | null
    }
    return ((data ?? []) as unknown as Row[]).map((r) => ({
      id: r.id,
      spaceId: r.space_id,
      spaceName: r.spaces?.brand_name?.trim() || r.spaces?.name?.trim() || 'Space',
      spaceSlug: r.spaces?.slug ?? '',
      memberName: r.profiles?.display_name?.trim() || 'Member',
      memberHandle: r.profiles?.handle ?? null,
      createdAt: r.created_at,
      frequencyWide: !!rootId && r.space_id === rootId,
    }))
  } catch {
    return []
  }
}

/** The card was written and bound: close the member's pending requests the card answers and point
 *  them at it. A Frequency-wide member card (space_id null) checks in everywhere, so it closes every
 *  request the member has pending, the root Space's included; a Space card closes the one at its Space.
 *  Staff only. No pending row is fine (the card was written without a request). */
export async function closeBadgeRequestForCard(cardId: string): Promise<void> {
  if (!(await consoleStaffGate())) return
  try {
    const db = createAdminClient()
    const { data: card } = await db.from('member_cards').select('profile_id, space_id').eq('id', cardId).maybeSingle()
    if (!card) return
    const q = db
      .from('badge_requests')
      .update({ status: 'done', card_id: cardId, closed_at: new Date().toISOString() })
      .eq('profile_id', card.profile_id)
      .eq('status', 'pending')
    await (card.space_id ? q.eq('space_id', card.space_id) : q)
  } catch {
    /* the card is good either way; the row stays pending and staff can clear it */
  }
}

/** Clear a request without writing a card. Staff only. */
export async function cancelBadgeRequest(requestId: string): Promise<boolean> {
  if (!(await consoleStaffGate())) return false
  try {
    const { error } = await createAdminClient()
      .from('badge_requests')
      .update({ status: 'cancelled', closed_at: new Date().toISOString() })
      .eq('id', requestId)
      .eq('status', 'pending')
    return !error
  } catch {
    return false
  }
}

/** A Space by its slug, for typing one into the console by hand. Staff only. */
export async function findSpaceForConsole(slug: string): Promise<{ id: string; name: string } | null> {
  if (!(await consoleStaffGate())) return null
  try {
    const { data } = await createAdminClient().from('spaces').select('id, name, brand_name').eq('slug', slug).maybeSingle()
    if (!data) return null
    return { id: data.id, name: data.brand_name?.trim() || data.name?.trim() || slug }
  } catch {
    return null
  }
}

/** Every Space's link name and display name, for the console's Space picker. Staff only. */
export async function listSpacesForConsole(limit = 1000): Promise<{ slug: string; name: string }[]> {
  if (!(await consoleStaffGate())) return []
  try {
    const { data } = await createAdminClient().from('spaces').select('slug, name, brand_name').order('name', { ascending: true }).limit(limit)
    return (data ?? []).map((r) => ({ slug: r.slug, name: r.brand_name?.trim() || r.name?.trim() || r.slug }))
  } catch {
    return []
  }
}
