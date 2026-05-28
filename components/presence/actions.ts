'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Update last_seen_at for the current user. Called from the client heartbeat
// every ~90s while the tab is visible. Silently no-ops when signed out so
// the client doesn't need to know about auth state.
export async function pingPresence(): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const admin = createAdminClient()
  await admin
    .from('profiles')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('auth_user_id', user.id)
}
