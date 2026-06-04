import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PhotoHero, Statement, Button } from '@/components/marketing/marketing-ui'
import { BETA_SEQUENCES, getSequence } from '@/lib/onboarding/beta-sequences'

// Per-audience beta splash. Each sequence (early-adopter / personal / founding-
// partner) gets a shareable URL (/beta/<slug>) whose copy + CTA carry the audience
// into the induction (?seq=), which then runs that sequence's voiced flow and tags
// the cohort. Authored in lib/onboarding/beta-sequences.ts (the splash-page creator
// at /admin/beta-sequences lists + previews these).

export const revalidate = 3600

export function generateStaticParams() {
  return Object.keys(BETA_SEQUENCES).map((slug) => ({ slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const seq = BETA_SEQUENCES[slug]
  if (!seq) return {}
  return {
    title: seq.splash.headline,
    description: seq.splash.body,
    alternates: { canonical: `/beta/${slug}` },
    openGraph: { title: seq.splash.headline, description: seq.splash.body, url: `/beta/${slug}` },
  }
}

// Render a statement line, turning the *asterisked* span into an accent.
function accent(text: string) {
  const parts = text.split(/\*([^*]+)\*/)
  return parts.map((part, i) =>
    i % 2 === 1 ? <span key={i} className="text-primary">{part}</span> : <span key={i}>{part}</span>,
  )
}

export default async function BetaSequenceSplash({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  if (!BETA_SEQUENCES[slug]) notFound()
  const seq = getSequence(slug)
  const start = `/onboarding/beta?seq=${seq.slug}`

  return (
    <>
      <PhotoHero
        image={seq.splash.image}
        alt={seq.splash.imageAlt}
        eyebrow={seq.splash.eyebrow}
        title={seq.splash.headline}
        subtitle={seq.splash.body}
        minHeight="screen"
        footer={
          <p className="mt-8 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-sm text-white/60">
            <span className="font-semibold text-white/80">Free during the beta.</span>
            <span aria-hidden className="text-white/30">·</span>
            <span>No card · It’s live, it’s raw, and you’re early</span>
          </p>
        }
      >
        <Button href={start} size="lg">
          {seq.splash.cta}
        </Button>
      </PhotoHero>

      <Statement tone="canvas">{accent(seq.splash.statement)}</Statement>

      <section className="bg-surface px-6 py-16 text-center sm:py-20">
        <p className="mx-auto max-w-xl text-lg leading-relaxed text-muted">
          Two minutes to step in. You’ll take the founder’s oath, claim your handle, and meet your people.
        </p>
        <div className="mt-7">
          <Button href={start} size="md">
            {seq.splash.cta}
          </Button>
        </div>
      </section>
    </>
  )
}
