import { Users } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminTemplate } from '@/components/templates'
import { PageModules } from '@/components/widgets/page-modules'
import { resolveFilter } from './resolve-filter'

// The Resonance CRM member roster (ADR-459), module-driven (ADR-270/294): the page owns the
// requireAdmin gate + the AdminTemplate header, then renders <PageModules>, which lays out the one
// self-fetching, fail-safe roster block (components/widgets/crm/members-roster.tsx).
//
// The interior is keyed on a URL FACET (?tier=/?stage=). searchParams are a PAGE prop that never
// reach a nested module, so the module reads the SAME facet from the x-search request header the
// proxy stamps on every route (proxy.ts) — the admin-hubs / practices-library seam. The page still
// reads its own searchParams to TITLE the header (via the shared resolveFilter), so the header and
// the roster can never drift; the module renders only through this gated route, so it never re-gates.
// LIST-FIRST (docs/NEXT-GEN-CRM.md): with no facet this is the FULL scored roster, the front door.
// Semantic tokens only; copy in voice (no em or en dashes).

export const dynamic = 'force-dynamic'

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
      <PageModules route="/admin/crm/members" />
    </AdminTemplate>
  )
}
