import { Suspense } from 'react'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminTemplate } from '@/components/templates'
import { PageModules } from '@/components/widgets/page-modules'
import { AwardLauncher } from './award-launcher'

// GAMIFICATION — achievements, challenges, and engagement stats as an operator surface (ADR-233 §3.3).
// Module-driven (ADR-270/294): the page composes the AdminTemplate header (with the Award Achievement
// launcher as a header action), then renders <PageModules>, which lays out the season control, the
// janitor-only reward-economy editor, the Rewards v2 metrics, the stat band, the top-achievers
// leaderboard, and the achievements + challenges tables in the operator-chosen order. Each block is a
// self-fetching, fail-safe RSC in components/widgets/gamification/* isolated in its own <Suspense>, so a
// slow read never blocks the shell (PAGE-FRAMEWORK §5) and staff arrange them from the on-page
// Settings → Layout panel.
//
// STAFF-GATED: requireAdmin('host', { staff: 'community' }) — the host floor OR a community staff role.
// The reward editor self-gates further to the web_role janitor axis (getJanitor), the SAME axis the
// reward + season server actions enforce, so the UI affordance and the action gate agree. The modules
// render only through this gated route, so they never re-gate. The /admin/* group mounts its own info
// rail (page-chrome 'none'), so no rail registration is needed here.
export const dynamic = 'force-dynamic'

export default async function AdminGamificationPage() {
  await requireAdmin('host', { staff: 'community' })

  return (
    <AdminTemplate
      title="Gamification"
      eyebrow="Community"
      description="Overview of achievements, challenges, and engagement stats."
      width="default"
      actions={
        <Suspense fallback={null}>
          <AwardLauncher />
        </Suspense>
      }
    >
      <PageModules route="/admin/gamification" />
    </AdminTemplate>
  )
}
