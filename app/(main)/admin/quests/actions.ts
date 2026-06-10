'use server'

import { revalidatePath } from 'next/cache'
import { getCallerProfile } from '@/lib/auth'
import { atLeastRole } from '@/lib/core/roles'
import { createAdminClient } from '@/lib/supabase/admin'
import type { SupabaseClient } from '@supabase/supabase-js'

// Journey-library admin actions. The chain CRUD that used to live here is
// gone with the retired engine (ADR-152 Phase B3 — the legacy action-chain
// engine is dropped; journey_plans is the single Journey spine).

// Untyped handle for tables that may be ahead of generated types.
function ub(): SupabaseClient {
  return createAdminClient() as unknown as SupabaseClient
}

async function authorizeHost() {
  const caller = await getCallerProfile()
  if (!caller || !atLeastRole(caller.community_role, 'host')) {
    throw new Error('Unauthorized')
  }
  return caller
}

export async function toggleJourneyOfficial(id: string, isOfficial: boolean): Promise<void> {
  await authorizeHost()

  const { error } = await ub()
    .from('journey_plans')
    .update({ official: isOfficial })
    .eq('id', id)

  if (error) throw new Error(error.message)
  revalidatePath('/admin/quests')
}
