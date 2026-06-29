import { getCallerProfile } from '@/lib/auth'
import { isJanitor } from '@/lib/core/roles'
import { getMenuSettings } from '@/lib/menus/read'
import { AdminSection } from '@/components/templates'
import { SettingsPanel } from '@/components/admin/menu/settings-panel'

// `menu-speed` layout module (ADR-359): the global Open & dwell speed panel (open / dwell / fade).
// A self-fetching RSC that reads the singleton menu_settings row and renders the speed editor. NO
// surface dependency — these timings apply to every mega-menu surface — so unlike the other four
// blocks it never resolves the active surface.
//
// Janitor-only by the module contract: returns null below janitor, so the block is fail-closed.
export async function MenuSpeedBlock() {
  const profile = await getCallerProfile()
  if (!profile || !isJanitor(profile.webRole)) return null

  const settings = await getMenuSettings()

  return (
    <AdminSection
      title="Open & dwell speed"
      description="Global timings for how every mega-menu opens, lingers, and fades."
    >
      <SettingsPanel initial={settings} />
    </AdminSection>
  )
}
