import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'

// Welcome line (ONBOARDING beat #6, reshaped by ADR-231): when a new member
// finishes the induction, Vera (the system voice) drops ONE quiet line into the
// public feed — post_type 'system', rendered like a group-chat join notice
// (components/feed/post-card.tsx SystemLine), not a full post card.
// Best-effort; never blocks onboarding. No-op if there's no system account.
export async function postWelcomeForMember(_displayName: string, handle: string): Promise<void> {
  // post_type 'system' (20260616100000) isn't in the generated types yet — untyped handle.
  const admin = createAdminClient() as unknown as SupabaseClient

  const { data: system } = await admin
    .from('profiles')
    .select('id')
    .eq('is_system', true)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()
  if (!system) return

  await admin.from('posts').insert({
    author_id: system.id,
    scope_id: system.id,
    visibility: 'public',
    post_type: 'system',
    body: `@${handle} joined the community 👋`,
  })
}
