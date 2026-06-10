'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getCallerProfile } from '@/lib/auth'
import { isJanitor } from '@/lib/core/roles'

// In-place "Person settings" admin module read (EMBEDDED-ADMIN.md / ADR-133,
// PX.5). Editing SOMEONE ELSE'S profile is a moderation power: capabilities.ts
// grants profile.edit on another's profile to janitor only, and the write this
// module submits to — updateMemberProfile in app/(main)/admin/actions.ts — gates
// on janitor too. This read mirrors that same gate so the module renders no
// chrome for anyone else (members edit their OWN profile via /settings).

/** Load the moderation-editable fields of a member's profile by handle, but only
 *  for a janitor. Returns null otherwise. */
export async function getPersonAdminData(handle: string) {
  const caller = await getCallerProfile()
  // STAFF axis (web_role janitor, ADR-208) — mirrors updateMemberProfile's gate so
  // the module renders no chrome for anyone the write would reject.
  if (!caller || !isJanitor(caller.webRole)) return null

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('id, display_name, handle, bio, is_active')
    .eq('handle', handle)
    .maybeSingle()
  return profile ?? null
}
