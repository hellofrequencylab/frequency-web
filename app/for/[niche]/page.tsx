import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { JsonLd } from '@/components/json-ld'
import { breadcrumbSchema, faqSchema, productSchema } from '@/lib/jsonld'
import { loadPricingInput } from '@/lib/pricing/pricing-input'
import { getFunnelConfig, funnelSlugs } from '@/lib/marketing/funnel-config'
import { NicheFunnel } from '@/components/marketing/funnel/niche-funnel'
import { OG_SITE } from '@/lib/site'

// THE OPERATOR FUNNEL DOOR (ADR-591). One chrome-free conversion template, one config per niche. STATIC:
// generated at build from the funnel registry; `dynamicParams=false` so an unknown niche 404s. ISR: the
// config's prices and rates are built from the OPERATOR'S pricing input (loadPricingInput, the same
// reads /pricing and llms.txt make, once per revalidation), so an /admin/pricing edit moves the doors
// with the rest of the marketing surfaces (SCAN-793).
export const revalidate = 3600
export const dynamicParams = false

export function generateStaticParams(): { niche: string }[] {
  return funnelSlugs().map((niche) => ({ niche }))
}

export async function generateMetadata({ params }: { params: Promise<{ niche: string }> }): Promise<Metadata> {
  const { niche } = await params
  const config = getFunnelConfig(niche, await loadPricingInput())
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
    openGraph: { ...OG_SITE, title: ogTitle, description, url: path, type: 'website' },
    twitter: { card: 'summary_large_image', title: ogTitle, description },
  }
}

export default async function FunnelDoorPage({ params }: { params: Promise<{ niche: string }> }) {
  const { niche } = await params
  const input = await loadPricingInput()
  const config = getFunnelConfig(niche, input)
  if (!config) notFound()

  const path = `/for/${niche}`
  // The Offer is the entry price for the niche's plan (the flat Business/Nonprofit founding rate), from
  // the same resolved catalog the copy interpolates.
  const planKey = config.nonprofit ? 'nonprofit_seat' : 'business_base'
  const priceCents = input.catalog[planKey].month.foundingCents

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
            // A founding MONTHLY rate: without the period code the Offer reads as a one-off
            // purchase — the exact lie productSchema's own doc warns about. /pricing passes it.
            billingPeriodCode: 'MON',
            path,
            sellerName: 'Frequency',
          }),
        ]}
      />
      <NicheFunnel config={config} />
    </>
  )
}
