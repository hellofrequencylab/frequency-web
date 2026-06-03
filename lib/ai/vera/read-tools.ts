// Vera's READ tools wired to real data (AI-VERA §6). These are safe (no mutation) —
// they suggest circles and name hosts so Vera can route the member to a real thing /
// real person. Returned as short strings the model folds into its reply. Server-only.

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'

function db(): SupabaseClient {
  return createAdminClient() as unknown as SupabaseClient
}

/** Suggest a couple of real circles, optionally matched to an interest. */
async function suggestCircle(interest?: unknown): Promise<string> {
  let q = db()
    .from('circles')
    .select('name, neighborhood, member_count, about')
    .eq('is_demo', false)
    .order('member_count', { ascending: false })
    .limit(3)
  const term = typeof interest === 'string' ? interest.trim() : ''
  if (term) q = q.ilike('name', `%${term}%`)

  const { data } = await q
  const rows = (data ?? []) as Array<{ name: string; neighborhood: string | null }>
  if (rows.length === 0) return 'No matching circles are live yet — point them at /circles to browse.'
  return rows.map((c) => (c.neighborhood ? `${c.name} (${c.neighborhood})` : c.name)).join('; ')
}

/** Name a host who runs a relevant circle, so Vera can offer a warm intro. */
async function findHost(topic?: unknown): Promise<string> {
  const term = typeof topic === 'string' ? topic.trim() : ''
  let q = db()
    .from('circles')
    .select('name, host_id, profiles:host_id (display_name)')
    .eq('is_demo', false)
    .not('host_id', 'is', null)
    .limit(1)
  if (term) q = q.ilike('name', `%${term}%`)

  const { data } = await q
  const rows = (data ?? []) as Array<{ name: string; profiles: { display_name: string } | { display_name: string }[] | null }>
  const row = rows[0]
  const host = Array.isArray(row?.profiles) ? row.profiles[0] : row?.profiles
  if (!host?.display_name) return 'No host found for that yet — a janitor can connect them.'
  return `${host.display_name} runs ${row.name}.`
}

/** Dispatch a validated read tool to its executor. */
export async function executeReadTool(tool: string, args: Record<string, unknown>): Promise<string> {
  switch (tool) {
    case 'suggest_circle':
      return suggestCircle(args.interest)
    case 'find_host':
      return findHost(args.topic)
    default:
      return 'No result.'
  }
}
