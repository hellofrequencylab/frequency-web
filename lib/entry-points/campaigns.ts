// Campaign reads (ADR-126, Phase 2). A campaign (entry_campaigns) is a themed group
// of entry points sharing a goal/branding; the admin builder (/marketing/funnels)
// manages them. entry_campaigns + qr_codes.campaign_id aren't in the generated DB
// types until regen, so we read through an untyped handle (repo convention). The
// mutations live in the funnels actions (admin-gated). Server-only.

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'

export type CampaignStatus = 'draft' | 'active' | 'archived'

export interface Campaign {
  id: string
  name: string
  goal: string | null
  status: CampaignStatus
  /** How many entry points belong to it. */
  entryCount: number
  /** Total scans across its entry points. */
  scans: number
  createdAt: string
}

interface CampaignRow {
  id: string
  name: string
  goal: string | null
  status: CampaignStatus
  created_at: string
}

function db(): SupabaseClient {
  return createAdminClient() as unknown as SupabaseClient
}

/** Aggregate entry-point counts + scans for the given campaign ids. */
async function statsFor(ids: string[]): Promise<Map<string, { entryCount: number; scans: number }>> {
  const out = new Map<string, { entryCount: number; scans: number }>()
  if (!ids.length) return out
  const { data } = await db()
    .from('qr_codes')
    .select('campaign_id, scan_count')
    .in('campaign_id', ids)
    .not('template_id', 'is', null)
  for (const e of (data as { campaign_id: string | null; scan_count: number | null }[] | null) ?? []) {
    if (!e.campaign_id) continue
    const c = out.get(e.campaign_id) ?? { entryCount: 0, scans: 0 }
    c.entryCount += 1
    c.scans += e.scan_count ?? 0
    out.set(e.campaign_id, c)
  }
  return out
}

function toCampaign(r: CampaignRow, stats: { entryCount: number; scans: number } | undefined): Campaign {
  return {
    id: r.id,
    name: r.name,
    goal: r.goal,
    status: r.status,
    entryCount: stats?.entryCount ?? 0,
    scans: stats?.scans ?? 0,
    createdAt: r.created_at,
  }
}

/** All campaigns, newest first, with entry-point counts + scans. */
export async function listCampaigns(): Promise<Campaign[]> {
  const { data } = await db()
    .from('entry_campaigns')
    .select('id, name, goal, status, created_at')
    .order('created_at', { ascending: false })
  const rows = (data as CampaignRow[] | null) ?? []
  const stats = await statsFor(rows.map((r) => r.id))
  return rows.map((r) => toCampaign(r, stats.get(r.id)))
}

/** One campaign by id (with its stats), or null. */
export async function getCampaign(id: string): Promise<Campaign | null> {
  const { data } = await db()
    .from('entry_campaigns')
    .select('id, name, goal, status, created_at')
    .eq('id', id)
    .maybeSingle()
  const r = data as CampaignRow | null
  if (!r) return null
  const stats = await statsFor([id])
  return toCampaign(r, stats.get(id))
}

/** Does this campaign exist? (Used when attaching an entry point to it.) */
export async function campaignExists(id: string): Promise<boolean> {
  const { data } = await db().from('entry_campaigns').select('id').eq('id', id).maybeSingle()
  return !!data
}
