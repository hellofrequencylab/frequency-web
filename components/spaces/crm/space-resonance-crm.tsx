import { Suspense } from 'react'
import { Sparkles } from 'lucide-react'
import { PageHeading } from '@/components/templates'
import { Skeleton } from '@/components/ui/skeleton'
import { ImportContactsButton } from '@/components/crm/import/import-contacts-button'
import { SpaceCrmHealthStatRow } from './space-crm-stats'
import { SpaceMemberViewer } from './space-member-viewer'
import { SpaceResonanceRail } from './space-resonance-rail'

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
    <div>
      {/* The SAME header grammar as the admin /admin/crm page (PageHeading via AdminTemplate): eyebrow "CRM"
          + the Sparkles-iconed "Resonance CRM" H1 + the one-line description + Import contacts on the right +
          the header rule. adminBar is off (the platform operator Settings control does not belong on a space),
          so a plain divider is drawn instead. */}
      <PageHeading
        eyebrow="CRM"
        title={
          <span className="inline-flex items-center gap-2">
            <Sparkles className="h-5 w-5 shrink-0 text-primary-strong" aria-hidden />
            Community Resonance
          </span>
        }
        description={<span className="block truncate">Pick a member to see everything about them, inline.</span>}
        actions={<ImportContactsButton target={{ kind: 'space', spaceId }} spaceName={spaceName} />}
        adminBar={false}
      />

      <div className="space-y-5">
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

      {/* Two columns on wide screens: the master-detail roster (main, left) beside a slim rail of live
          widgets (aside, right, lg:w-72); a single stacked column on mobile. The stat cards above stay
          full width. The roster keeps its id so the rail's "needs attention" nudge + "Roster" link can
          scroll straight to it within this tab. */}
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
        <div id="space-resonance-roster" className="min-w-0 flex-1 scroll-mt-24">
          <SpaceMemberViewer spaceId={spaceId} slug={slug} />
        </div>
        <aside className="w-full lg:w-72 lg:shrink-0">
          <SpaceResonanceRail spaceId={spaceId} slug={slug} />
        </aside>
      </div>
      </div>
    </div>
  )
}
