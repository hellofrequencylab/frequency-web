import { Sparkles } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminTemplate } from '@/components/templates'
import { PageModules } from '@/components/widgets/page-modules'

// Vera "Today" (Resonance Engine Phase 1 · ADR-382 · docs/NEXT-GEN-CRM.md) — the minimal surface that
// makes the loop visible. Module-driven (ADR-270/294): the page composes the AdminTemplate header, then
// renders <PageModules>, which lays out the whole interior as ONE self-fetching, fail-safe RSC
// (components/widgets/crm/today.tsx): the inbox-zero of the five person-plus-action cards the model says
// matter most, each one tap (do it / tweak / not now), plus the verdict line and the you-are-at-zero
// empty. There is no searchParams facet, so it converts wholesale to one module (exactly like /admin/audit).
//
// STAFF-GATED: requireAdmin('janitor') — a platform-wide member-prediction read is a sensitive operator
// view. The module renders only through this gated route, so it never re-gates. The /admin/* group
// mounts its own info rail (page-chrome 'none'), so no rail registration is needed here.
export const dynamic = 'force-dynamic'

export default async function TodayPage() {
  await requireAdmin('janitor')

  return (
    <AdminTemplate
      title="Today"
      eyebrow="Vera"
      icon={Sparkles}
      description="The members Vera says need you most, each one tap: do it, tweak, or not now. Inbox-zero for the platform's next moves."
      width="default"
    >
      <PageModules route="/admin/crm/today" />
    </AdminTemplate>
  )
}
