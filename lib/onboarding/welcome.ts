import { createAdminClient } from '@/lib/supabase/admin'

// Welcome community post (ONBOARDING beat #6): when a new member finishes the
// induction, the system account greets them in the public feed — turning a sign-up
// into a *greeted* member, and seeding the feed with a warm, recurring moment.
// Best-effort; never blocks onboarding. No-op if there's no system account.
export async function postWelcomeForMember(displayName: string, handle: string): Promise<void> {
  const admin = createAdminClient()

  const { data: system } = await admin
    .from('profiles')
    .select('id')
    .eq('is_system', true)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()
  if (!system) return

  const firstName = displayName.trim().split(/\s+/)[0] || displayName
  await admin.from('posts').insert({
    author_id: system.id,
    scope_id: system.id,
    visibility: 'public',
    post_type: 'feed',
    body: `Everyone, welcome @${handle} to the community 👋 Say hi and help ${firstName} feel at home.`,
  })
}
