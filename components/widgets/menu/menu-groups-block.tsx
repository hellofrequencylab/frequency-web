import { getCallerProfile } from '@/lib/auth'
import { isJanitor } from '@/lib/core/roles'
import { getAdminMenu } from '@/lib/menus/read'
import { activeMenuSurface } from '@/lib/menus/active-surface'
import { MenuGroupsEditor } from '@/components/admin/menu/menu-groups-editor'

// `menu-groups` layout module (ADR-359): the Menu-level (root) links + groups with their link
// blocks — the BULK of the navigation editor. A self-fetching RSC that resolves the active surface
// (lib/menus/active-surface) and reads that surface's menu (getAdminMenu, with the empty-row→default
// fallback), then hands it to the client editor (groups/sub-groups, drag/drop within and across
// groups, per-item depth, modes, the per-role matrix).
//
// COUPLING — this is the ONLY block that auto-materializes the code defaults into real DB rows on
// open (the client editor owns that one-time materialize). The sibling surface-scoped blocks
// (menu-layout, menu-rail-cards) only read getAdminMenu and ensure the menu row lazily on their own
// first write, so three blocks never race seedMenuFromDefaults.
//
// Janitor-only by the module contract: returns null below janitor, so the block is fail-closed.
export async function MenuGroupsBlock() {
  const profile = await getCallerProfile()
  if (!profile || !isJanitor(profile.webRole)) return null

  const surface = await activeMenuSurface()
  const menu = await getAdminMenu(surface)

  // Key by surface so a re-scope remounts the client editor with fresh state + its one-time
  // materialize effect.
  return <MenuGroupsEditor key={surface} initialMenu={menu} surfaceKey={surface} />
}
