import { Gamepad2 } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { UnderlineTabs } from '@/components/admin/underline-tabs'
import { OverviewTab } from '@/components/admin/programs/overview-tab'
import { ContentTab } from '@/components/admin/programs/content-tab'
import { RewardsTab } from '@/components/admin/programs/rewards-tab'

// The consolidated PROGRAMS workspace: one tabbed surface that absorbed the Programs
// domain dashboard and the separate Content suite home (which is hard-deleted) so the
// game is one place instead of two stacked dashboards — matching the Growth (ADR-264)
// and Insights (ADR-263) condensation pattern. Tabs are query-param views (UnderlineTabs)
// so only the active tab's data loads and the URL stays shareable; Overview is the
// default so /admin/programs keeps its meaning. The leaf editors (/admin/content/*,
// /admin/gamification, /admin/store, …) survive and keep their own gates.
export const dynamic = 'force-dynamic'

const TAB_KEYS = ['overview', 'content', 'rewards'] as const
type TabKey = (typeof TAB_KEYS)[number]

const TAB_LABEL: Record<TabKey, string> = {
  overview: 'Overview',
  content: 'Content',
  rewards: 'Rewards & economy',
}

export default async function ProgramsWorkspace({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const { role, webRole, staffRole } = await requireAdmin('host', { staff: 'community' })

  const { tab: raw } = await searchParams
  const tab: TabKey = (TAB_KEYS as readonly string[]).includes(raw ?? '') ? (raw as TabKey) : 'overview'

  const href = (t: TabKey) => (t === 'overview' ? '/admin/programs' : `/admin/programs?tab=${t}`)

  return (
    <AdminTemplate
      title="Programs"
      eyebrow="Domain"
      icon={Gamepad2}
      width="wide"
      description="The game in one place: the catalog and season at a glance, the content suite, and the rewards economy."
    >
      <AdminSection>
        <UnderlineTabs
          activeHref={href(tab)}
          tabs={TAB_KEYS.map((t) => ({ href: href(t), label: TAB_LABEL[t] }))}
        />
      </AdminSection>

      <div className="mt-2">
        {tab === 'overview' && <OverviewTab role={role} webRole={webRole} staffRole={staffRole} />}
        {tab === 'content' && <ContentTab webRole={webRole} />}
        {tab === 'rewards' && <RewardsTab role={role} webRole={webRole} staffRole={staffRole} />}
      </div>
    </AdminTemplate>
  )
}
