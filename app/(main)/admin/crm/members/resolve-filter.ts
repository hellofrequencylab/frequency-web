import { type MemberFilter } from '@/lib/dashboard/scores'
import { tierLabel } from '@/lib/dashboard/verdict'
import type { ResonanceTier } from '@/lib/traits/compute'

// The URL-facet resolver for the Resonance CRM members surface (ADR-459). Shared by the page (which
// reads its own searchParams to title the AdminTemplate header) and the roster MODULE (which reads
// the same ?tier=/?stage= facet from the x-search request header, since a nested module never gets
// searchParams). One resolver, so the header title and the roster filter can never drift apart.
// LIST-FIRST (docs/NEXT-GEN-CRM.md): with no (or an invalid) facet this resolves to the FULL scored
// roster, the familiar front door. Copy plain, no em or en dashes.

const TIER_VALUES: readonly ResonanceTier[] = ['resonant', 'cooling', 'at_risk']

const LIFECYCLE_LABELS: Record<string, string> = {
  new: 'New',
  activated: 'Activated',
  engaged: 'Engaged',
  at_risk: 'At risk',
  dormant: 'Dormant',
}

export interface ResolvedMemberFilter {
  filter: MemberFilter
  title: string
  description: string
  emptyTitle: string
  emptyDescription: string
}

/** Resolve the URL params into a validated filter + a human title + the empty-state copy. With no
 *  (or an invalid) tier/stage this resolves to the FULL roster (`all`), the list-first front door. */
export function resolveFilter(tier?: string, stage?: string): ResolvedMemberFilter {
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
