import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { FocusTemplate } from '@/components/templates'
import { PageModules } from '@/components/widgets/page-modules'

export const dynamic = 'force-dynamic'

// Your Journal — the daily-log face of Capture (§6 Phase 3, ADR-155/156). The feed is the
// community's record of lived experience; this is *your* slice of it, your captured moments grouped
// by day. The interior is module-driven (ADR-270/294): the entries block self-fetches the viewer's
// own posts and an operator can arrange it (Settings ▾ → Page → Layout). The page keeps only the
// auth guard + the Focus header and renders <PageModules>.

export default async function JournalPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')
  const { data: profile } = await supabase.from('profiles').select('id').eq('auth_user_id', user.id).maybeSingle()
  if (!profile) redirect('/onboarding')

  return (
    <FocusTemplate
      title="Your Journal"
      description="Your record of showing up: every moment you’ve captured, newest first. This is the feed as a journal, not a scroll: proof you were here."
    >
      <PageModules route="/journal" />
    </FocusTemplate>
  )
}
