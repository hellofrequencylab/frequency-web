import { getCallerProfile } from '@/lib/auth'
import { isJanitor } from '@/lib/core/roles'
import { getAdminMenu, getMenuSettings, MENU_SURFACES } from '@/lib/menus/read'
import type { MenuSurfaceKey, ResolvedMenu } from '@/lib/menus/types'
import { MenuManager } from '@/components/admin/menu/menu-manager'

// Menu Manager layout module (ADR-270/294): the whole DB-backed navigation editor as one
// assignable block. A self-fetching RSC — it reads every surface's resolved menu plus the
// global speed settings server-side (all five surfaces in parallel), then hands them to the
// client builder, which drives the full CRUD in lib/menus/actions (surface picker, groups and
// links, drag and drop, role matrix, on/off modes, rail cards, columns, speed, seed).
//
// Why ONE module, not several: the surface picker, the per-surface editor, and the speed panel
// share live client state (the active surface), and the editor is one cohesive client tool that
// owns its own two-thirds / one-third layout. Splitting it would break that coupling and the
// shared status line, so the whole tool is one coupled block (the same call /journal, /programs,
// and /library/review make for a single self-contained interior). It still composes the framework:
// an operator places, reorders, hides, or role-gates it from the on-page Layout panel.
//
// Janitor-only by the module contract: the page already gates entry with requireAdmin('janitor'),
// and this returns null for anyone below janitor so the block is fail-closed wherever it is placed.
export async function MenuManagerBlock() {
  const profile = await getCallerProfile()
  if (!profile || !isJanitor(profile.webRole)) return null

  const [settings, ...resolved] = await Promise.all([
    getMenuSettings(),
    ...MENU_SURFACES.map((s) => getAdminMenu(s.key)),
  ])

  const menus = MENU_SURFACES.reduce(
    (acc, s, i) => {
      acc[s.key] = resolved[i]
      return acc
    },
    {} as Record<MenuSurfaceKey, ResolvedMenu>,
  )

  return <MenuManager surfaces={MENU_SURFACES} menus={menus} settings={settings} />
}
