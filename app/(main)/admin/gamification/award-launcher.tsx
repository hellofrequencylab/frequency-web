import { createAdminClient } from '@/lib/supabase/admin'
import { AwardDialog } from './award-dialog'

// The Gamification header action (NOT an arrangeable module): a small self-fetching RSC that loads the
// achievement catalog + the active members, then renders the client <AwardDialog>. It lives with the
// page (a header control, not an interior block) and is passed to AdminTemplate's `actions` slot behind
// its own <Suspense> so it never blocks the shell. The page owns the host + community-staff gate.
export async function AwardLauncher() {
  const admin = createAdminClient()
  const [{ data: achievements }, { data: allMembers }] = await Promise.all([
    admin.from('achievements').select('id, name, tier').order('sort_order'),
    admin.from('profiles').select('id, display_name, handle').eq('is_active', true).order('display_name').limit(200),
  ])

  return (
    <AwardDialog
      achievements={(achievements ?? []).map((a) => ({ id: a.id, name: a.name, tier: a.tier }))}
      members={(allMembers ?? []).map((m) => ({ id: m.id, display_name: m.display_name, handle: m.handle }))}
    />
  )
}
