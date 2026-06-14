'use server'

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/admin/guard'
import { type ActionResult, ok, fail } from '@/lib/action-result'
import { isSafeRoute, isRail, type Rail } from '@/lib/layout/page-chrome'

// Server actions for the Page layout manager (back-end chrome management). Janitor-only,
// like the Menu manager (the rail is platform chrome): the gate redirects an unauthorized
// viewer, and we capture the id for `updated_by`. Writes go through the service-role admin
// client into public.page_chrome_overrides. Each action revalidates this surface AND the
// whole layout so the override is in place the moment the shell adopts the resolver
// (a flagged follow-up — see lib/layout/page-chrome.ts).

const LIST_PATH = '/admin/page-layout'

async function gate(): Promise<string> {
  const { profileId } = await requireAdmin('janitor')
  return profileId
}

// `page_chrome_overrides` is genuinely untyped until the orchestrator regenerates
// lib/database.types.ts after this lands, so we write it through a narrow untyped client.
// Inputs are validated (isSafeRoute/isRail) before they reach the table.
function db(): SupabaseClient {
  // eslint-disable-next-line no-restricted-syntax -- new table not yet in generated types (ADR-246 exemption)
  return createAdminClient() as unknown as SupabaseClient
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
