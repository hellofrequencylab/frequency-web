'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin/guard'
import { backfillAcquisition } from '@/lib/attribution/backfill'

// Janitor-only: infer acquisition source for members who predate edge capture
// (ADR-095), from referred_by + meta.beta. Idempotent; re-runnable.
export async function runAcquisitionBackfill() {
  await requireAdmin('janitor')
  await backfillAcquisition()
  revalidatePath('/admin/intel')
}
