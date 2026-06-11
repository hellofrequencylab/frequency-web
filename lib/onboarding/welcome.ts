import { createAdminClient } from '@/lib/supabase/admin'

// Newcomer welcome (ONBOARDING beat #6): when a new member finishes induction, Vera
// (the system account, formerly @moderation) welcomes them with a SINGLE LINE — a
// notification, not a full public feed post. Best-effort; never blocks onboarding.
// No-op when there's no system account.
export async function postWelcomeForMember(memberId: string, displayName: string): Promise<void> {
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
  await admin.from('notifications').insert({
    recipient_id: memberId,
    actor_id: system.id,
    type: 'welcome',
    reference_type: 'profile',
    reference_id: system.id,
    body: `Welcome to Frequency, ${firstName} 👋 So glad you're here.`,
  })
}
