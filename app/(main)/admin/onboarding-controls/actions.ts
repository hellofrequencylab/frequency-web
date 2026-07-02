'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin/guard'
import { setPlatformFlag, setPlatformSetting } from '@/lib/platform-flags'
import { createAdminClient } from '@/lib/supabase/admin'
import { SITE_URL } from '@/lib/site'

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

// Set where every personal QR code lands a scanner. Stores a SAME-SITE PATH (no open
// redirect) and retargets all existing connect codes to it — the printed image is
// unchanged (it encodes /q/<slug>); only where /q redirects changes. New codes mint
// at this value (lib/qr/member-codes reads the same setting).
export async function setReferralLanding(formData: FormData): Promise<void> {
  const { profileId } = await requireAdmin('janitor')

  // Resolve the operator input against our own origin and KEEP ONLY the same-origin
  // path. Anything that resolves off-site (//evil.com, https://evil.com, a scheme)
  // lands on a different origin and is rejected to '/', so the stored target can
  // never become an open redirect (the /q resolver later redirects to it).
  const raw = String(formData.get('path') ?? '').trim()
  const ownOrigin = new URL(SITE_URL).origin
  let path = '/'
  try {
    const u = new URL(raw || '/', SITE_URL)
    if (u.origin === ownOrigin) path = `${u.pathname}${u.search}`
  } catch {
    /* unparseable input → default '/' */
  }

  await setPlatformSetting('personal_code_landing', path, profileId)
  const admin = createAdminClient()
  const { error } = await admin
    .from('qr_codes')
    .update({ target_url: `${ownOrigin}${path}` })
    .eq('purpose', 'connect')
    .eq('destination_type', 'url')
  // Surface a failed bulk retarget — otherwise existing codes silently keep pointing
  // at the old destination while the stored setting says the new one (retry is idempotent).
  if (error) throw new Error(error.message)
  revalidatePath('/admin/onboarding-controls')
}
