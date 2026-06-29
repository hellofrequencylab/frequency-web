'use server'

import { getMyProfileId } from '@/lib/auth'
import { createMarketplaceReport, type ReportTargetKind } from '@/lib/commerce/reports'

// Trust & Safety: a member flags a listing / product / profile. Files into
// marketplace_reports for the operator queue (/admin/marketplace/reports).

export async function reportTargetAction(
  targetKind: ReportTargetKind,
  targetId: string,
  reason: string,
  detail?: string,
): Promise<{ ok?: true; error?: string }> {
  const reporterId = await getMyProfileId()
  if (!reporterId) return { error: 'Sign in to report.' }
  if (!reason?.trim()) return { error: 'Pick a reason.' }
  const ok = await createMarketplaceReport({ reporterId, targetKind, targetId, reason, detail })
  return ok ? { ok: true } : { error: 'Could not file the report. Try again.' }
}
