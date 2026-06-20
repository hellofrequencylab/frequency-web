import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { DashboardTemplate } from '@/components/templates'
import { PageModules } from '@/components/widgets/page-modules'

// Season Challenges — the season's bonus-zap challenges, grouped by difficulty above one KPI band.
// The interior is module-driven (ADR-270/294): the season block self-fetches the viewer's challenge
// progress and an operator can arrange it (Settings ▾ → Page → Layout). The page keeps only its auth
// guard + the Dashboard header and renders <PageModules>.
export default async function ChallengesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  return (
    <DashboardTemplate
      eyebrow="The Quest · Season 1"
      title="Season Challenges"
      description="Complete challenges this season to earn bonus zaps. Each season runs 13 weeks."
    >
      <PageModules route="/crew/challenges" />
    </DashboardTemplate>
  )
}
