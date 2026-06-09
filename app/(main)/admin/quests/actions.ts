'use server'

import { revalidatePath } from 'next/cache'
import { getCallerProfile } from '@/lib/auth'
import { atLeastRole } from '@/lib/core/roles'
import { createAdminClient } from '@/lib/supabase/admin'
import type { SupabaseClient } from '@supabase/supabase-js'

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

// ── Quest Chain mutations ──────────────────────────────────────────────────────

export async function createQuestChain(fd: FormData): Promise<void> {
  await authorizeHost()

  const str = (k: string) => String(fd.get(k) ?? '').trim()
  const num = (k: string, fallback = 0) => {
    const v = Number(fd.get(k))
    return isNaN(v) ? fallback : v
  }

  const name = str('name')
  if (!name) throw new Error('Name is required')

  const slug =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) +
    '-' +
    Math.random().toString(36).slice(2, 7)

  const { error } = await ub()
    .from('quest_chains')
    .insert({
      slug,
      name,
      description: str('description') || 'No description.',
      icon: str('icon') || 'map',
      season: str('season') !== '' ? num('season') : null,
      zaps_reward: num('zaps_reward', 100),
      sort_order: num('sort_order', 0),
    })

  if (error) throw new Error(error.message)
  revalidatePath('/admin/quests')
}

export async function updateQuestChain(id: string, fd: FormData): Promise<void> {
  await authorizeHost()

  const str = (k: string) => String(fd.get(k) ?? '').trim()
  const num = (k: string, fallback = 0) => {
    const v = Number(fd.get(k))
    return isNaN(v) ? fallback : v
  }

  const name = str('name')
  if (!name) throw new Error('Name is required')

  const { error } = await ub()
    .from('quest_chains')
    .update({
      name,
      description: str('description') || 'No description.',
      icon: str('icon') || 'map',
      season: str('season') !== '' ? num('season') : null,
      zaps_reward: num('zaps_reward', 100),
      sort_order: num('sort_order', 0),
    })
    .eq('id', id)

  if (error) throw new Error(error.message)
  revalidatePath('/admin/quests')
}

export async function deleteQuestChain(id: string): Promise<void> {
  await authorizeHost()

  const { error } = await ub().from('quest_chains').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/quests')
}

// ── Journey Library mutations ─────────────────────────────────────────────────

export async function toggleJourneyOfficial(id: string, isOfficial: boolean): Promise<void> {
  await authorizeHost()

  const { error } = await ub()
    .from('journey_plans')
    .update({ official: isOfficial })
    .eq('id', id)

  if (error) throw new Error(error.message)
  revalidatePath('/admin/quests')
}
