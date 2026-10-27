// A new Space's first website (LIVE-1533, SYS-8). When the owner picked a look, the Space gets that theme's
// General kit as its published site, so one theme id reaches the website, email, Spotlight and Space page and a
// loading site exists the moment the Space does. Best-effort and logged, like the rest of a Space's birth: a
// failure never blocks the Space, and the owner can pick a kit from the editor. Never replaces a website the
// Space already has (the save is written against revision 0). The kit's blocks stay flagged `sample`, so the
// editor still shows what needs the owner's words.

import { isMegaThemeId, type MegaThemeId } from '@/lib/theme/mega-theme'
import { nextWebsiteState } from '@/lib/sites/editor/state'

/** The kit id for a theme's niche-free General kit (`default-general`, `bold-general`, ...). PURE. */
export function generalKitId(theme: MegaThemeId): string {
  return `${theme === 'frequency' ? 'default' : theme}-general`
}

/** Publish the General kit of `theme` as a new Space's first website. Returns whether it landed. */
export async function publishStarterSite(spaceId: string, theme: string | null | undefined): Promise<boolean> {
  if (!spaceId || !isMegaThemeId(theme)) return false
  try {
    const [{ loadKit }, { applyKit }, { config }, { getSpaceById, saveStarterWebsiteState }, { refreshSite }] = await Promise.all([
      import('@/lib/sites/kits/registry'),
      import('@/lib/sites/kits/apply'),
      import('@/lib/page-editor/config'),
      import('@/lib/spaces/store'),
      import('@/lib/sites/site-cache'),
    ])
    const kit = await loadKit(generalKitId(theme))
    if (!kit) return false
    const applied = applyKit({ theme: kit.theme, pages: [] }, kit, 'replace', (type) => config.components[type]?.defaultProps)
    if (!applied.ok) { console.error(`[starter-site] ${kit.id}: ${applied.error}`); return false }
    const state = nextWebsiteState({ v: 1, revision: 0, draft: applied.snapshot, published: null, versions: [] }, applied.snapshot, true, 'Frequency')
    const landed = await saveStarterWebsiteState(spaceId, state)
    if (landed) {
      const space = await getSpaceById(spaceId)
      if (space) refreshSite(space.slug)
    }
    return landed
  } catch (err) {
    console.error('[starter-site] could not publish the starter website', err)
    return false
  }
}
