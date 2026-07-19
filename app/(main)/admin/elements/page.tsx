import { Blocks } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { ELEMENTS } from '@/lib/elements/registry'
import { resolveElement } from '@/lib/elements/store'
import { resolveElementConfig } from '@/lib/elements/config'
import { ElementEditor } from './elements-editor'

// The shared Elements console (docs/EMBEDDABLE-ELEMENTS.md). Lists every registered embeddable element
// (the Loom picker today; QR Studio / Email editor / CRM board as they adopt the framework) and edits
// each one's PLATFORM MASTER settings + per-feature role gates. Edit here, and every occurrence of the
// element across the site reflects it. Staff-only.
export const dynamic = 'force-dynamic'

export default async function ElementsConsolePage() {
  await requireAdmin('admin')

  // Resolve each element's master config (defaults <- platform master). Fail-safe to defaults.
  const items = await Promise.all(
    ELEMENTS.map(async (def) => {
      const resolved = (await resolveElement(def.key)) ?? resolveElementConfig(def)
      return { def, resolved }
    }),
  )

  return (
    <AdminTemplate
      icon={Blocks}
      eyebrow="Platform"
      title="Elements"
      description="The reusable elements that appear across Frequency. Edit an element's master settings and role gates here, and every occurrence updates site-wide."
    >
      <AdminSection>
        <div className="space-y-4">
          {items.map(({ def, resolved }) => (
            <ElementEditor key={def.key} def={def} resolved={resolved} />
          ))}
        </div>
      </AdminSection>
    </AdminTemplate>
  )
}
