import { LineChart } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { isJanitor } from '@/lib/core/roles'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { UnderlineTabs } from '@/components/admin/underline-tabs'
import { ReadTab } from '@/components/admin/insights/read-tab'
import { EngagementTab } from '@/components/admin/insights/engagement-tab'
import { OutcomesTab } from '@/components/admin/insights/outcomes-tab'
import { IntelTab } from '@/components/admin/insights/intel-tab'
import { ExpansionTab } from '@/components/admin/insights/expansion-tab'
import { FinancialsTab } from '@/components/admin/insights/financials-tab'

// The consolidated INSIGHTS suite (ADR-263): one tabbed surface that absorbed the six
// scattered analytics pages — the Read, Engagement, Outcomes, Marketing intel, Expansion,
// and Finances — so all the platform's analytics live in one place instead of six routes.
// Tabs are query-param views (the UnderlineTabs pattern, like /admin/members), so only the
// active tab's data loads and the URL stays shareable. Read is the default (so /admin/insights
// keeps its old meaning). Finances is janitor-only; the other five admit insights staff too.
export const dynamic = 'force-dynamic'

const TAB_KEYS = ['read', 'engagement', 'outcomes', 'intel', 'expansion', 'financials'] as const
type TabKey = (typeof TAB_KEYS)[number]

const TAB_LABEL: Record<TabKey, string> = {
  read: 'Read',
  engagement: 'Engagement',
  outcomes: 'Outcomes',
  intel: 'Marketing intel',
  expansion: 'Expansion',
  financials: 'Finances',
}

export default async function InsightsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const { webRole } = await requireAdmin('janitor', { staff: 'insights', staffLevel: 'read' })
  const janitor = isJanitor(webRole)

  const { tab: raw } = await searchParams
  // Finances is janitor-only; coerce a non-janitor (insights staff) away from it. Anything
  // unknown falls back to the Read.
  const valid = (TAB_KEYS as readonly string[]).includes(raw ?? '') && (raw !== 'financials' || janitor)
  const tab: TabKey = valid ? (raw as TabKey) : 'read'

  // Read lives at the bare route so /admin/insights keeps working; the rest carry ?tab=.
  const href = (t: TabKey) => (t === 'read' ? '/admin/insights' : `/admin/insights?tab=${t}`)
  const visible: TabKey[] = TAB_KEYS.filter((t) => t !== 'financials' || janitor)

  return (
    <AdminTemplate
      title="Insights"
      eyebrow="Insights"
      icon={LineChart}
      description="The platform's analytics in one place: the engagement read, the activation funnel, program outcomes, marketing intel, expansion signal, and finances."
      width="wide"
    >
      <AdminSection>
        <UnderlineTabs
          activeHref={href(tab)}
          tabs={visible.map((t) => ({ href: href(t), label: TAB_LABEL[t] }))}
        />
      </AdminSection>

      <div className="mt-2">
        {tab === 'read' && <ReadTab />}
        {tab === 'engagement' && <EngagementTab />}
        {tab === 'outcomes' && <OutcomesTab />}
        {tab === 'intel' && <IntelTab />}
        {tab === 'expansion' && <ExpansionTab />}
        {tab === 'financials' && <FinancialsTab />}
      </div>
    </AdminTemplate>
  )
}
