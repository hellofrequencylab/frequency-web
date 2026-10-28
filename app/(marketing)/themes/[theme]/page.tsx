// /themes/[theme] (LIVE-1514): the sales page for one Mega Theme. A Frequency-only route. Midnight keeps its
// own static page at /themes/nocturne, which wins over this segment. Static: the six other themes are known
// at build time and anything else is a 404.
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { JsonLd } from '@/components/json-ld'
import { frequencyPageJsonLd, frequencyPageMetadata, type FrequencyPageSeo } from '@/lib/seo/frequency-pages'
import { FrequencyThemeKit, THEME_KIT_PAGE_IDS } from '@/components/frequency/site/pages/themes/frequency-theme-kit'
import { SITE_THEMES } from '@/lib/theme/site-style'
import { themeLibraryEntry } from '@/lib/themes/library'

export const revalidate = 3600
export const dynamicParams = false

export function generateStaticParams() {
  return THEME_KIT_PAGE_IDS.map((theme) => ({ theme }))
}

function seoFor(theme: string): FrequencyPageSeo | null {
  const site = SITE_THEMES.find((t) => t.id === theme)
  const entry = themeLibraryEntry(theme)
  if (!site || !entry || !THEME_KIT_PAGE_IDS.some((id) => id === site.id)) return null
  return {
    path: `/themes/${theme}`,
    title: `${site.label} theme: ${entry.tagline}`,
    description: `${site.label} gives your website a starting look. See which matching Spotlight and email surfaces are ready, and what is on the way.`,
    shareTitle: `${site.label}: a look to build on`,
    headline: `${site.label}. ${entry.tagline}`,
    lede: `Made for ${entry.madeFor}. ${site.description} See which matching surfaces are ready below.`,
    crumbs: [
      { name: 'Themes', path: '/themes' },
      { name: site.label, path: `/themes/${theme}` },
    ],
  }
}

export async function generateMetadata({ params }: { params: Promise<{ theme: string }> }): Promise<Metadata> {
  const seo = seoFor((await params).theme)
  return seo ? frequencyPageMetadata(seo) : {}
}

export default async function ThemeKitPage({ params }: { params: Promise<{ theme: string }> }) {
  const { theme } = await params
  const seo = seoFor(theme)
  if (!seo) notFound()
  return (
    <>
      <JsonLd data={frequencyPageJsonLd(seo)} />
      <FrequencyThemeKit theme={theme} />
    </>
  )
}
