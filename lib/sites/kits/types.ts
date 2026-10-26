import type { WebsiteChrome, WebsiteTheme } from '@/lib/sites/editor/state'
import type { SiteLook } from '@/lib/theme/site-style'

// A kit is a niche starting point (ADR-1726 layering): pages with sample copy, written into a site's
// draft ONCE. It holds no colours or fonts (the theme owns those) and leaves no live link behind.

export type KitNiche = 'coaches' | 'studios' | 'hosts' | 'venues' | 'nonprofits' | 'networks'

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
  chrome?: WebsiteChrome
  pages: KitPage[]
}

/** theme: change the look only. add: append the kit's pages next to the site's. replace: swap every page. */
export type KitApplyMode = 'theme' | 'add' | 'replace'
