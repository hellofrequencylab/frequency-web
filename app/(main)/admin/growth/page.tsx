import { TrendingUp } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { UnderlineTabs } from '@/components/admin/underline-tabs'
import { OverviewTab } from '@/components/admin/growth/overview-tab'
import { AcquisitionTab } from '@/components/admin/growth/acquisition-tab'
import { CrmTab } from '@/components/admin/growth/crm-tab'
import { MarketingTab } from '@/components/admin/growth/marketing-tab'

// The consolidated GROWTH workspace (ADR-264): one tabbed surface that absorbed the four
// growth-domain dashboards — Overview (the roll-up), Acquisition, CRM, and Marketing — so
// the growth engine is one place instead of four routes. Tabs are query-param views (the
// UnderlineTabs pattern) so only the active tab's data loads and the URL stays shareable.
// Overview is the default (so /admin/growth keeps its meaning). The tool sub-routes
// (/admin/crm/*, /admin/marketing/*) survive and keep their own gates.
//
// Gate: the LOOSEST union of the four so no operator loses access — a staff web_role
// (Marketing was reachable by any Site Admin) OR a marketing team capability at READ
// (Analyst included, who had Marketing read before). Each tool sub-route still re-gates.
export const dynamic = 'force-dynamic'

const TAB_KEYS = ['overview', 'acquisition', 'crm', 'marketing'] as const
type TabKey = (typeof TAB_KEYS)[number]

const TAB_LABEL: Record<TabKey, string> = {
  overview: 'Overview',
  acquisition: 'Acquisition',
  crm: 'CRM',
  marketing: 'Marketing',
}

export default async function GrowthWorkspace({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const { role, webRole, staffRole } = await requireAdmin('admin', { staff: 'marketing', staffLevel: 'read' })

  const { tab: raw } = await searchParams
  const tab: TabKey = (TAB_KEYS as readonly string[]).includes(raw ?? '') ? (raw as TabKey) : 'overview'

  const href = (t: TabKey) => (t === 'overview' ? '/admin/growth' : `/admin/growth?tab=${t}`)

  return (
    <AdminTemplate
      title="Growth"
      eyebrow="Domain"
      icon={TrendingUp}
      width="wide"
      description="The growth engine in one place: the funnel and activation, acquisition, the deal pipeline, and the marketing workspace."
    >
      <AdminSection>
        <UnderlineTabs
          activeHref={href(tab)}
          tabs={TAB_KEYS.map((t) => ({ href: href(t), label: TAB_LABEL[t] }))}
        />
      </AdminSection>

      <div className="mt-2">
        {tab === 'overview' && <OverviewTab role={role} webRole={webRole} staffRole={staffRole} />}
        {tab === 'acquisition' && <AcquisitionTab role={role} webRole={webRole} staffRole={staffRole} />}
        {tab === 'crm' && <CrmTab />}
        {tab === 'marketing' && <MarketingTab />}
      </div>
    </AdminTemplate>
  )
}
