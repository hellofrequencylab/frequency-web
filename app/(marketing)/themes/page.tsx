// /themes (LIVE-1460): the theme gallery. Every Mega Theme on one page with what it feels like, which
// starter kits it has, and a door to start with it. A Frequency-only route, like /themes/nocturne.
// app/sitemap.ts lists it. Static: no request data.
import type { Metadata } from 'next'
import { JsonLd } from '@/components/json-ld'
import { FREQUENCY_PAGE_SEO, frequencyPageJsonLd, frequencyPageMetadata } from '@/lib/seo/frequency-pages'
import { FrequencyThemes } from '@/components/frequency/site/pages/themes/frequency-themes'

export const revalidate = 3600

export const metadata: Metadata = frequencyPageMetadata(FREQUENCY_PAGE_SEO.themes)

export default function ThemesPage() {
  return (
    <>
      <JsonLd data={frequencyPageJsonLd(FREQUENCY_PAGE_SEO.themes)} />
      <FrequencyThemes />
    </>
  )
}
