// Per-Mode persona / package landing pages (Phase F2, Modes M5). One template, every "Frequency for X"
// page generated from the lib/marketing/personas registry. Public marketing chrome, answer-first copy,
// the recommended loadout + founding price (read from the same CODE catalog the pricing table renders,
// so the figures never drift), a real canonical, OG/Twitter meta, and Article + FAQ + breadcrumb
// JSON-LD. Voice + naming locked (CONTENT-VOICE §10, NAMING): plain, honest, no em dashes, no health
// claims, the skeptic test. We name what the product is and never knock an alternative.
//
// FAST: fully static. dynamicParams=false locks the route to the registry, so an unknown /for/<x> 404s
// rather than render a thin, made-up page. No DB, no per-request billing read.
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ArrowRight, Check } from 'lucide-react'
import {
  PhotoHero,
  Section,
  Lead,
  Body,
  FaqList,
  BetaCTA,
  Button,
} from '@/components/marketing/marketing-ui'
import { JsonLd } from '@/components/json-ld'
import { articleSchema, faqSchema, breadcrumbSchema, productSchema } from '@/lib/jsonld'
import { SITE_NAME } from '@/lib/site'
import {
  PERSONAS,
  getPersona,
  personaCopy,
  personaLoadout,
  addonLabel,
} from '@/lib/marketing/personas'
import { personaPath, tierListAnchor, pricingTiers } from '@/lib/pricing/pricing-page'

export const revalidate = 3600

// The whole set is known at build time (a static registry), so pre-render every persona and lock the
// route to it: an unknown /for/<x> 404s rather than render a thin page.
export const dynamicParams = false

export function generateStaticParams() {
  return PERSONAS.map((p) => ({ persona: p.slug }))
}

const HERO_IMAGE = '/images/site/lab-lounge.jpg'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ persona: string }>
}): Promise<Metadata> {
  const { persona: slug } = await params
  const persona = getPersona(slug)
  if (!persona) return { title: 'Not found' }
  const copy = personaCopy(persona)
  const canonical = personaPath(slug)
  return {
    title: copy.h1,
    description: copy.description,
    alternates: { canonical },
    openGraph: {
      title: `${copy.ogTitle} · ${SITE_NAME}`,
      description: copy.description,
      url: canonical,
      type: 'article',
      images: [{ url: HERO_IMAGE }],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${copy.ogTitle} · ${SITE_NAME}`,
      description: copy.description,
    },
  }
}

export default async function PersonaPage({
  params,
}: {
  params: Promise<{ persona: string }>
}) {
  const { persona: slug } = await params
  const persona = getPersona(slug)
  if (!persona) notFound()
  const copy = personaCopy(persona)
  const path = personaPath(slug)
  const loadout = personaLoadout(persona)

  // The headline figure: the per-seat Non Profit headline or the computed Business loadout total.
  const headline = loadout.totalLabel
  const businessTier = pricingTiers().find((t) => t.id === 'business')!
  const proAnchor = tierListAnchor(businessTier, 'month')

  return (
    <>
      <JsonLd
        data={[
          articleSchema({
            title: copy.metaTitle,
            description: copy.description,
            path,
            image: HERO_IMAGE,
          }),
          faqSchema(copy.faq),
          breadcrumbSchema([
            { name: 'Pricing', path: '/pricing' },
            { name: copy.h1, path },
          ]),
          // A Product/Offer for this loadout, priced at the monthly founding total (the real price
          // today). For the per-seat Nonprofit, the offer is the per-seat amount.
          productSchema({
            title: `Frequency for ${persona.audience}`,
            description: persona.focus,
            priceCents: loadout.total.foundingCents,
            currency: 'usd',
            path,
            sellerName: 'Frequency',
          }),
        ]}
      />

      <PhotoHero
        image={HERO_IMAGE}
        alt="The connection bar inside The Lab, warm and low-lit"
        focal="object-center"
        eyebrow={`Frequency for ${persona.audience}`}
        title={copy.h1}
        subtitle={persona.focus}
      >
        <Button href="/spaces">
          Start a Space <ArrowRight className="h-5 w-5" />
        </Button>
      </PhotoHero>

      {/* Answer-first opening: what the package focus is, plainly. */}
      <Section tone="canvas" pad="pt-16 pb-12 sm:pt-20 sm:pb-14">
        <Lead>{copy.lede}</Lead>
      </Section>

      {/* The recommended loadout + founding price, the headline figure. */}
      <Section tone="surface">
        <div className="mx-auto max-w-2xl rounded-2xl border border-border bg-surface p-7 sm:p-8">
          <p className="text-sm font-bold uppercase tracking-[0.25em] text-primary-strong">
            Recommended loadout
          </p>
          <div className="mt-3 flex items-baseline gap-3">
            {!loadout.perSeat && proAnchor && (
              <span className="text-lg text-subtle line-through">{proAnchor}</span>
            )}
            <span className="font-display text-text text-5xl leading-none">{headline}</span>
          </div>
          <p className="mt-1 text-sm text-primary-strong">Founding price</p>
          <p className="mt-4 text-base leading-relaxed text-muted">{copy.loadoutLine}</p>

          {loadout.addons.length > 0 && (
            <ul className="mt-5 space-y-2">
              <li className="flex items-center gap-2 text-sm text-text">
                <Check className="h-4 w-4 shrink-0 text-success" aria-hidden /> Business
              </li>
              {loadout.addons.map((a) => (
                <li key={a} className="flex items-center gap-2 text-sm text-text">
                  <Check className="h-4 w-4 shrink-0 text-success" aria-hidden /> {addonLabel(a)} add-on
                </li>
              ))}
            </ul>
          )}

          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <Button href="/spaces">
              Start a Space <ArrowRight className="h-5 w-5" />
            </Button>
            <Button href="/pricing" variant="secondary">
              See the full table
            </Button>
          </div>
        </div>
      </Section>

      {/* What is included, the concrete capability lines. */}
      <Section tone="canvas">
        <h2 className="mb-7 font-display text-3xl uppercase text-text sm:text-4xl">What you get</h2>
        <ul className="grid gap-4 sm:grid-cols-2">
          {persona.highlights.map((h) => (
            <li
              key={h}
              className="flex items-start gap-3 rounded-2xl border border-border bg-surface p-5"
            >
              <Check className="mt-0.5 h-5 w-5 shrink-0 text-primary-strong" aria-hidden />
              <span className="text-base leading-relaxed text-text">{h}</span>
            </li>
          ))}
        </ul>
        <Body>
          Every Frequency Space can use every module. The setup above is the front door for{' '}
          {persona.audience.toLowerCase()}, not a limit: you can turn the Resonance Engine on or off as
          your work changes, and your people are always yours to export.
        </Body>
      </Section>

      {/* FAQ: answer-first pairs, mirrored into the FAQPage schema above. */}
      <Section tone="surface">
        <h2 className="mb-7 font-display text-3xl uppercase text-text sm:text-4xl">Common questions</h2>
        <FaqList items={copy.faq.map((f) => ({ q: f.q, a: f.a }))} />
      </Section>

      <BetaCTA
        heading="Run your Space on Frequency."
        body="One honest price, never per seat. Turn the Resonance Engine on when you want live matches, and your people are always yours to export."
      />
    </>
  )
}
