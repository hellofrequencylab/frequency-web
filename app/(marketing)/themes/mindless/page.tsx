// /themes/mindless (LIVE-2311): the feature page for the Mindless theme, on Nocturne's layout with a real render of every surface
// (frequency-theme-feature.tsx). A Frequency-only route; a static segment wins over /themes/[theme]. Mindless is registered but not
// offered in the pickers yet, so the page stays out of search and the sitemap until it is, the way /themes/cyberwitch did.
// Its words come from THEME_FEATURES.mindless, so the SEO lives here, the way /themes/[theme] builds Bold's and Wildheart's.
import type { Metadata } from 'next'
import { RememberKit } from '@/components/frequency/site/pages/themes/remember-kit'
import { JsonLd } from '@/components/json-ld'
import { frequencyPageJsonLd, frequencyPageMetadata, type FrequencyPageSeo } from '@/lib/seo/frequency-pages'
import { FrequencyThemeFeature } from '@/components/frequency/site/pages/themes/frequency-theme-feature'

export const revalidate = 3600

const SEO: FrequencyPageSeo = {
  path: '/themes/mindless',
  title: 'Mindless: a calm look for loud lives',
  description:
    'A warm dark theme with a drip headline and one paint accent, for meditation circles, guides and programs. Your Spotlight, Space, website and emails match.',
  shareTitle: 'Mindless: a calm look for loud lives',
  headline: 'Warm ink, bone and one paint.',
  lede: 'Calm does not have to look soft. Mindless is a warm dark look with a drip headline and one paint accent, read from one profile across your website, Spotlight, Space and emails.',
  crumbs: [
    { name: 'For Spaces', path: '/spaces' },
    { name: 'Themes', path: '/themes' },
    { name: 'Mindless', path: '/themes/mindless' },
  ],
}

export const metadata: Metadata = { ...frequencyPageMetadata(SEO), robots: { index: false, follow: true } }

export default function MindlessThemePage() {
  return (
    <>
      <JsonLd data={frequencyPageJsonLd(SEO)} />
      <RememberKit kit="mindless" />
      <FrequencyThemeFeature theme="mindless" />
    </>
  )
}
