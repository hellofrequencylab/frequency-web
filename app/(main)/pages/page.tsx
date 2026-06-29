import { Files } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminTemplate } from '@/components/templates'
import { PageModules } from '@/components/widgets/page-modules'

export const dynamic = 'force-dynamic'

// The Pages workspace — the one place to find any page and open it ready to edit. It is now
// MODULE-DRIVEN (ADR-270/294): the four areas (In-app / Member, In-app / Focus surfaces, Splash
// funnels, Marketing pages) are self-fetching layout modules (lib/widgets/modules.ts → registry),
// laid out by <PageModules route="/pages">. Operators arrange them from the on-page Settings →
// Layout panel (the route is registered in lib/widgets/module-routes.ts), with the same template
// catalog every other module-driven page uses — so the legacy bottom-right "Sort areas" dock and
// its cookie are gone. The splash + marketing modules self-gate to janitor; the in-app ones show
// for every operator, so a Site Admin always has something to manage.
export default async function PagesDirectory() {
  // Page management is STAFF (admin+, ADR-261/262); each module re-asserts its own minimum.
  await requireAdmin('admin')

  return (
    <AdminTemplate
      title="Pages"
      eyebrow="Platform"
      icon={Files}
      description="Find any page and open it ready to edit. In-app pages open in place with edit mode on; the public marketing pages and the Splash Funnels open in their own editors and go live when you publish."
      width="wide"
    >
      <PageModules route="/pages" />
    </AdminTemplate>
  )
}
