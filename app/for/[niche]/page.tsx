import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { JsonLd } from '@/components/json-ld'
import { breadcrumbSchema, faqSchema, productSchema } from '@/lib/jsonld'
import { loadPricingInput } from '@/lib/pricing/pricing-input'
import { getFunnelConfig, funnelSlugs } from '@/lib/marketing/funnel-config'
import { NicheFunnel } from '@/components/marketing/funnel/niche-funnel'
import { OG_SITE, ROOT_OG_IMAGES } from '@/lib/site'
import { SITE_DESIGN } from '@/lib/theme/design'
import { NicheDoor } from '@/components/frequency/site/pages/funnel/niche/niche-door'
import { getWhatsOn } from '@/components/frequency/site/pages/shared/data'
import { ROUTES as SITE_PATHS } from '@/lib/frequency/site-nav'

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
    openGraph: { ...OG_SITE, images: ROOT_OG_IMAGES, title: ogTitle, description, url: path, type: 'website' },
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
  // The town's week for the door's calendar strip (hidden when nothing is on). Anonymous read, ISR-safe.
  const week = SITE_DESIGN === 'frequency' ? (await getWhatsOn(3)).events : []

  return (
    <>
      <JsonLd
        data={[
          breadcrumbSchema([
            { name: 'Frequency', path: '/' },
            // The visible breadcrumb on the Frequency body: Home, For spaces, the door.
            { name: 'For spaces', path: SITE_PATHS.spaces },
            { name: config.hero.eyebrow, path },
          ]),
          faqSchema(config.faq.map((f) => ({ q: f.q, a: f.a }))),
          // The Network door quotes no price (the Network plan's number lives on /pricing), so it carries no
          // Offer: a Business rate on a Network page would be a wrong price in search and AI answers (LIVE-1132).
          ...(config.slug === 'networks'
            ? []
            : [
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
              ]),
        ]}
      />
      {/* The Frequency design (ADR-1737): the same config, prices, Start href and schema, in its body. */}
      {SITE_DESIGN === 'frequency' ? <NicheDoor config={config} week={week} /> : <NicheFunnel config={config} />}
    </>
  )
}
