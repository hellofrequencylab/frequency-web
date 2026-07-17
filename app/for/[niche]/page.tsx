import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { JsonLd } from '@/components/json-ld'
import { breadcrumbSchema, faqSchema, productSchema } from '@/lib/jsonld'
import { catalogItem } from '@/lib/billing/pricing-keys'
import { getFunnelConfig, funnelSlugs } from '@/lib/marketing/funnel-config'
import { NicheFunnel } from '@/components/marketing/funnel/niche-funnel'

// THE OPERATOR FUNNEL DOOR (ADR-591). One chrome-free conversion template, one config per niche. STATIC:
// generated at build from the funnel registry; `dynamicParams=false` so an unknown niche 404s. Reads only
// the code catalog + the config (no per-request DB), so it stays fully static/ISR.
export const revalidate = 3600
export const dynamicParams = false

export function generateStaticParams(): { niche: string }[] {
  return funnelSlugs().map((niche) => ({ niche }))
}

export async function generateMetadata({ params }: { params: Promise<{ niche: string }> }): Promise<Metadata> {
  const { niche } = await params
  const config = getFunnelConfig(niche)
  if (!config) return {}
  const { hero } = config
  // The <title> leads with the niche keyword (the h1 is a benefit line); OG/Twitter keep the fuller
  // headline. The meta description is answer-first and length-safe, falling back to the hero subhead.
  const pageTitle = hero.seoTitle ?? hero.h1
  const ogTitle = `${hero.h1} ${hero.eyebrow}`
  const description = config.metaDescription ?? hero.subhead
  const path = `/for/${niche}`
  return {
    title: pageTitle,
    description,
    alternates: { canonical: path },
    openGraph: { title: ogTitle, description, url: path, type: 'website' },
    twitter: { card: 'summary_large_image', title: ogTitle, description },
  }
}

export default async function FunnelDoorPage({ params }: { params: Promise<{ niche: string }> }) {
  const { niche } = await params
  const config = getFunnelConfig(niche)
  if (!config) notFound()

  const path = `/for/${niche}`
  // The Offer is the entry price for the niche's plan (the flat Business/Nonprofit founding rate).
  const planKey = config.nonprofit ? 'nonprofit_seat' : 'business_base'
  const priceCents = catalogItem(planKey).month.foundingCents

  return (
    <>
      <JsonLd
        data={[
          breadcrumbSchema([
            { name: 'Frequency', path: '/' },
            { name: config.hero.eyebrow, path },
          ]),
          faqSchema(config.faq.map((f) => ({ q: f.q, a: f.a }))),
          productSchema({
            title: `Frequency ${config.nonprofit ? 'Non Profit' : 'Business'}`,
            description: config.hero.subhead,
            priceCents,
            currency: 'usd',
            path,
            sellerName: 'Frequency',
          }),
        ]}
      />
      <NicheFunnel config={config} />
    </>
  )
}
