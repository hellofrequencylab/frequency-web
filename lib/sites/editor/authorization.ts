import 'server-only'

import { cookies, headers } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveHostedSpace } from '@/lib/sites/hosted'
import { normalizeHost } from '@/lib/sites/host'
import { SITE_ADMIN_COOKIE, readSiteAdminPass, passOpensSite } from '@/lib/sites/site-admin-pass'
import { siteAdminAllowed } from '@/lib/sites/site-admin'

export async function authorizeWebsiteEditor(host: string) {
  const requestHost = normalizeHost((await headers()).get('host'))
  if (requestHost !== normalizeHost(host)) return null
  const token = (await cookies()).get(SITE_ADMIN_COOKIE)?.value
  const pass = readSiteAdminPass(token)
  const space = await resolveHostedSpace(host)
  if (!space || !passOpensSite(pass, host, space.id) || pass.staff) return null
  // Read the current owner and preferences, not the hosted site's cached row.
  const db = createAdminClient()
  const { data, error } = await db.from('spaces').select('preferences, owner_profile_id').eq('id', space.id).maybeSingle()
  if (error || !data || !(await siteAdminAllowed(token, host, { id: space.id, ownerProfileId: data.owner_profile_id }))) return null
  return { space, preferences: data.preferences, profileId: pass.profileId, db }
}
