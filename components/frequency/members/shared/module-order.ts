import 'server-only'
import { loadLayoutForRoute } from '@/lib/page-settings/store'
import { resolveSlots } from '@/lib/page-settings/layout'
import { getViewerCommunityRole } from '@/lib/page-settings/viewer-role'
import { moduleIdsForScope } from '@/lib/widgets/modules'
import { slotIds } from '@/lib/widgets/templates'

// THE LAYOUT EDITOR, HONOURED UNDER FREQUENCY. A module-driven route (lib/widgets/module-routes.ts)
// is arranged by an operator from Settings -> Page -> Layout: which blocks show, in what order, for
// which role. Its Frequency body is the reference's own composition, so it does not render the DAWN
// module grid, but it must not ignore what the operator chose either. This resolves the same config
// the DAWN renderer (components/widgets/page-modules.tsx) reads into one ordered list of the visible
// module ids: slot by slot in the template's order, each slot in its saved order. A body then draws
// its own section for each id, in that order, and skips any id that is not there.
//
// Fail-safe like PageModules: loadLayoutForRoute returns the empty config on any error, which
// resolves to every module in its default order, so a read blip shows the whole page.

export async function visibleModuleOrder(route: string): Promise<string[]> {
  const [config, role] = await Promise.all([loadLayoutForRoute(route), getViewerCommunityRole()])
  const bySlot = resolveSlots(config, moduleIdsForScope(route), role)
  const order: string[] = []
  const seen = new Set<string>()
  for (const slot of [...slotIds(config.template), ...Object.keys(bySlot)]) {
    for (const id of bySlot[slot] ?? []) {
      if (seen.has(id)) continue
      seen.add(id)
      order.push(id)
    }
  }
  return order
}
