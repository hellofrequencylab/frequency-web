import { Suspense } from 'react'
import { Sparkles, HeartPulse, Sunrise, Bot, Network, ShieldCheck, type LucideIcon } from 'lucide-react'
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
// the Resonance Graph, PLUS the platform health cockpit). Resonance Engine · docs/NEXT-GEN-CRM.md.
//
// LAYOUT — one top-to-bottom NARRATIVE, five labelled phases, so the page reads in the order an
// operator actually thinks (answer-first, then act, then the machinery):
//   1. WHERE WE STAND  — the computed verdict + the live health row + who is sliding + the funnel.
//   2. TODAY           — Vera's next moves (main) beside the overlooked reach-out pool (side).
//   3. THE PLAYS       — the saved Vera plays behind the moves + how they have been landing.
//   4. THE GRAPH       — the consent-first relationship graph (insights-gated as a whole phase).
//   5. MODEL TRUST     — the churn-risk backtest: can you trust the scores.
// Each block is an existing self-fetching, fail-safe RSC (components/widgets/crm/*), isolated in its
// own <Suspense> so a slow read never blocks the shell (PAGE-FRAMEWORK §5). Composed directly (not
// <PageModules>) because the Graph phase carries an ADDITIONAL staff 'insights' gate the per-route
// module engine cannot express per block.
//
// STAFF-GATED: requireAdmin('janitor') is the page floor. The Graph phase additionally requires the
// 'insights' staff read floor OR platform janitor — the exact gate the standalone Graph page enforced —
// applied to the WHOLE phase (header + blocks) so the label never shows over an empty, gated body.
export const dynamic = 'force-dynamic'

// The durable `playbooks` table sync (idempotent + fail-safe), isolated so it runs OFF the shell's
// render path (PAGE-FRAMEWORK §5). Renders nothing; the Playbooks blocks read fail-safe anyway.
async function PlaybooksSeed() {
  await seedPlaybooks()
  return null
}

// A prominent phase divider so the page reads as a narrative, not a soup of blocks. `first` drops the
// top border for the phase that sits right under the page header.
function Phase({
  icon: Icon,
  title,
  blurb,
  first,
}: {
  icon: LucideIcon
  title: string
  blurb: string
  first?: boolean
}) {
  return (
    <div className={`flex items-start gap-3 ${first ? '' : 'border-t border-border pt-8'}`}>
      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-bg text-primary-strong">
        <Icon className="h-5 w-5" aria-hidden />
      </div>
      <div className="min-w-0">
        <h2 className="text-base font-bold text-text">{title}</h2>
        <p className="text-sm text-muted">{blurb}</p>
      </div>
    </div>
  )
}

// Fail-CLOSED insights gate for the Resonance Graph phase. Mirrors the standalone Graph page's
// requireAdmin('janitor', { staff: 'insights', staffLevel: 'read' }) as a boolean (janitor OR an
// insights read-staff role). Any error hides the phase rather than risk over-surfacing a sensitive view.
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

// The GRAPH phase, gated as a whole: header + both blocks show together, or nothing (no orphaned label).
async function GraphPhase() {
  if (!(await viewerHasGraphInsights())) return null
  return (
    <section className="space-y-5">
      <Phase
        icon={Network}
        title="The Resonance Graph"
        blurb="The consent-first relationship graph: who is connected, and the strongest ties in the community."
      />
      <div className="@container space-y-4">
        <Suspense fallback={null}>
          <CrmGraphMetrics />
        </Suspense>
        <Suspense fallback={null}>
          <CrmGraphConnections />
        </Suspense>
      </div>
    </section>
  )
}

export default async function IntelligencePage() {
  await requireAdmin('janitor')

  return (
    <AdminTemplate
      title="Intelligence"
      eyebrow="CRM"
      icon={Sparkles}
      description="The platform's health, the moves to make today, and the engine behind them, in one read."
      width="wide"
    >
      <Suspense fallback={null}>
        <PlaybooksSeed />
      </Suspense>

      <div className="space-y-8">
        {/* 1. WHERE WE STAND — the answer-first read: verdict + live health row + who needs attention +
            the lifecycle funnel (CrmCockpitStats renders these as its own labelled sub-sections). */}
        <section className="space-y-5">
          <Phase
            icon={HeartPulse}
            title="Where we stand"
            blurb="The platform's health right now, who the model says is sliding, and where members stall."
            first
          />
          <div className="@container">
            <Suspense fallback={null}>
              <CrmCockpitStats />
            </Suspense>
          </div>
        </section>

        {/* 2. TODAY — Vera's next moves (main) beside the overlooked reach-out pool (side). */}
        <section className="space-y-5">
          <Phase
            icon={Sunrise}
            title="Today"
            blurb="Vera's next moves, and the members worth a nudge before they cool."
          />
          <div className="grid gap-6 lg:grid-cols-5 lg:gap-8">
            <div className="@container lg:col-span-3">
              <Suspense fallback={null}>
                <CrmToday />
              </Suspense>
            </div>
            <div className="@container lg:col-span-2">
              <Suspense fallback={null}>
                <CrmRising />
              </Suspense>
            </div>
          </div>
        </section>

        {/* 3. THE PLAYS — the saved Vera plays behind the moves + how they have landed. */}
        <section className="space-y-5">
          <Phase
            icon={Bot}
            title="The plays"
            blurb="The saved Vera plays behind the moves, the run history, and the autonomy the platform allows."
          />
          <div className="@container space-y-4">
            <Suspense fallback={null}>
              <CrmPlaybooksStats />
            </Suspense>
            <div className="grid gap-6 lg:grid-cols-2">
              <Suspense fallback={null}>
                <CrmPlaybooksRegistry />
              </Suspense>
              <Suspense fallback={null}>
                <CrmPlaybooksRuns />
              </Suspense>
            </div>
          </div>
        </section>

        {/* 4. THE GRAPH — insights-gated as a whole phase (header + blocks together, or nothing). */}
        <Suspense fallback={null}>
          <GraphPhase />
        </Suspense>

        {/* 5. MODEL TRUST — the churn-risk backtest: how the model's calls held up. */}
        <section className="space-y-5">
          <Phase
            icon={ShieldCheck}
            title="Can you trust the scores"
            blurb="The backtest: how the churn-risk calls held up against what actually happened."
          />
          <div className="@container">
            <Suspense fallback={null}>
              <CrmTrust />
            </Suspense>
          </div>
        </section>
      </div>
    </AdminTemplate>
  )
}
