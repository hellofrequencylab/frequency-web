'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { NotificationPreferences } from '@/lib/notification-preferences'

// Saves the notification preferences form. Upserts (lazy-create on first
// save). Push columns are accepted but currently locked-off in the UI;
// the server treats incoming push_* values as the source of truth so a
// future P1.4 release can flip them live without another migration.
export async function saveNotificationPreferences(
  prefs: NotificationPreferences,
): Promise<{ ok: true } | { ok: false; error: string }> {
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
    .from('notification_preferences')
    .upsert(
      { profile_id: profile.id, ...prefs },
      { onConflict: 'profile_id' },
    )

  if (error) return { ok: false, error: error.message }

  revalidatePath('/settings/notifications')
  return { ok: true }
}
