// Comparison / "alternative to X" pages (GE11-1). One template, every "Frequency
// vs X" page generated from the lib/marketing/comparisons registry. Public
// marketing chrome, answer-first copy, real canonical, Article + FAQ + breadcrumb
// JSON-LD. Voice + naming locked (CONTENT-VOICE, NAMING): plain, honest, no em
// dashes, no health claims, the skeptic test. We never knock the other tool.
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ArrowRight, Check } from 'lucide-react'
import {
  PhotoHero,
  Section,
  Lead,
  Body,
  PullQuote,
  FaqList,
  BetaCTA,
  Button,
} from '@/components/marketing/marketing-ui'
import { JsonLd } from '@/components/json-ld'
import { articleSchema, faqSchema, breadcrumbSchema } from '@/lib/jsonld'
import { SITE_NAME } from '@/lib/site'
import {
  COMPARISONS,
  getComparison,
  comparisonCopy,
  comparisonPath,
} from '@/lib/marketing/comparisons'

export const revalidate = 3600

// The whole set is known at build time (a static registry), so pre-render every
// comparison and lock the route to it: an unknown /vs/<x> 404s rather than render
// a thin, made-up page.
export const dynamicParams = false

export function generateStaticParams() {
  return COMPARISONS.map((c) => ({ slug: c.slug }))
}

// A real gathering photo doubles as the multimodal AIO signal + E-E-A-T proof.
const HERO_IMAGE = '/images/site/community-dinner.jpg'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const comparison = getComparison(slug)
  if (!comparison) return { title: 'Not found' }
  const copy = comparisonCopy(comparison)
  const canonical = comparisonPath(slug)
  return {
    title: copy.metaTitle,
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

export default async function ComparisonPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const comparison = getComparison(slug)
  if (!comparison) notFound()
  const copy = comparisonCopy(comparison)
  const path = comparisonPath(slug)

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
            { name: 'Compare', path: '/vs' },
            { name: copy.h1, path },
          ]),
        ]}
      />

      <PhotoHero
        image={HERO_IMAGE}
        alt="Friends gathered around a long table at night, talking and laughing"
        focal="object-center"
        eyebrow={`Alternative to ${comparison.name}`}
        title={copy.h1}
        subtitle={`${comparison.name} is a great ${comparison.category}. Frequency is a different shape: a free local Circle that keeps meeting in person. Here is how they compare.`}
      >
        <Button href="/discover">
          Find a Circle near you <ArrowRight className="h-5 w-5" />
        </Button>
      </PhotoHero>

      {/* Answer-first opening: the honest difference, in the first lines. */}
      <Section tone="canvas" pad="pt-16 pb-16 sm:pt-20 sm:pb-20">
        <Lead>{copy.lede}</Lead>
        <Body>{comparison.forReader}</Body>
      </Section>

      <PullQuote tone="surface">
        The invite is the easy part.{' '}
        <span className="text-primary">The standing room is the thing.</span>
      </PullQuote>

      {/* The scannable contrast. One concept per row; honest about both sides. */}
      <Section tone="surface">
        <h2 className="mb-6 font-display text-3xl uppercase text-text sm:text-4xl">
          {comparison.name} vs Frequency, side by side
        </h2>
        <div className="overflow-hidden rounded-2xl border border-border">
          {/* Header row */}
          <div className="grid grid-cols-3 border-b border-border bg-surface-elevated text-sm font-semibold text-text">
            <div className="px-4 py-3" />
            <div className="px-4 py-3">{comparison.name}</div>
            <div className="px-4 py-3 text-primary-strong">Frequency</div>
          </div>
          {comparison.contrast.map((row, i) => (
            <div
              key={row.dimension}
              className={`grid grid-cols-3 text-sm ${
                i % 2 === 0 ? 'bg-surface' : 'bg-surface-elevated'
              }`}
            >
              <div className="px-4 py-4 font-semibold text-text">{row.dimension}</div>
              <div className="px-4 py-4 text-muted">{row.them}</div>
              <div className="flex items-start gap-2 px-4 py-4 text-text">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary-strong" aria-hidden />
                <span>{row.us}</span>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Soft, honest hand-off into the product. Two doors. */}
      <Section tone="canvas">
        <h2 className="mb-5 font-display text-3xl uppercase text-text sm:text-4xl">
          Where to start
        </h2>
        <Body>
          You can keep using {comparison.name} for what it does well. If you want the
          part it does not do, the small group that keeps meeting, look at the Circles
          already gathering near you, then join one or start your own.
          {comparison.moneyBeat
            ? ' And when you host, one honest price with 0% on your own bookings is the whole deal.'
            : ''}
        </Body>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Button href="/discover">
            Find a Circle near you <ArrowRight className="h-5 w-5" />
          </Button>
          {comparison.moneyBeat ? (
            <Button href="/pricing" variant="secondary">
              See the honest pricing
            </Button>
          ) : (
            <Button href="/the-community" variant="secondary">
              See how Circles work
            </Button>
          )}
        </div>
      </Section>

      {/* FAQ: answer-first pairs, mirrored into the FAQPage schema above. */}
      <Section tone="surface">
        <h2 className="mb-7 font-display text-3xl uppercase text-text sm:text-4xl">
          Common questions
        </h2>
        <FaqList items={copy.faq.map((f) => ({ q: f.q, a: f.a }))} />
      </Section>

      <BetaCTA
        heading="Skip the one-off. Find the room that meets again."
        body="Frequency is free to join during the beta. Find a Circle near you, show up, and come back."
      />
    </>
  )
}
