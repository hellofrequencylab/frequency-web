// /themes/services (LIVE-2130): the feature page for the Services theme, on Nocturne's layout with a real render of every surface
// (frequency-theme-feature.tsx). A Frequency-only route; a static segment wins over /themes/[theme]. Services is offered in the
// pickers (LIVE-1996, owner 2026-11-04), so the page is indexed and in the sitemap.
// Its words come from THEME_FEATURES.services, so the SEO lives here, the way /themes/[theme] builds Bold's and Wildheart's.
import type { Metadata } from 'next'
import { RememberKit } from '@/components/frequency/site/pages/themes/remember-kit'
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

export const metadata: Metadata = frequencyPageMetadata(SEO)

export default function ServicesThemePage() {
  return (
    <>
      <JsonLd data={frequencyPageJsonLd(SEO)} />
      <RememberKit kit="services" />
      <FrequencyThemeFeature theme="services" />
    </>
  )
}
