'use server'

import type { SupabaseClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { getCallerProfile } from '@/lib/auth'
import { atLeastRole } from '@/lib/core/roles'
import { createAdminClient } from '@/lib/supabase/admin'
import { type ActionResult, ok, fail } from '@/lib/action-result'

// Who may edit page content (ADR-180) — role-specific: admin+ (operators who tune
// public-facing chrome). Reads return null for anyone below, so the editor renders
// nothing for them; writes re-check, so the server action is the authority.
const MIN_ROLE = 'admin' as const

/** Current editable content for a route, or null if the caller can't edit. */
export async function getEditablePageContent(
  route: string,
): Promise<{ title: string; description: string } | null> {
  const me = await getCallerProfile()
  if (!me || !atLeastRole(me.community_role, MIN_ROLE)) return null
  const db = createAdminClient() as unknown as SupabaseClient
  const { data } = await db
    .from('page_content')
    .select('title, description')
    .eq('route', route)
    .maybeSingle()
  const row = data as { title: string | null; description: string | null } | null
  return { title: row?.title ?? '', description: row?.description ?? '' }
}

/** Upsert a route's editable title + description (blank clears the override). */
export async function savePageContent(route: string, fd: FormData): Promise<ActionResult> {
  const me = await getCallerProfile()
  if (!me || !atLeastRole(me.community_role, MIN_ROLE)) return fail('Not allowed.')
  const title = ((fd.get('title') as string) ?? '').trim() || null
  const description = ((fd.get('description') as string) ?? '').trim() || null
  const db = createAdminClient() as unknown as SupabaseClient
  const { error } = await db
    .from('page_content')
    .upsert({ route, title, description, updated_by: me.id, updated_at: new Date().toISOString() })
  if (error) return fail(error.message)
  revalidatePath(route)
  return ok()
}
