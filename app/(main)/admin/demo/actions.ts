'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCallerProfile } from '@/lib/auth'
import { atLeastRole } from '@/lib/core/roles'

// Demo content lives on five tables (see docs/DEMO-SYSTEM.md). Purge deletes
// children before parents so FK constraints are satisfied regardless of cascade
// behaviour; dependent rows (reactions, memberships, RSVPs) cascade from these.
const DEMO_TABLES = ['posts', 'events', 'practices', 'circles', 'profiles'] as const

// Flip the global demo switch. Reversible — hides/shows all is_demo content at
// once via the gating in lib/platform-flags.ts + the feed RPCs.
export async function setDemoMode(enabled: boolean) {
  const caller = await getCallerProfile()
  if (!caller || !atLeastRole(caller.community_role, 'janitor')) throw new Error('Unauthorized')

  const admin = createAdminClient()
  const { error } = await admin
    .from('platform_flags')
    .upsert({ key: 'demo_mode', value: enabled, updated_at: new Date().toISOString() })
  if (error) throw new Error(error.message)

  revalidatePath('/', 'layout') // demo gating touches many surfaces
}

// Permanently delete ALL seeded demo content. Irreversible — use when real
// content is ready. Janitor-only.
export async function purgeDemoContent() {
  const caller = await getCallerProfile()
  if (!caller || !atLeastRole(caller.community_role, 'janitor')) throw new Error('Unauthorized')

  const admin = createAdminClient()
  for (const table of DEMO_TABLES) {
    const { error } = await admin.from(table).delete().eq('is_demo', true)
    if (error) throw new Error(`${table}: ${error.message}`)
  }

  revalidatePath('/', 'layout')
}
