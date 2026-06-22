import { getCallerProfile } from '@/lib/auth'
import { isJanitor } from '@/lib/core/roles'
import { getAdminMenu, MENU_SURFACES } from '@/lib/menus/read'
import { activeMenuSurface } from '@/lib/menus/active-surface'
import { MenuLayoutPanel } from '@/components/admin/menu/menu-layout-panel'

// `menu-layout` layout module (ADR-359): Layout & defaults — the column count for the active surface
// (5) plus the Seed/Reset-from-site-defaults action (12). A self-fetching RSC that resolves the
// active surface (lib/menus/active-surface) and reads that surface's menu (getAdminMenu).
//
// COUPLING — this block does NOT materialize-on-default. The single auto-materialize lives in
// menu-groups (the primary editor); here the client panel ensures the menu row lazily on its first
// write, and Seed/Reset seeds explicitly on demand. So this block and menu-rail-cards never race the
// groups block's materialize.
//
// Janitor-only by the module contract: returns null below janitor, so the block is fail-closed.
export async function MenuLayoutBlock() {
  const profile = await getCallerProfile()
  if (!profile || !isJanitor(profile.webRole)) return null

  const surface = await activeMenuSurface()
  const menu = await getAdminMenu(surface)
  const surfaceLabel = MENU_SURFACES.find((s) => s.key === surface)?.label ?? surface

  return <MenuLayoutPanel key={surface} initialMenu={menu} surfaceKey={surface} surfaceLabel={surfaceLabel} />
}
