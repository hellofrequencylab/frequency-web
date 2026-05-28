'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

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
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!sub.endpoint || !sub.p256dh || !sub.auth) {
    return { ok: false, error: 'Incomplete subscription' }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in' }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (!profile) return { ok: false, error: 'No profile' }

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
    return { ok: false, error: error.message }
  }

  return { ok: true }
}
