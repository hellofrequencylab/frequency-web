import type { WebsiteChrome, WebsiteTheme } from '@/lib/sites/editor/state'
import type { SiteLook } from '@/lib/theme/site-style'
import type { MegaCoreNicheId, MegaNicheId } from '@/lib/theme/mega-theme'

// A kit is a niche starting point (ADR-1726 layering): pages with sample copy, written into a site's
// draft ONCE. It holds no colours or fonts (the theme owns those) and leaves no live link behind.

/** A kit's niche is one of the Mega Theme niches (lib/theme/mega-theme.ts): the six core doors every theme
 *  hand-writes a kit for, plus the profiles whose kits derive from niche-spec.ts. */
export type KitNiche = MegaNicheId
/** The six niches every theme carries a hand-written kit for. */
export type CoreKitNiche = MegaCoreNicheId

interface KitBlock { type: string; props?: Record<string, unknown> }
export interface KitPage {
  slug: string
  label: string
  seo: { title: string; description: string }
  blocks: KitBlock[]
}
export interface SiteKit {
  id: string
  /** Bumped when the kit's content changes, so a site can say which version it started from. */
  version: number
  theme: WebsiteTheme
  niche: KitNiche
  label: string
  description: string
  /** Global styles the kit suggests; anything left out stays the theme's own. */
  look?: Partial<SiteLook>
  /** The accent a profile kit starts a site in (a Temple profile's own clay, olive, aegean...). "Replace my pages" writes it
   *  only when the site has not chosen an accent of its own; "Add its pages" and "Change the look only" never touch it. */
  accent?: string
  chrome?: WebsiteChrome
  pages: KitPage[]
}

/** theme: change the look only. add: append the kit's pages next to the site's. replace: swap every page. */
export type KitApplyMode = 'theme' | 'add' | 'replace'
