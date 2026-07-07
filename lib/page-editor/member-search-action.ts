'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'

// Server actions behind the Team block's NETWORK MEMBER PICKER
// (components/page-editor/blocks/member-picker-field.tsx). A 'use server' module exports ONLY async
// functions, so the pure field component + its Puck config import THESE, never a server-only module
// (the build trap: the editor bundle stays client-safe and the public profile ships no editor
// runtime). This mirrors the Loom image field's action/context split
// (lib/page-editor/loom-field-actions.ts).
//
// GATE: the picker is used by a SPACE OPERATOR editing their OWN profile, who is usually NOT platform
// staff. Every action RE-RESOLVES the space from its untrusted `slug` and RE-GATES caps.canEditProfile
// (owner / admin / editor), the SAME authority the Loom actions and the publish action use. A member
// search only exposes the PUBLIC directory shape (id / handle / display name / avatar) that the Network
// directory already shows every signed-in member, so a valid space editor may search it.

/** One pickable member: the shape a team card renders + links to (`/people/<handle>`). */
export type MemberPick = {
  id: string
  handle: string
  displayName: string
  avatarUrl: string | null
}

/** Resolve + AUTHORIZE the caller as an editor (owner / admin / editor) of `slug`'s space. Returns
 *  true when the caller may edit that space. Untrusted slug: the gate is the authority. */
async function isSpaceEditor(slug: string | null | undefined): Promise<boolean> {
  const s = (slug ?? '').trim()
  if (!s) return false
  try {
    const caller = await getCallerProfile()
    const viewerProfileId = caller?.id ?? null
    const space = await getVisibleSpaceBySlug(s, viewerProfileId)
    if (!space) return false
    const caps = await getSpaceCapabilities(space, viewerProfileId)
    return caps.canEditProfile // owner / admin / editor (the write authority)
  } catch {
    return false
  }
}

const SEARCH_LIMIT = 12

function toMember(row: Record<string, unknown>): MemberPick | null {
  const handle = row.handle
  if (typeof handle !== 'string' || handle.length === 0) return null
  return {
    id: String(row.id),
    handle,
    displayName: (row.display_name as string) || handle,
    avatarUrl: (row.avatar_url as string) ?? null,
  }
}

/** Search the member directory for `query` (by display name or handle). Mirrors the Network directory
 *  scope: active members with a handle. Gated on per-space edit permission; FAIL-SAFE to []
 *  (an unauthorized caller, an unknown slug, a too-short query, or any error). */
export async function searchNetworkMembers(slug: string, query?: string): Promise<MemberPick[]> {
  if (!(await isSpaceEditor(slug))) return []
  const needle = (query ?? '').replace(/[(),%]/g, ' ').trim()
  if (needle.length < 2) return []

  const admin = createAdminClient()
  const { data } = await admin
    .from('profiles')
    .select('id, handle, display_name, avatar_url')
    .eq('is_active', true)
    .not('handle', 'is', null)
    .or(`display_name.ilike.%${needle}%,handle.ilike.%${needle}%`)
    .order('display_name', { ascending: true })
    .limit(SEARCH_LIMIT)

  return ((data ?? []) as Record<string, unknown>[])
    .map(toMember)
    .filter((m): m is MemberPick => Boolean(m))
}

/** Resolve chosen member ids back to their current directory cards (name / handle / avatar), so the
 *  Team block renders the LIVE profile even if the operator picked them long ago. Order follows the
 *  input `ids`. Same public directory scope + gate as the search. FAIL-SAFE to []. */
export async function resolveNetworkMembers(slug: string, ids: string[]): Promise<MemberPick[]> {
  if (!(await isSpaceEditor(slug))) return []
  const clean = Array.from(new Set((ids ?? []).map((id) => String(id).trim()).filter(Boolean)))
  if (clean.length === 0) return []

  const admin = createAdminClient()
  const { data } = await admin
    .from('profiles')
    .select('id, handle, display_name, avatar_url')
    .in('id', clean)
    .eq('is_active', true)
    .not('handle', 'is', null)

  const byId = new Map<string, MemberPick>()
  for (const row of ((data ?? []) as Record<string, unknown>[])) {
    const member = toMember(row)
    if (member) byId.set(member.id, member)
  }
  // Preserve the operator's chosen order.
  return clean.map((id) => byId.get(id)).filter((m): m is MemberPick => Boolean(m))
}
