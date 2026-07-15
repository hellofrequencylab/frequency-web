import { Suspense } from 'react'
import { Sparkles } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminTemplate } from '@/components/templates'
import { Skeleton } from '@/components/ui/skeleton'
import { CrmHealthStatRow } from '@/components/widgets/crm/cockpit-stats'
import { ImportContactsButton } from '@/components/crm/import/import-contacts-button'
import { CockpitMemberViewer } from './cockpit-member-viewer'

// RESONANCE CRM — the single-page master-detail home (ADR-459 · owner spec). Pick a member on the left
// and EVERYTHING about them shows inline on the right: a compact profile (identity + all contact info +
// roles), the compose surface, and an expandable full profile (scores, engagement rollup, what they
// manage + are part of, and their Path). There is NO separate member page — the retired contact page
// redirects here (`?member=<profileId>`).
//
// The header is condensed to one truncated line + a compact StatCard row (Members / Active this week /
// At risk / Resonance Health), each fail-safe and streamed behind its own <Suspense> so a slow read
// never blocks the shell (PAGE-FRAMEWORK §5). Contacts import lives in-line as a header action
// (<ImportContactsButton>), not a separate view. Like /broadcast and /friends, this is one coupled,
// searchParam-driven view, so it composes the kit directly rather than <PageModules>.
//
// STAFF-GATED: requireAdmin('janitor'). The /admin/* group mounts its own info rail (page-chrome
// 'none'), so no rail registration is needed here.
export const dynamic = 'force-dynamic'

export default async function PlatformCrmPage({
  searchParams,
}: {
  searchParams: Promise<{ member?: string | string[] }>
}) {
  await requireAdmin('janitor')

  const { member } = await searchParams
  const initialSelectedId = (Array.isArray(member) ? member[0] : member) || undefined

  return (
    <AdminTemplate
      title="Resonance CRM"
      eyebrow="CRM"
      icon={Sparkles}
      description={
        <span className="block truncate">Pick a member to see everything about them, inline.</span>
      }
      width="wide"
      actions={<ImportContactsButton target={{ kind: 'platform' }} />}
    >
      {/* The compact health read, where the old section headers were. Fail-safe + streamed. */}
      <Suspense fallback={<div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}</div>}>
        <CrmHealthStatRow />
      </Suspense>

      {/* The master-detail roster: skinny list left, wide inline member detail right. */}
      <CockpitMemberViewer initialSelectedId={initialSelectedId} />
    </AdminTemplate>
  )
}
