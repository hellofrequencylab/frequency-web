import { createAdminClient } from '@/lib/supabase/admin'

// One quiet Vera line in the public feed (ADR-231 / ADR-239): a `system` post,
// rendered by SystemLine (components/feed/system-line.tsx) as a centered
// group-chat-style notice with a live Zap count beside every @mention. The ONE
// shared door for every automated announcement — join notices, streak
// milestones, whatever comes next — so they all stay deterministic templates
// authored by the system account, never AI compositions (AI-VERA guardrail).
// Best-effort and swallowed: a missed line must never block the act it marks.
export async function postSystemLine(body: string): Promise<void> {
  try {
    // post_type 'system' (20260616100000) isn't in the generated types yet.
    const admin = createAdminClient()
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
      body,
    })
  } catch {
    // never block the act being announced
  }
}
