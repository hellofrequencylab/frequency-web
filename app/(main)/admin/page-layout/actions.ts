'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/admin/guard'
import { type ActionResult, ok, fail } from '@/lib/action-result'
import { isSafeRoute, isRail, type Rail } from '@/lib/layout/page-chrome'

// Server actions for chrome management — both the back-end Page layout manager and the
// on-page "Page" settings group (docs/EMBEDDED-ADMIN.md inline layer). STAFF (admin+,
// ADR-208), the chrome being platform presentation: the gate redirects an unauthorized
// viewer, and we capture the id for `updated_by`. Writes go through the service-role admin
// client into public.page_chrome_overrides. Each action revalidates the manager surface
// AND the whole layout so a saved override is live on the next request (the shell merges
// it over the code chrome map).

const LIST_PATH = '/admin/page-layout'

async function gate(): Promise<string> {
  // 'admin' = the STAFF axis (web_role admin OR janitor). Surfacing chrome on the page
  // for "admin and above" requires Site Admins to write, not janitors only.
  const { profileId } = await requireAdmin('admin')
  return profileId
}

// Writes go through the service-role admin client. Inputs are validated
// (isSafeRoute/isRail) before they reach the table.
function db() {
  return createAdminClient()
}

/** Pin a route to a rail (Global / Scoped / No rail) — upsert the override. Validates the
 *  route is a safe app path and the rail is one of the allowed modes; rejects otherwise. */
export async function setRouteChrome(route: string, rail: Rail): Promise<ActionResult> {
  const me = await gate()
  if (!isSafeRoute(route)) return fail('That is not a valid app route.')
  if (!isRail(rail)) return fail('Pick a rail: Global, Scoped, or None.')

  const { error } = await db()
    .from('page_chrome_overrides')
    .upsert(
      { route, rail, updated_by: me, updated_at: new Date().toISOString() },
      { onConflict: 'route' },
    )
  if (error) return fail('Could not save the rail for that route.')

  revalidatePath(LIST_PATH)
  revalidatePath('/', 'layout')
  return ok()
}

/** Reset a route to its code default — delete its override row. */
export async function clearRouteChrome(route: string): Promise<ActionResult> {
  await gate()
  if (!isSafeRoute(route)) return fail('That is not a valid app route.')

  const { error } = await db().from('page_chrome_overrides').delete().eq('route', route)
  if (error) return fail('Could not reset that route.')

  revalidatePath(LIST_PATH)
  revalidatePath('/', 'layout')
  return ok()
}
