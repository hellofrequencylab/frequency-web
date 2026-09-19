'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin/guard'
import { setPlatformFlag } from '@/lib/platform-flags'
import { parseInput, z } from '@/lib/validation'

// Flip the platform SMS switch (platform_flags.sms_enabled, ADR-256). Janitor or
// `platform`-domain staff (same gate as /admin/sms and the AI master switch); each
// flip is recorded in platform_flag_events (who/when/old→new). Reversible. This is
// the app-configurable half of the SMS gate — the A2P 10DLC env provisioning is the
// hard legal lock that still overrides it, so turning this ON never sends anything
// until the legal track is live too.
export async function setSmsEnabled(enabled: boolean): Promise<void> {
  const { profileId } = await requireAdmin('janitor', { staff: 'platform' })
  const { enabled: on } = parseInput(z.object({ enabled: z.boolean() }), { enabled })
  await setPlatformFlag('sms_enabled', on, { changedBy: profileId, source: 'admin' })
  revalidatePath('/admin/sms')
}
