import { headers } from 'next/headers'
import { resolveTheme } from '@/lib/theme/server/resolve'
import { resolveSpaceForHost } from '@/lib/spaces'
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
  // Mirror the shell's resolution: read the active Space's skin / generation default for this host
  // so the picker reflects true precedence. Fail-safe to the system default on any miss.
  let spaceSkin: string | null = null
  let spaceGeneration: string | null = null
  try {
    const host = (await headers()).get('host')
    const space = await resolveSpaceForHost(host)
    if (space) {
      spaceSkin = space.skin
      spaceGeneration = (space as { generation?: string | null }).generation ?? null
    }
  } catch {
    /* no Space / pre-migration — system defaults */
  }

  const theme = await resolveTheme({ spaceSkin, spaceGeneration })

  return (
    <div>
      <ThemeSwitcher
        initialSkin={theme.skin}
        initialGeneration={theme.generation}
        initialOccasion={theme.occasion}
      />
      <div className="mt-6">
        <ModeSwitcher />
      </div>
    </div>
  )
}
