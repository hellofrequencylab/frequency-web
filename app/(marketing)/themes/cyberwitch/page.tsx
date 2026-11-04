// /themes/cyberwitch (LIVE-2111): the feature page for the CyberWitch theme, on Nocturne's layout with a real render of every surface
// (frequency-theme-feature.tsx). A Frequency-only route; a static segment wins over /themes/[theme]. CyberWitch is registered but not
// offered in the pickers yet, so the page stays out of search and the sitemap until it is, the way /themes/services does.
// Its words come from THEME_FEATURES.cyberwitch, so the SEO lives here, the way /themes/[theme] builds Bold's and Wildheart's.
import type { Metadata } from 'next'
import { RememberKit } from '@/components/frequency/site/pages/themes/remember-kit'
import { JsonLd } from '@/components/json-ld'
import { frequencyPageJsonLd, frequencyPageMetadata, type FrequencyPageSeo } from '@/lib/seo/frequency-pages'
import { FrequencyThemeFeature } from '@/components/frequency/site/pages/themes/frequency-theme-feature'

export const revalidate = 3600

const SEO: FrequencyPageSeo = {
  path: '/themes/cyberwitch',
  title: 'CyberWitch: a dark look with some edge',
  description:
    'A dark, industrial theme with blackletter headlines and one neon accent, for work with an edge. Your Spotlight, Space, website and emails wear one look.',
  shareTitle: 'CyberWitch: a dark look with some edge',
  headline: 'Concrete, chain-link and a spell book.',
  lede: 'Plain and polite gets scrolled past. CyberWitch is a dark look with a blackletter headline and one neon accent, read from one profile across your website, Spotlight, Space and emails.',
  crumbs: [
    { name: 'For Spaces', path: '/spaces' },
    { name: 'Themes', path: '/themes' },
    { name: 'CyberWitch', path: '/themes/cyberwitch' },
  ],
}

export const metadata: Metadata = frequencyPageMetadata(SEO)

export default function CyberWitchThemePage() {
  return (
    <>
      <JsonLd data={frequencyPageJsonLd(SEO)} />
      <RememberKit kit="cyberwitch" />
      <FrequencyThemeFeature theme="cyberwitch" />
    </>
  )
}
