import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * IS THIS PROFILE PART OF THE SPACE'S AUDIENCE? The app-layer twin of
 * `private.is_space_audience` (ADR-1021), arm for arm and in the same order.
 *
 * ── WHY THIS IS NOT `space_members` ALONE ────────────────────────────────────────────────────
 *
 * `space_members` is the STAFF ladder (viewer < editor < moderator < admin) — the people who
 * operate the Space. Measured on production 2026-08-12 it held 26 rows, every one `admin`, while
 * the people actually PAYING live in `space_memberships` (2 rows). So the `space_members` Circle
 * access mode, whose own label promises "Anyone with an active membership in your Space can join
 * themselves", was admitting the operator's staff and shutting out their members.
 *
 * ── 🔴 WHY THIS IS A SEPARATE PREDICATE AND NOT A WIDER `is_space_member` ────────────────────
 *
 * Because `is_space_member` is not a Circle predicate. SIXTEEN RLS policies use it to gate the
 * CRM pipeline, client notes, orders, disputes and lead capture. Teaching it about paid
 * memberships would hand every paying member of a Space read access to all of that. "Who may
 * enter a Circle" and "who may read the CRM" are only the same question by accident of
 * implementation, and this seam is what keeps them apart.
 *
 * Returns a truthy marker rather than a role, because the caller only asks a yes/no question —
 * matching the shape the previous `space_members` lookup returned.
 */
export async function isSpaceAudience(
  admin: SupabaseClient,
  spaceId: string,
  profileId: string,
): Promise<{ source: 'staff' | 'membership' } | null> {
  // ARM 1 — the staff ladder. Kept first and unchanged so the widening is provably ADDITIVE:
  // anyone who could enter before this existed still enters through exactly this arm.
  const { data: staff } = await admin
    .from('space_members')
    .select('role')
    .eq('space_id', spaceId)
    .eq('profile_id', profileId)
    .eq('status', 'active')
    .maybeSingle()
  if (staff) return { source: 'staff' }

  // ARM 2 — the audience the label has always promised. `space_memberships` keys the member on
  // `member_profile_id`, NOT `profile_id`; the database refused the first version of the
  // migration for exactly that reason, which is the kind of thing only the real schema tells you.
  const { data: paid } = await admin
    .from('space_memberships')
    .select('id')
    .eq('space_id', spaceId)
    .eq('member_profile_id', profileId)
    .eq('status', 'active')
    .maybeSingle()
  return paid ? { source: 'membership' } : null
}
