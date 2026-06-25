'use server'

import { getJanitor } from '@/lib/page-editor/guard'
import { setOperatorRailLayout } from '@/lib/circles/rail-layout-store'
import type { RailLayout } from '@/lib/circles/rail-layout'

// The OPERATOR global default for the circle right-rail layout (janitor-only). This is the
// network-wide default that applies to every circle that hasn't set its own override; a
// host's per-circle layout (saveSidebarOrder) always wins over it. Circle pages are
// dynamic (per-viewer), so a new default takes effect on the next render — no revalidation.
export async function saveCircleRailDefault(layout: RailLayout): Promise<{ error?: string }> {
  const janitor = await getJanitor()
  if (!janitor) return { error: 'Not allowed.' }
  try {
    await setOperatorRailLayout(layout, janitor.profileId)
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not save the default layout.' }
  }
}
