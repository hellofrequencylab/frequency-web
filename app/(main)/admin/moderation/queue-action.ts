'use server'

import { getGlobalCapabilities } from '@/lib/core/load-capabilities'
import { getPendingReportsWithPreviews, type ModerationReport } from './queue-data'

// In-place Moderation module loader (ADR-138 — the Safety surface). Returns the
// pending queue only to operators who can reach admin (host+ via the resolver's
// admin.access; the dock's role gate is the coarse filter, this is the fine one);
// null otherwise. The resolve/dismiss actions live in feed/report-actions and
// re-check their own authorization.
export async function loadModerationQueue(): Promise<ModerationReport[] | null> {
  const caps = await getGlobalCapabilities()
  if (!caps.has('admin.access')) return null
  return getPendingReportsWithPreviews()
}
