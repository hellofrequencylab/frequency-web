// Identity done-detection for the first-run checklist (LIVE-349, ADR-1421).
//
// Signup mints a profile via public.handle_new_auth_user
// (supabase/migrations/20261013000000_reconcile_signup_trigger.sql). That trigger sets:
//   display_name = email local-part (or 'New Member' when the local-part is empty)
//   handle       = sanitize(local-part) || 'member'  + '_' + first 6 hex of auth.users.id
//
// An admitted member who never picks a name therefore appears as taylor_42a829. The
// checklist must notice that, and it must NOT hunt a hex suffix: reconstruct the
// trigger's first-try handle from the profile's own display_name + auth_user_id, which
// are the same inputs the trigger used (display_name IS the local-part at mint time).
//
// Established members who already chose a name fail that equality, so they do not grow
// a new step overnight. A collision fallback (random uuid suffix, not the auth id) is
// rare and reads as chosen — fail-open, same as "already named".

/** The trigger's handle alphabet: `lower(regexp_replace(local_part, '[^a-z0-9]', '', 'g'))`. */
export function sanitizeHandleBase(localPart: string): string {
  return localPart.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/** The trigger's FIRST-TRY handle for this auth id + the minted display name. */
export function mintedHandleFor(authUserId: string, displayName: string): string {
  const base =
    displayName === 'New Member' ? 'member' : sanitizeHandleBase(displayName) || 'member'
  const suffix = authUserId.replace(/-/g, '').slice(0, 6)
  return `${base}_${suffix}`
}

export type IdentityProfile = {
  displayName: string | null | undefined
  handle: string | null | undefined
  authUserId: string | null | undefined
}

/**
 * True when this profile is no longer the trigger's minted identity. Empty name or
 * handle is not chosen. A missing auth id cannot be matched to the mint formula, so
 * it reads as chosen (system rows, not the seven admitted members).
 */
export function identityIsChosen(profile: IdentityProfile): boolean {
  const name = (profile.displayName ?? '').trim()
  const handle = (profile.handle ?? '').trim()
  if (!name || !handle) return false
  const authUserId = (profile.authUserId ?? '').trim()
  if (!authUserId) return true
  return handle !== mintedHandleFor(authUserId, name)
}
