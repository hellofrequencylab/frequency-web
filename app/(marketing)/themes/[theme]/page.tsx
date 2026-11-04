// /themes/[theme] (LIVE-1514): the sales page for one Mega Theme. Bold and Wildheart draw Nocturne's layout with real
// renders (frequency-theme-feature.tsx); every other theme here keeps the generic kit page. A Frequency-only route. Midnight keeps its
// own static page at /themes/nocturne, which wins over this segment. Static: the six other themes are known
// at build time and anything else is a 404.
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { RememberKit } from '@/components/frequency/site/pages/themes/remember-kit'
import { JsonLd } from '@/components/json-ld'
import { frequencyPageJsonLd, frequencyPageMetadata, type FrequencyPageSeo } from '@/lib/seo/frequency-pages'
import { FrequencyThemeKit, THEME_KIT_PAGE_IDS } from '@/components/frequency/site/pages/themes/frequency-theme-kit'
import { FrequencyThemeFeature } from '@/components/frequency/site/pages/themes/frequency-theme-feature'
import { isThemeFeatureId } from '@/lib/themes/theme-feature-data'
import { SITE_THEMES } from '@/lib/theme/site-style'
import { themeIdFromSlug, themeLibraryEntry, themeSlug } from '@/lib/themes/library'
import { themeShareImage } from '@/lib/themes/share-cards'

export const revalidate = 3600
export const dynamicParams = false

export function generateStaticParams() {
  // Designer, Network, Temple, New World, Services and CyberWitch have their own static pages (/themes/designer, /themes/network, /themes/temple, /themes/new-world, /themes/services, /themes/cyberwitch), which win over this segment.
  return THEME_KIT_PAGE_IDS.filter((id: string) => id !== 'designer' && id !== 'network-kit' && id !== 'temple-kit' && id !== 'new-world' && id !== 'services' && id !== 'cyberwitch').map((id) => ({ theme: themeSlug(id) }))
}

// The address is not always the id: the Network Theme Kit (`network-kit`) lives at /themes/network (themeSlug in
// lib/themes/library.ts).
function seoFor(slug: string): FrequencyPageSeo | null {
  const theme = themeIdFromSlug(slug)
  const site = SITE_THEMES.find((t) => t.id === theme)
  const entry = theme ? themeLibraryEntry(theme) : null
  if (!theme || !site || !entry || !THEME_KIT_PAGE_IDS.some((id) => id === site.id)) return null
  return {
    path: `/themes/${slug}`,
    title: `${site.label} theme: ${entry.tagline}`,
    description: `${site.label} gives your website a starting look. See which matching Spotlight and email surfaces are ready, and what is on the way.`,
    shareTitle: `${site.label}: a look to build on`,
    headline: `${site.label}. ${entry.tagline}`,
    lede: `Made for ${entry.madeFor}. ${site.description} See which matching surfaces are ready below.`,
    crumbs: [
      { name: 'Themes', path: '/themes' },
      { name: site.label, path: `/themes/${slug}` },
    ],
    shareImage: themeShareImage(theme),
  }
}

export async function generateMetadata({ params }: { params: Promise<{ theme: string }> }): Promise<Metadata> {
  const seo = seoFor((await params).theme)
  return seo ? frequencyPageMetadata(seo) : {}
}

export default async function ThemeKitPage({ params }: { params: Promise<{ theme: string }> }) {
  const { theme: slug } = await params
  const seo = seoFor(slug)
  const id = themeIdFromSlug(slug)
  if (!seo || !id) notFound()
  return (
    <>
      <JsonLd data={frequencyPageJsonLd(seo)} />
      <RememberKit kit={id} />
      {isThemeFeatureId(id) ? <FrequencyThemeFeature theme={id} /> : <FrequencyThemeKit theme={id} />}
    </>
  )
}
