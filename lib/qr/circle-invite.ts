import type { SupabaseClient } from '@supabase/supabase-js'
import { asWebRole, isStaff } from '@/lib/core/roles'
import { atLeastSpaceRole, isSpaceRole } from '@/lib/spaces/membership-core'

/**
 * WHO MAY TURN A QR CODE INTO A CIRCLE INVITE (SCAN-774).
 *
 * Scanning a circle-destination code used to be treated as holding an invite, on the assumption
 * that only the Host or an operator could have minted one. The qr_codes insert policy never said
 * so: it checks that owner_profile_id and created_by are the caller and nothing else, so any
 * member could insert a `destination_type = 'circle'` row pointing at any circle and scan their
 * own way into a paid or invite-only room. Migration 20270345011800 now keeps circle_id out of a
 * member's reach at the database, and this helper is the app-layer check the /q resolver runs
 * before it passes `invited: true`: the code's MINTER must be someone who could have invited the
 * scanner by hand.
 *
 *   Host            the circle's host_id is the minter
 *   Space steward   the minter owns the circle's Space or holds an ACTIVE editor+ seat on it
 *                   (the same bar as lib/circles/store.ts's isSpaceSteward and
 *                   private.can_write_space_content)
 *   Platform staff  the minter's web_role is admin or janitor
 *   Operator code   NO minter at all (created_by and owner_profile_id both NULL). Only the
 *                   service role can write such a row, so it is an operator's by construction.
 *
 * FAIL-CLOSED: any read error reads as "not trusted", so the scan still lands on the circle page
 * (where the public face and its own join / buy call to action live) and simply does not join.
 */
export type QrCodeMinter = {
  created_by: string | null
  owner_profile_id: string | null
}

export type QrCircleTarget = {
  host_id: string | null
  space_id: string | null
}

export async function qrCodeMinterMayInvite(
  admin: SupabaseClient,
  code: QrCodeMinter,
  circle: QrCircleTarget,
): Promise<boolean> {
  const minter = code.created_by ?? code.owner_profile_id
  if (!minter) return true // an operator code: nobody but the service role can mint one

  if (circle.host_id && circle.host_id === minter) return true

  try {
    const [stewards, profile] = await Promise.all([
      circle.space_id ? isSpaceSteward(admin, circle.space_id, minter) : Promise.resolve(false),
      admin.from('profiles').select('web_role').eq('id', minter).maybeSingle(),
    ])
    if (stewards) return true
    const webRole = (profile.data as { web_role?: string | null } | null)?.web_role ?? null
    return isStaff(asWebRole(webRole))
  } catch {
    return false
  }
}

/** Does this profile steward the Space: own it, or hold an ACTIVE editor+ seat on its team? */
export async function isSpaceSteward(
  admin: SupabaseClient,
  spaceId: string,
  profileId: string,
): Promise<boolean> {
  const [owned, seat] = await Promise.all([
    admin.from('spaces').select('id').eq('id', spaceId).eq('owner_profile_id', profileId).maybeSingle(),
    admin
      .from('space_members')
      .select('role')
      .eq('space_id', spaceId)
      .eq('profile_id', profileId)
      .eq('status', 'active')
      .maybeSingle(),
  ])
  if (owned.data) return true
  const role = (seat.data as { role?: string } | null)?.role ?? null
  return role !== null && isSpaceRole(role) && atLeastSpaceRole(role, 'editor')
}
