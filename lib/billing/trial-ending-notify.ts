// Send the trial-ending notice for a Space plan subscription (LIVE-1132). Called from the Stripe webhook on
// customer.subscription.trial_will_end. Best-effort and idempotent: the outbox dedupes on the subscription id,
// so a Stripe redelivery sends one email. A subscription that is not a Space plan is ignored (members and
// bundles have their own paths).
import type Stripe from 'stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import { enqueueEmail } from '@/lib/email'
import { buildTrialEndingEmail } from '@/lib/billing/trial-ending-email'
import { asSpacePlan, SPACE_PLAN_LABEL } from '@/lib/pricing/plans'

function trialEndLabel(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

export async function notifyTrialEnding(sub: Stripe.Subscription): Promise<boolean> {
  const spaceId = sub.metadata?.space_id
  if (!spaceId || !sub.trial_end) return false
  try {
    const admin = createAdminClient()
    const { data: spaceData } = await admin
      .from('spaces')
      .select('id, name, slug, owner_profile_id')
      .eq('id', spaceId)
      .maybeSingle()
    const space = spaceData as { name: string | null; slug: string | null; owner_profile_id: string | null } | null
    if (!space?.owner_profile_id) return false
    const { data: profileData } = await admin
      .from('profiles')
      .select('display_name, auth_user_id')
      .eq('id', space.owner_profile_id)
      .maybeSingle()
    const profile = profileData as { display_name: string | null; auth_user_id: string | null } | null
    if (!profile?.auth_user_id) return false
    const { data: { user } } = await admin.auth.admin.getUserById(profile.auth_user_id)
    if (!user?.email) return false
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://frequencylocal.com'
    await enqueueEmail(
      buildTrialEndingEmail({
        to: user.email,
        planLabel: SPACE_PLAN_LABEL[asSpacePlan(sub.metadata?.plan)],
        spaceName: space.name ?? 'your space',
        trialEndLabel: trialEndLabel(sub.trial_end),
        greetingName: profile.display_name,
        billingUrl: space.slug ? `${appUrl}/spaces/${space.slug}/settings/billing` : appUrl,
      }),
      { dedupeKey: `trial_will_end:${sub.id}` },
    )
    return true
  } catch (e) {
    console.error('[trial-ending]', spaceId, e)
    return false
  }
}
