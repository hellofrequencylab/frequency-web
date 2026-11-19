// /themes/free-human (LIVE-2408): the feature page for the Honey theme (code id `free-human`, owner 2026-11-18: "Change the theme name to
// honey"), on Nocturne's layout with a real render of every surface (frequency-theme-feature.tsx). A Frequency-only route; a static
// segment wins over /themes/[theme]. Its words come from THEME_FEATURES['free-human'], so the SEO lives here, the way /themes/mindless does.
import type { Metadata } from 'next'
import { RememberKit } from '@/components/frequency/site/pages/themes/remember-kit'
import { JsonLd } from '@/components/json-ld'
import { frequencyPageJsonLd, frequencyPageMetadata, type FrequencyPageSeo } from '@/lib/seo/frequency-pages'
import { FrequencyThemeFeature } from '@/components/frequency/site/pages/themes/frequency-theme-feature'
import { themeShareImage } from '@/lib/themes/share-cards'

export const revalidate = 3600

const SEO: FrequencyPageSeo = {
  path: '/themes/free-human',
  title: 'Honey: limewash, honey light and a gilt arch',
  description:
    'A warm, slow theme with a gilt arch and one madder accent, for movement, ritual and retreats. Your Spotlight, Space, website and emails match.',
  shareTitle: 'Honey: limewash, honey light and a gilt arch',
  headline: 'Limewash, honey light and a gilt arch.',
  lede: 'Some work is slow on purpose. Honey is warm light, a gilt arch and one madder accent, read from one profile across your website, Spotlight, Space and emails.',
  crumbs: [
    { name: 'For Spaces', path: '/spaces' },
    { name: 'Themes', path: '/themes' },
    { name: 'Honey', path: '/themes/free-human' },
  ],
  shareImage: themeShareImage('free-human'),
}

export const metadata: Metadata = frequencyPageMetadata(SEO)

export default function HoneyThemePage() {
  return (
    <>
      <JsonLd data={frequencyPageJsonLd(SEO)} />
      <RememberKit kit="free-human" />
      <FrequencyThemeFeature theme="free-human" />
    </>
  )
}
