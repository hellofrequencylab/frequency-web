import { headers } from 'next/headers'
import { AdminSection } from '@/components/templates'
import { MemberViewerRoster } from '@/app/(main)/admin/crm/members/member-viewer-roster'
import { resolveFilter } from '@/app/(main)/admin/crm/members/resolve-filter'

// Resonance CRM members layout module (ADR-270/294/459): the standalone members surface as one
// self-fetching, fail-safe RSC — the fully-featured member-viewer (list left, rich detail right)
// with the hero sort + live search. It reuses the ONE shared roster (MemberViewerRoster), so the
// module and the cockpit's top viewer read identically.
//
// The ?tier=/?stage= facet is a page searchParams value a nested module never receives as a prop, so
// it's read from the x-search request header the proxy stamps on every route (proxy.ts) — the same
// seam the admin hubs / practices library modules use. resolveFilter validates it (an unknown or
// absent facet falls back to the FULL scored roster, the list-first front door). The page keeps its
// requireAdmin gate; this renders only through that gated route, so it never re-gates.
export async function CrmMembersRoster() {
  const search = new URLSearchParams((await headers()).get('x-search') ?? '')
  const resolved = resolveFilter(search.get('tier') ?? undefined, search.get('stage') ?? undefined)

  return (
    <AdminSection>
      <MemberViewerRoster
        filter={resolved.filter}
        emptyTitle={resolved.emptyTitle}
        emptyDescription={resolved.emptyDescription}
      />
    </AdminSection>
  )
}
