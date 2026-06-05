'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin/guard'
import { setPlatformFlag } from '@/lib/platform-flags'

// The AI master switch — gates every AI surface (Vera, winback, help search, the
// Profile Creator harvest). Janitor-only; each flip is recorded in
// platform_flag_events (who/when/old→new). Reversible.
export async function setAiEnabled(enabled: boolean): Promise<void> {
  const { profileId } = await requireAdmin('janitor')
  await setPlatformFlag('ai_enabled', enabled, { changedBy: profileId, source: 'admin' })
  revalidatePath('/', 'layout') // AI gating touches many surfaces
  revalidatePath('/admin/ai')
}
