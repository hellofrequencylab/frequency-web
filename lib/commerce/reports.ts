// Trust & Safety reports for the marketplace (ADR-39Y). One polymorphic table spans
// listings, commerce products, orders, and profiles (target_kind). Members file a
// report from a detail page; moderators triage from /admin/marketplace/reports.
// Server-only (admin client behind app-code authz).

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'

function db(): SupabaseClient {
  return createAdminClient()
}

export type ReportTargetKind = 'listing' | 'product' | 'order' | 'profile'
export type ReportStatus = 'open' | 'reviewing' | 'actioned' | 'dismissed'

export interface MarketplaceReport {
  id: string
  reporterId: string | null
  targetKind: ReportTargetKind
  targetId: string
  reason: string
  detail: string | null
  status: ReportStatus
  createdAt: string
}

const COLS = 'id, reporter_id, target_kind, target_id, reason, detail, status, created_at'

function rowToReport(r: Record<string, unknown>): MarketplaceReport {
  return {
    id: r.id as string,
    reporterId: (r.reporter_id as string) ?? null,
    targetKind: r.target_kind as ReportTargetKind,
    targetId: r.target_id as string,
    reason: r.reason as string,
    detail: (r.detail as string) ?? null,
    status: r.status as ReportStatus,
    createdAt: r.created_at as string,
  }
}

/** File a report. Reporter must be the signed-in member (caller enforces). */
export async function createMarketplaceReport(input: {
  reporterId: string
  targetKind: ReportTargetKind
  targetId: string
  reason: string
  detail?: string | null
}): Promise<boolean> {
  const reason = input.reason.trim().slice(0, 200)
  if (!reason) return false
  const { error } = await db().from('marketplace_reports').insert({
    reporter_id: input.reporterId,
    target_kind: input.targetKind,
    target_id: input.targetId,
    reason,
    detail: input.detail?.trim().slice(0, 2000) || null,
  })
  return !error
}

/** Reports for the moderation queue, newest first. Defaults to the open + reviewing work. */
export async function listMarketplaceReports(
  opts: { status?: ReportStatus | 'queue'; limit?: number } = {},
): Promise<MarketplaceReport[]> {
  let query = db()
    .from('marketplace_reports')
    .select(COLS)
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(opts.limit ?? 100, 1), 300))
  if (opts.status && opts.status !== 'queue') query = query.eq('status', opts.status)
  else if (opts.status === 'queue') query = query.in('status', ['open', 'reviewing'])
  const { data } = await query
  return ((data ?? []) as Record<string, unknown>[]).map(rowToReport)
}

export async function reportStatusCounts(): Promise<Record<string, number>> {
  const { data } = await db().from('marketplace_reports').select('status')
  const counts: Record<string, number> = {}
  for (const r of (data ?? []) as { status: string }[]) counts[r.status] = (counts[r.status] ?? 0) + 1
  return counts
}

export async function setReportStatus(id: string, status: ReportStatus): Promise<void> {
  await db().from('marketplace_reports').update({ status }).eq('id', id)
}
