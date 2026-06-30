import { Users } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { type MemberFilter } from '@/lib/dashboard/scores'
import { tierLabel } from '@/lib/dashboard/verdict'
import type { ResonanceTier } from '@/lib/traits/compute'
import { Suspense } from 'react'
import { MemberViewerRoster } from './member-viewer-roster'

// The Resonance CRM member roster (Resonance Engine Phase 2 · ADR-383), rendered through the
// REUSABLE member-viewer block (ADR-459). LIST-FIRST (docs/NEXT-GEN-CRM.md): with no filter this is
// the FULL scored roster, the familiar front door, now in a master-detail browser (list left, the
// member's detail right). A tier band (?tier=at_risk) or a lifecycle step (?stage=new) still drills
// the same list down; every chart point on the cockpit lands here, and the viewer's own tier +
// lifecycle facets refine it further. Each member's right pane links on to the contact_interactions
// timeline. STAFF-GATED like the cockpit. FAIL-SAFE: an absent matview shows a calm empty state.
// Semantic tokens only; copy in voice (no em or en dashes).

export const dynamic = 'force-dynamic'

const TIER_VALUES: readonly ResonanceTier[] = ['resonant', 'cooling', 'at_risk']
const LIFECYCLE_LABELS: Record<string, string> = {
  new: 'New',
  activated: 'Activated',
  engaged: 'Engaged',
  at_risk: 'At risk',
  dormant: 'Dormant',
}

/** Resolve the URL params into a validated filter + a human title + the empty-state copy. With no
 *  (or an invalid) tier/stage this resolves to the FULL roster (`all`), the list-first front door. */
function resolveFilter(
  tier?: string,
  stage?: string,
): { filter: MemberFilter; title: string; description: string; emptyTitle: string; emptyDescription: string } {
  if (tier && (TIER_VALUES as readonly string[]).includes(tier)) {
    return {
      filter: { kind: 'tier', value: tier as ResonanceTier },
      title: `${tierLabel(tier as ResonanceTier)} members`,
      description: 'Lowest health first. Tap anyone to open their full timeline.',
      emptyTitle: 'No members in this group yet',
      emptyDescription:
        'Once the overnight refresh scores members, the ones in this group show here, each linking to their timeline.',
    }
  }
  if (stage && LIFECYCLE_LABELS[stage]) {
    return {
      filter: { kind: 'lifecycle', value: stage },
      title: `${LIFECYCLE_LABELS[stage]} members`,
      description: 'Lowest health first. Tap anyone to open their full timeline.',
      emptyTitle: 'No members in this group yet',
      emptyDescription:
        'Once the overnight refresh scores members, the ones in this group show here, each linking to their timeline.',
    }
  }
  // LIST-FIRST default: the full scored roster, the familiar front door (no filter required).
  return {
    filter: { kind: 'all' },
    title: 'Members',
    description: 'Everyone the engine has scored, lowest health first. Tap anyone to open their full timeline.',
    emptyTitle: 'No members scored yet',
    emptyDescription:
      'Once the overnight refresh scores members, your whole roster shows here, each linking to their timeline.',
  }
}

export default async function CockpitMembersPage({
  searchParams,
}: {
  searchParams: Promise<{ tier?: string; stage?: string }>
}) {
  await requireAdmin('janitor')
  const { tier, stage } = await searchParams
  const resolved = resolveFilter(tier, stage)

  return (
    <AdminTemplate
      title={resolved.title}
      eyebrow="CRM"
      icon={Users}
      description={resolved.description}
      back={{ href: '/admin/crm', label: 'Resonance cockpit' }}
      width="default"
    >
      <AdminSection>
        <Suspense fallback={null}>
          <MemberViewerRoster
            filter={resolved.filter}
            emptyTitle={resolved.emptyTitle}
            emptyDescription={resolved.emptyDescription}
          />
        </Suspense>
      </AdminSection>
    </AdminTemplate>
  )
}
