import { Suspense } from 'react'
import { Sparkles } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { ImportContactsButton } from '@/components/crm/import/import-contacts-button'
import { SpaceCrmHealthStatRow } from './space-crm-stats'
import { SpaceMemberViewer } from './space-member-viewer'

// THE SPACE RESONANCE CRM (ADR-789): the space-scoped twin of the admin /admin/crm page — the SAME
// composition, exactly: the "Resonance CRM" header + "Pick a member to see everything about them, inline"
// + Import contacts, the four stat cards (Members / Active this week / At risk / Resonance Health), then
// the member master-detail (search + the Recent/Active/Needs help/Active now/Name sort + Role/Business/
// Activity/Tier/Lifecycle facets + list/grid toggle + list-left / detail-right). Every function is the same
// component the admin CRM uses (MemberViewer + loadMemberSummaries + loadSpaceMemberDetail), scoped to this
// space + gated on space-manage. Stats stream behind their own Suspense so a slow read never blocks.

export async function SpaceResonanceCrm({
  spaceId,
  slug,
  spaceName,
}: {
  spaceId: string
  slug: string
  spaceName: string
}) {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.15em] text-primary-strong">
            <Sparkles className="h-3.5 w-3.5" aria-hidden /> Resonance CRM
          </p>
          <p className="mt-1 text-sm text-muted">Pick a member to see everything about them, inline.</p>
        </div>
        <ImportContactsButton target={{ kind: 'space', spaceId }} spaceName={spaceName} />
      </div>

      <Suspense
        fallback={
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 rounded-2xl" />
            ))}
          </div>
        }
      >
        <SpaceCrmHealthStatRow spaceId={spaceId} />
      </Suspense>

      <SpaceMemberViewer spaceId={spaceId} slug={slug} />
    </div>
  )
}
