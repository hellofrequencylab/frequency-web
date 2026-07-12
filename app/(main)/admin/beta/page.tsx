import { Rocket } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { UnderlineTabs } from '@/components/admin/underline-tabs'
import { listReadyForApproval } from '@/lib/beta/approvals'
import { BetaTodaySection } from '@/components/admin/beta/today-section'
import { BetaStatsSection } from '@/components/admin/beta/stats-section'
import { BetaStrategySection } from '@/components/admin/beta/strategy-section'
import { BetaPhasesSection } from '@/components/admin/beta/phases-section'
import { BetaTimelineSection } from '@/components/admin/beta/timeline-section'
import { BetaEmailSection } from '@/components/admin/beta/email-section'

// BETA COMMAND CENTER. The operator home for the Beta launch as ONE ?tab= workspace
// (mirrors the Vera AI dashboard, ADR-265). THREE tabs, each stacking the self-contained
// section components (components/admin/beta/*-section.tsx), mounted by the switch below:
//   • Control Center — Today (approval queue + north-star) + Stats (metrics) + Timeline (runway).
//   • Campaign — the email/campaign system (was "Email").
//   • Strategy — the launch brief + the P0-P4 phase/task board (was "Strategy" + "Phases"),
//     moved to the end.
// Each section owns its own titled AdminSection, so stacking reads as one scannable workspace.
//
// GATE: this page re-asserts the marketing READ floor (a staff web_role OR the marketing
// capability). ARMING outbound is gated tighter (admin/janitor) at the action level in
// the approval spine (lib/beta/guard.ts). The /admin shell mounts a 'none' rail, so no
// page-chrome registration is needed. This is heavily-modified Next.js: searchParams is a
// Promise (await it).
export const dynamic = 'force-dynamic'

const TAB_KEYS = ['control', 'campaign', 'strategy'] as const
type TabKey = (typeof TAB_KEYS)[number]

const TAB_LABEL: Record<TabKey, string> = {
  control: 'Control Center',
  campaign: 'Campaign',
  strategy: 'Strategy',
}

export default async function BetaCommandCenter({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  await requireAdmin('admin', { staff: 'marketing', staffLevel: 'read' })

  const { tab: rawTab } = await searchParams
  const tab: TabKey = TAB_KEYS.includes(rawTab as TabKey) ? (rawTab as TabKey) : 'control'

  // Ready-queue count powers the Control Center tab badge (the daily "act on this" signal).
  const readyCount = (await listReadyForApproval()).length
  const href = (t: TabKey) => (t === 'control' ? '/admin/beta' : `/admin/beta?tab=${t}`)

  return (
    <AdminTemplate
      title="Beta Command Center"
      eyebrow="Growth"
      icon={Rocket}
      width="wide"
      description="Run the Beta launch from one place: the phase plan, admission waves, and the approval queue where nothing sends without your sign-off."
    >
      <AdminSection>
        <UnderlineTabs
          activeHref={href(tab)}
          tabs={TAB_KEYS.map((t) => ({
            href: href(t),
            label: TAB_LABEL[t],
            count: t === 'control' && readyCount > 0 ? readyCount : undefined,
          }))}
        />
      </AdminSection>

      <div className="mt-2">
        {tab === 'control' && (
          <div className="space-y-10">
            <BetaTodaySection />
            <BetaStatsSection />
            <BetaTimelineSection />
          </div>
        )}
        {tab === 'campaign' && <BetaEmailSection />}
        {tab === 'strategy' && (
          <div className="space-y-10">
            <BetaStrategySection />
            <BetaPhasesSection />
          </div>
        )}
      </div>
    </AdminTemplate>
  )
}
