// /themes/mindless (LIVE-2311): the feature page for the Mindless theme, on Nocturne's layout with a real render of every surface
// (frequency-theme-feature.tsx). A Frequency-only route; a static segment wins over /themes/[theme]. Mindless is offered in the
// pickers (LIVE-2407), so the page is in search and the sitemap, the way /themes/cyberwitch is.
// Its words come from THEME_FEATURES.mindless, so the SEO lives here, the way /themes/[theme] builds Bold's and Wildheart's.
import type { Metadata } from 'next'
import { RememberKit } from '@/components/frequency/site/pages/themes/remember-kit'
import { JsonLd } from '@/components/json-ld'
import { frequencyPageJsonLd, frequencyPageMetadata, type FrequencyPageSeo } from '@/lib/seo/frequency-pages'
import { FrequencyThemeFeature } from '@/components/frequency/site/pages/themes/frequency-theme-feature'
import { themeShareImage } from '@/lib/themes/share-cards'

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
  shareImage: themeShareImage('mindless'),
}

export const metadata: Metadata = frequencyPageMetadata(SEO)

export default function MindlessThemePage() {
  return (
    <>
      <JsonLd data={frequencyPageJsonLd(SEO)} />
      <RememberKit kit="mindless" />
      <FrequencyThemeFeature theme="mindless" />
    </>
  )
}
