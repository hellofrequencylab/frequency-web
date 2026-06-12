'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin/guard'
import { setPlatformFlag } from '@/lib/platform-flags'

// Operator switches for the onboarding + referral surfaces, each backed by a
// platform_flags row and audited in platform_flag_events (who/when/old→new). Same
// janitor gate as the page; all reversible. Each toggle revalidates the layout because
// these flags gate widely-shared surfaces (feed hero, rail panel, app-wide popups, the
// /q referral cookie).

export async function setNextStepsEnabled(enabled: boolean): Promise<void> {
  const { profileId } = await requireAdmin('janitor')
  await setPlatformFlag('next_steps_enabled', enabled, { changedBy: profileId, source: 'admin' })
  revalidatePath('/', 'layout')
  revalidatePath('/admin/onboarding-controls')
}

export async function setAutoPopupsEnabled(enabled: boolean): Promise<void> {
  const { profileId } = await requireAdmin('janitor')
  await setPlatformFlag('auto_popups_enabled', enabled, { changedBy: profileId, source: 'admin' })
  revalidatePath('/', 'layout')
  revalidatePath('/admin/onboarding-controls')
}

export async function setReferralsEnabled(enabled: boolean): Promise<void> {
  const { profileId } = await requireAdmin('janitor')
  await setPlatformFlag('referrals_enabled', enabled, { changedBy: profileId, source: 'admin' })
  revalidatePath('/', 'layout')
  revalidatePath('/admin/onboarding-controls')
}
