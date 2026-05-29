'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { type ActionResult, ok, fail } from '@/lib/action-result'

export type SubscriptionPayload = {
  endpoint:   string
  p256dh:     string
  auth:       string
  userAgent?: string
}

// Saves (or refreshes) the caller's push subscription. UPSERT on
// (profile_id, endpoint) so re-running is safe.
export async function saveSubscription(
  sub: SubscriptionPayload,
): Promise<ActionResult> {
  if (!sub.endpoint || !sub.p256dh || !sub.auth) {
    return fail('Incomplete subscription')
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return fail('Not signed in')

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (!profile) return fail('No profile')

  const { error } = await admin
    .from('push_subscriptions')
    .upsert(
      {
        profile_id:   profile.id,
        endpoint:     sub.endpoint,
        p256dh:       sub.p256dh,
        auth:         sub.auth,
        user_agent:   sub.userAgent ?? null,
        last_used_at: new Date().toISOString(),
      },
      { onConflict: 'profile_id,endpoint' },
    )

  if (error) {
    console.error('[saveSubscription]', error.message)
    return fail(error.message)
  }

  return ok()
}
