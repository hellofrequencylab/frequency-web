import { resolveTheme } from '@/lib/theme/server/resolve'
import { ModeSwitcher } from '../mode-switcher'
import { ThemeSwitcher } from './theme-switcher'

// The Appearance SECTION of the unified Settings page (DAWN 2 screen pass). This is the
// server half that used to be app/(main)/settings/appearance/page.tsx: it resolves the
// member's CURRENT theme axes the exact same way the shell does (cookie over Space
// default over system default) so the picker opens on what is actually rendering, then
// hands those to the client switcher (the skin picker leads, per the reference screen).
// Light/dark MODE is the separate localStorage toggle (ModeSwitcher), composed below the
// server-resolved axes. The old /settings/appearance route now redirects here.

export async function AppearanceSection() {
  const theme = await resolveTheme()

  return (
    <div>
      <ThemeSwitcher initialSkin={theme.skin} />
      <div className="mt-6">
        <ModeSwitcher />
      </div>
    </div>
  )
}
