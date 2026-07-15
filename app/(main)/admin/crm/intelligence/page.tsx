import { Suspense } from 'react'
import { Sparkles } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminTemplate } from '@/components/templates'
import { getCallerProfile } from '@/lib/auth'
import { getStaffMember } from '@/lib/staff'
import { getCapabilityOverrides } from '@/lib/permissions'
import { staffCan } from '@/lib/core/staff-roles'
import { isJanitor } from '@/lib/core/roles'
import { seedPlaybooks } from '@/lib/playbooks/seed'
import { CrmToday } from '@/components/widgets/crm/today'
import { CrmPlaybooksStats } from '@/components/widgets/crm/playbooks-stats'
import { CrmPlaybooksRegistry } from '@/components/widgets/crm/playbooks-registry'
import { CrmPlaybooksRuns } from '@/components/widgets/crm/playbooks-runs'
import { CrmGraphMetrics } from '@/components/widgets/crm/graph-metrics'
import { CrmGraphConnections } from '@/components/widgets/crm/graph-connections'
import { CrmCockpitStats } from '@/components/widgets/crm/cockpit-stats'
import { CrmRising } from '@/components/widgets/crm/rising'
import { CrmTrust } from '@/components/widgets/crm/trust'

// INTELLIGENCE — the unified Resonance CRM operator surface (owner merge of Vera Today + Playbooks +
// the Resonance Graph into one well-organized page). Resonance Engine · docs/NEXT-GEN-CRM.md.
//
// LAYOUT (a stats band over a Main/Side split, mirroring the module engine's own two-col + main-side
// grids so it reads identically to every other framework page):
//   • Stats band (full width): the Playbooks headline row (plays · runs · autonomy · circuit breaker)
//     and the Resonance Graph metric row (consented · connections · health). The two stat rows the
//     operator scans first.
//   • MAIN (3/5): Vera Today — the five one-tap person-plus-action cards. The operator's primary work.
//   • SIDE (2/5): the saved plays (the registry + recent runs) and the graph's strongest-connections
//     list. The reference + reach-out column beside the day's work.
//
// COMPOSED, NOT <PageModules>: each interior block is an existing self-fetching, fail-safe RSC
// (components/widgets/crm/*), REUSED here unchanged and isolated in its own <Suspense> so a slow read
// never blocks the shell (PAGE-FRAMEWORK §5). The page composes them directly rather than through the
// shared module engine for one reason: the two Resonance Graph blocks carry an ADDITIONAL staff
// 'insights' gate that the per-route engine (which renders every block in a set to anyone who clears
// the page floor) cannot express per block. Composing lets the graph blocks self-gate (below) while
// Today + Playbooks stay at the janitor floor.
//
// STAFF-GATED: requireAdmin('janitor') is the page floor (the whole Resonance CRM domain is a
// sensitive operator view). The Resonance Graph blocks additionally require the 'insights' staff read
// floor OR platform janitor — the exact gate the standalone Graph page enforced — applied per block so
// the graph is never over-surfaced even if the page floor is ever relaxed. The /admin/* group mounts
// its own info rail (page-chrome returns 'none' for /admin/*), so no rail registration is needed here.
export const dynamic = 'force-dynamic'

// The durable `playbooks` table sync (idempotent + fail-safe), isolated in its own async component so
// it runs OFF the shell's render path (PAGE-FRAMEWORK §5) — awaiting it inline blocked first paint on
// a DB read-then-write every request. It renders nothing; the Playbooks blocks read fail-safe, so they
// never need the seed to have finished first. Carried over from the retired Playbooks page.
async function PlaybooksSeed() {
  await seedPlaybooks()
  return null
}

// Fail-CLOSED insights gate for the Resonance Graph blocks. Mirrors the standalone Graph page's
// requireAdmin('janitor', { staff: 'insights', staffLevel: 'read' }) as a boolean (janitor OR an
// insights read-staff role), so the per-member relationship graph keeps its own floor. Any error
// hides the block rather than risk over-surfacing a sensitive view.
async function viewerHasGraphInsights(): Promise<boolean> {
  try {
    const profile = await getCallerProfile()
    if (!profile) return false
    if (isJanitor(profile.webRole)) return true
    const [staff, overrides] = await Promise.all([
      getStaffMember().catch(() => null),
      getCapabilityOverrides().catch(() => undefined),
    ])
    return staffCan(staff?.role ?? null, 'insights', 'read', overrides)
  } catch {
    return false
  }
}

async function GraphMetricsGated() {
  if (!(await viewerHasGraphInsights())) return null
  return <CrmGraphMetrics />
}

async function GraphConnectionsGated() {
  if (!(await viewerHasGraphInsights())) return null
  return <CrmGraphConnections />
}

export default async function IntelligencePage() {
  await requireAdmin('janitor')

  return (
    <AdminTemplate
      title="Intelligence"
      eyebrow="CRM"
      icon={Sparkles}
      description="Vera's next moves, the saved plays behind them, and the consent-first Resonance Graph, in one place."
      width="wide"
    >
      <Suspense fallback={null}>
        <PlaybooksSeed />
      </Suspense>

      {/* Stats band (full width): the Playbooks headline row + the insights-gated Graph metric row.
          Each stat block is its own @container so its grid sizes to the full width here. */}
      <div className="@container space-y-4">
        <Suspense fallback={null}>
          <CrmPlaybooksStats />
        </Suspense>
        <Suspense fallback={null}>
          <GraphMetricsGated />
        </Suspense>
      </div>

      {/* Main / Side (3:2), the same split the engine's main-side grid uses: MAIN is Vera's one-tap
          Today worklist; SIDE is the saved plays and the strongest-connections list. Each column is an
          @container so a block sizes to the column it lands in. */}
      <div className="grid gap-6 lg:grid-cols-5 lg:gap-8">
        <div className="@container space-y-4 lg:col-span-3">
          <Suspense fallback={null}>
            <CrmToday />
          </Suspense>
        </div>
        <div className="@container space-y-4 lg:col-span-2">
          <Suspense fallback={null}>
            <CrmPlaybooksRegistry />
          </Suspense>
          <Suspense fallback={null}>
            <CrmPlaybooksRuns />
          </Suspense>
          <Suspense fallback={null}>
            <GraphConnectionsGated />
          </Suspense>
        </div>
      </div>

      {/* Platform health (re-homed here when the master-detail CRM home was condensed to the roster +
          the compact stat row): the resonance verdict + live stat row + who-needs-attention worklist +
          lifecycle funnel, the overlooked rising-members reach-out pool, and the score-trustworthiness
          backtest. All at the janitor page floor (no extra insights gate), each its own fail-safe
          Suspense block so a slow read never blocks the shell. */}
      <div className="@container space-y-6">
        <Suspense fallback={null}>
          <CrmCockpitStats />
        </Suspense>
        <div className="grid gap-6 lg:grid-cols-2">
          <Suspense fallback={null}>
            <CrmRising />
          </Suspense>
          <Suspense fallback={null}>
            <CrmTrust />
          </Suspense>
        </div>
      </div>
    </AdminTemplate>
  )
}
