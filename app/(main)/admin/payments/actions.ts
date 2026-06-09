'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin/guard'
import { setPlatformFlag } from '@/lib/platform-flags'

// Flip the host-payouts master switch (platform_flags.host_payouts_enabled, ADR-178).
// Janitor-only; audited via setPlatformFlag → platform_flag_events.
export async function setHostPayoutsEnabled(value: boolean) {
  const ctx = await requireAdmin('janitor')
  await setPlatformFlag('host_payouts_enabled', value, { changedBy: ctx.profileId, source: 'admin' })
  revalidatePath('/admin/payments')
}
