// /themes: the Theme Kits page (LIVE-2188), rebuilt to Daniel's Theme Kits design (design_handoff_theme_kits). A device cloud
// of the nine kits, a sticky look filter, and one full-bleed section per kit drawn in that kit's own design system, each with an
// accent picker and four surfaces (Website, Email, Spotlight, Space page) you can bring to the front or open full size.
// Lead links: the main buttons start the 12 minute launch (the builder while the launch is off), "See the kit" opens that
// kit's own /themes/<theme> page. The page markup and per-kit skins live in ./kit-showcase; Frequency's header and footer come
// from the site shell. Copy follows docs/marketing/voice-and-language-guide.md.
import { createSpaceHref } from '@/lib/create-space/href'
import { isPreviewKit } from '@/lib/create-space/preview-site'
import { launchEntryEnabled } from '@/lib/launch/enabled'
import { freeSpotlightHref } from '@/lib/launch/entry'
import { themePagePath } from '@/lib/themes/library'
import { LastKitLink } from './last-kit-link'
import { KitShowcase } from './kit-showcase/kit-showcase'
import type { ShowcaseLinks } from './kit-showcase/use-kit-showcase'

/** The design's nine kits, each against the theme id the product knows it by. Every kit has its own page now. */
const KIT_THEMES: Record<string, { theme: string | null; slug: string }> = {
  'new-world': { theme: 'new-world', slug: 'new-world' },
  network: { theme: 'network-kit', slug: 'network' },
  services: { theme: 'services', slug: 'services' },
  designer: { theme: 'designer', slug: 'designer' },
  bold: { theme: 'bold', slug: 'bold' },
  temple: { theme: 'temple-kit', slug: 'temple' },
  cyberwitch: { theme: 'cyberwitch', slug: 'cyberwitch' },
  wildheart: { theme: 'wildheart', slug: 'wildheart' },
  nocturne: { theme: 'midnight', slug: 'nocturne' },
}

export function themeShowcaseLinks(): ShowcaseLinks {
  const launch = launchEntryEnabled()
  const kits: ShowcaseLinks['kits'] = {}
  for (const [id, k] of Object.entries(KIT_THEMES)) {
    kits[id] = {
      // null: the builder does not offer this kit (hidden, or no theme yet), so "Use" is hidden rather than start the
      // visitor on a different look.
      use: k.theme && isPreviewKit(k.theme) ? (launch ? freeSpotlightHref('themes', k.slug, k.theme) : createSpaceHref(k.theme)) : null,
      page: k.theme ? themePagePath(k.theme) : null,
      kit: k.theme && isPreviewKit(k.theme) ? k.theme : null,
      theme: k.theme,
    }
  }
  return { start: launch ? freeSpotlightHref('themes') : createSpaceHref(), plans: '/pricing', kits }
}

export function FrequencyThemes() {
  return (
    <>
      <KitShowcase links={themeShowcaseLinks()} />
      <LastKitLink />
    </>
  )
}


