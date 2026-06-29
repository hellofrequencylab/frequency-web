import { getCallerProfile } from '@/lib/auth'
import { isJanitor } from '@/lib/core/roles'
import { getAdminMenu } from '@/lib/menus/read'
import { activeMenuSurface } from '@/lib/menus/active-surface'
import { MenuRailCardsEditor } from '@/components/admin/menu/menu-rail-cards-editor'

// `menu-rail-cards` layout module (ADR-359): the left/right featured Rail cards for the active
// surface (10). A self-fetching RSC that resolves the active surface (lib/menus/active-surface) and
// reads that surface's menu (getAdminMenu), then hands the rail cards to the client editor.
//
// COUPLING — this block does NOT materialize-on-default. The single auto-materialize lives in
// menu-groups; here the client editor ensures the menu row lazily on its first write (adding a card).
// So this block and menu-layout never race the groups block's materialize.
//
// Janitor-only by the module contract: returns null below janitor, so the block is fail-closed.
export async function MenuRailCardsBlock() {
  const profile = await getCallerProfile()
  if (!profile || !isJanitor(profile.webRole)) return null

  const surface = await activeMenuSurface()
  const menu = await getAdminMenu(surface)

  return <MenuRailCardsEditor key={surface} initialMenu={menu} surfaceKey={surface} />
}
