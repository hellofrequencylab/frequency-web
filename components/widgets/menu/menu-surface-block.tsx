import { getCallerProfile } from '@/lib/auth'
import { isJanitor } from '@/lib/core/roles'
import { getAdminMenu, MENU_SURFACES } from '@/lib/menus/read'
import { activeMenuSurface } from '@/lib/menus/active-surface'
import type { MenuSurfaceKey } from '@/lib/menus/types'
import { MenuSurfacePicker } from '@/components/admin/menu/menu-surface-picker'

// `menu-surface` layout module (ADR-359): the Surface picker — the ONLY block that sets the active
// surface. A self-fetching RSC that resolves the active surface from the URL (lib/menus/active-surface,
// via the x-search header seam) and reads each surface's isDefault flag (a cheap getAdminMenu per
// surface) so the picker can badge the un-seeded ones. Janitor-only by the module contract: the page
// already gates entry with requireAdmin('janitor'), and this returns null below janitor, so the block
// is fail-closed wherever it is placed.
export async function MenuSurfaceBlock() {
  const profile = await getCallerProfile()
  if (!profile || !isJanitor(profile.webRole)) return null

  const [active, ...resolved] = await Promise.all([
    activeMenuSurface(),
    ...MENU_SURFACES.map((s) => getAdminMenu(s.key)),
  ])

  const defaults = MENU_SURFACES.reduce(
    (acc, s, i) => {
      acc[s.key] = resolved[i]?.isDefault ?? true
      return acc
    },
    {} as Record<MenuSurfaceKey, boolean>,
  )

  return <MenuSurfacePicker surfaces={MENU_SURFACES} active={active} defaults={defaults} />
}
