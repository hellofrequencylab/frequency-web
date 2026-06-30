import { FocusTemplate } from '@/components/templates'
import { resolveTheme } from '@/lib/theme/server/resolve'
import { resolveSpaceForHost } from '@/lib/spaces'
import { headers } from 'next/headers'
import { ThemeSwitcher } from './theme-switcher'

// Appearance settings: the member-facing theme switcher (BUILD-CATALOG §A.13 #1, docs/THEME.md).
// This is the UI that finally writes the `fxtheme` cookie. It resolves the member's CURRENT axes
// the exact same way the shell does (cookie over Space default over system default) so the picker
// opens on what is actually rendering, then hands those to the client switcher. Light/dark MODE is
// the separate localStorage toggle on the Settings home; this surface owns the three server-
// resolved axes (palette / feel / seasonal accent).

export const metadata = {
  title: 'Appearance',
  description: 'Choose how Frequency looks for you.',
}

export default async function AppearancePage() {
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
    <FocusTemplate
      title="Appearance"
      description="Pick the palette, feel, and seasonal accent. Changes save instantly."
      back={{ href: '/settings', label: 'Settings' }}
    >
      <ThemeSwitcher
        initialSkin={theme.skin}
        initialGeneration={theme.generation}
        initialOccasion={theme.occasion}
      />
    </FocusTemplate>
  )
}
