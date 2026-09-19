'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin/guard'
import { setPlatformFlag } from '@/lib/platform-flags'
import { parseInput, z } from '@/lib/validation'

// Flip the host-payouts master switch (platform_flags.host_payouts_enabled, ADR-178).
// Janitor-only; audited via setPlatformFlag → platform_flag_events.
export async function setHostPayoutsEnabled(value: boolean) {
  const ctx = await requireAdmin('janitor')
  const { value: on } = parseInput(z.object({ value: z.boolean() }), { value })
  await setPlatformFlag('host_payouts_enabled', on, { changedBy: ctx.profileId, source: 'admin' })
  revalidatePath('/admin/payments')
}
