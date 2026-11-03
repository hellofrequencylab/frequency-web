// /themes/services (LIVE-2121): the feature page for the Services theme, on Nocturne's layout with a real render of every surface
// (frequency-theme-feature.tsx). A Frequency-only route; a static segment wins over /themes/[theme]. Services is registered but not
// offered in the pickers yet, so the page stays out of search and the sitemap until it is, the way /themes/new-world did (#4544).
// Its words come from THEME_FEATURES.services, so the SEO lives here, the way /themes/[theme] builds Bold's and Wildheart's.
import type { Metadata } from 'next'
import { JsonLd } from '@/components/json-ld'
import { frequencyPageJsonLd, frequencyPageMetadata, type FrequencyPageSeo } from '@/lib/seo/frequency-pages'
import { FrequencyThemeFeature } from '@/components/frequency/site/pages/themes/frequency-theme-feature'

export const revalidate = 3600

const SEO: FrequencyPageSeo = {
  path: '/themes/services',
  title: 'Services: good work, done right, booked in a tap',
  description:
    'Services is a glossy night theme with a day register for people who book, sell and show up for clients. Your Spotlight, Space, website and emails wear one look.',
  shareTitle: 'Services: good work, done right',
  headline: 'Good work, done right. Booked in a tap.',
  lede: 'People pick the one they trust, and they decide fast. Services puts your prices, your hours and a book button up front, with a glossy night look and a day register for bright rooms, read from one profile.',
  crumbs: [
    { name: 'For Spaces', path: '/spaces' },
    { name: 'Themes', path: '/themes' },
    { name: 'Services', path: '/themes/services' },
  ],
}

export const metadata: Metadata = { ...frequencyPageMetadata(SEO), robots: { index: false, follow: true } }

export default function ServicesThemePage() {
  return (
    <>
      <JsonLd data={frequencyPageJsonLd(SEO)} />
      <FrequencyThemeFeature theme="services" />
    </>
  )
}
