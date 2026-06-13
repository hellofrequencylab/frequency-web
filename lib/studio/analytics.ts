// Studio analytics read-models (Phase 6.5). Reuses the North-Star metrics + reads
// email_events / contacts / campaigns. Server-only; untyped client view for the
// not-yet-typed tables.

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'

const DAY = 24 * 60 * 60 * 1000

function db(): SupabaseClient {
  return createAdminClient()
}

export interface EmailStats {
  windowDays: number
  byType: Record<string, number>
  suppressed: number
  deliveryRate: number // delivered / (delivered + bounced), 0..1
}

export async function getEmailStats(windowDays = 30): Promise<EmailStats> {
  const client = db()
  const since = new Date(Date.now() - windowDays * DAY).toISOString()

  const { data } = await client.from('email_events').select('event_type').gte('created_at', since)
  const byType: Record<string, number> = {}
  for (const r of data ?? []) byType[r.event_type] = (byType[r.event_type] ?? 0) + 1

  const { count: suppressed } = await client
    .from('email_suppressions')
    .select('email', { count: 'exact', head: true })

  const delivered = byType.delivered ?? 0
  const bounced = byType.bounced ?? 0
  const deliveryRate = delivered + bounced > 0 ? delivered / (delivered + bounced) : 0

  return { windowDays, byType, suppressed: suppressed ?? 0, deliveryRate }
}

export interface StudioCounts {
  contacts: number
  campaigns: number
}

export async function getStudioCounts(): Promise<StudioCounts> {
  const client = db()
  const { count: contacts } = await client.from('contacts').select('id', { count: 'exact', head: true })
  const { count: campaigns } = await client.from('campaigns').select('id', { count: 'exact', head: true })
  return { contacts: contacts ?? 0, campaigns: campaigns ?? 0 }
}
