import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PhotoHero, Statement, Section, Button } from '@/components/marketing/marketing-ui'
import { BETA_SEQUENCES, getSequence } from '@/lib/onboarding/beta-sequences'
import { getSplashOverride } from '@/lib/onboarding/sequence-overrides'

// Per-audience beta splash for CODE-shipped sequences: a shareable URL
// (/beta/<slug>) whose copy + CTA carry the audience into the induction (?seq=).
// The three original launch templates retired with the onboarding-splash overhaul.
//
// 🔴 THIS ROUTE IS LIVE — do not delete it as dead. BETA_SEQUENCES is NOT empty:
// it carries `breathwork`, the ADR-619 feature funnel, so /beta/breathwork
// prerenders and serves. (The comment here used to say the registry was empty,
// which is exactly why a deletion sweep proposed removing the route; see ADR-915.)
// A slug that is not a CODE sequence still 404s by design — DB-built sequences
// enter at /onboarding/beta?seq=<slug> instead.

export const revalidate = 3600

export function generateStaticParams() {
  return Object.keys(BETA_SEQUENCES).map((slug) => ({ slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const seq = BETA_SEQUENCES[slug]
  if (!seq) return {}
  const override = await getSplashOverride(slug).catch(() => null)
  const splash = { ...seq.splash, ...override }
  return {
    title: splash.headline,
    description: splash.body,
    // Private invite/cohort links, shared directly with an audience, not a public crawl target. Noindex
    // (and kept out of the sitemap) so a shared /beta/<slug> never surfaces in search.
    robots: { index: false },
    alternates: { canonical: `/beta/${slug}` },
    openGraph: { title: splash.headline, description: splash.body, url: `/beta/${slug}` },
    // Metadata merges per top-level key: omitting `twitter` inherits the ROOT block, so a shared
    // /beta/<slug> link would preview as generic site copy instead of this sequence's splash.
    twitter: { card: 'summary_large_image', title: splash.headline, description: splash.body },
  }
}

// Render a statement line, turning the *asterisked* span into an accent.
function accent(text: string) {
  const parts = text.split(/\*([^*]+)\*/)
  return parts.map((part, i) =>
    i % 2 === 1 ? <span key={i} className="text-primary-strong">{part}</span> : <span key={i}>{part}</span>,
  )
}

export default async function BetaSequenceSplash({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  if (!BETA_SEQUENCES[slug]) notFound()
  const seq = getSequence(slug)
  const override = await getSplashOverride(slug).catch(() => null)
  const splash = { ...seq.splash, ...override }
  const start = `/onboarding/beta?seq=${seq.slug}`

  return (
    <>
      <PhotoHero
        image={splash.image}
        alt={splash.imageAlt}
        eyebrow={splash.eyebrow}
        title={splash.headline}
        subtitle={splash.body}
        minHeight="screen"
        footer={
          <p className="mt-8 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-body-sm text-on-ink/60">
            <span className="font-semibold text-on-ink/80">Free during the beta.</span>
            <span aria-hidden className="text-on-ink/30">·</span>
            <span>No card · It’s live, it’s raw, and you’re early</span>
          </p>
        }
      >
        <Button href={start} size="lg">
          {splash.cta}
        </Button>
      </PhotoHero>

      <Statement tone="canvas">{accent(splash.statement)}</Statement>

      {/* The close. `role="band"` is the loose beat the four-role rhythm reserves for a tone
          change and the end of a page (globals.css) — the same weight BetaCTA carries on every
          other marketing page, so this flow-specific CTA closes at the site's cadence. */}
      <Section tone="surface" role="band" className="text-center">
        <p className="mx-auto max-w-xl text-body-lg leading-relaxed text-muted">
          Two minutes to step in. You’ll take the founder’s oath, claim your handle, and meet your people.
        </p>
        <div className="mt-7">
          <Button href={start} size="md">
            {splash.cta}
          </Button>
        </div>
      </Section>
    </>
  )
}
