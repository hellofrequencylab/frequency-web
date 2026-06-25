import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { listPublicJourneys } from '@/lib/journey-plans'
import { JourneyCard } from '@/components/discover/cards'
import {
  ZigZag,
  Statement,
  BetaCTA,
  PhotoHero,
  SectionHeading,
  Button,
} from '@/components/marketing/marketing-ui'
import { FrequencyArcs, OrganicBlob } from '@/components/marketing/vector-art'
import { JsonLd } from '@/components/json-ld'
import { breadcrumbSchema, journeyListSchema } from '@/lib/jsonld'
import { SITE_NAME, BETA_CTA_HREF, BETA_CTA_LABEL } from '@/lib/site'

export const metadata: Metadata = {
  title: 'Journeys',
  description:
    'Browse Journeys on Frequency: a Journey is part of The Quest, an ordered set of small daily Practices you run for a season. Start solo, or run it with your Circle.',
  alternates: { canonical: '/discover/journeys' },
  openGraph: {
    title: `Journeys · ${SITE_NAME}`,
    description:
      'A Journey is an ordered set of small daily Practices you run for a season, solo or with your Circle.',
    url: '/discover/journeys',
  },
  twitter: {
    card: 'summary_large_image',
    title: `Journeys · ${SITE_NAME}`,
    description:
      'A Journey is an ordered set of small daily Practices you run for a season, solo or with your Circle.',
  },
}

export const revalidate = 3600

export default async function DiscoverJourneysPage() {
  const journeys = await listPublicJourneys()

  return (
    <>
      <JsonLd
        data={[
          breadcrumbSchema([
            { name: 'Discover', path: '/discover' },
            { name: 'Journeys', path: '/discover/journeys' },
          ]),
          journeyListSchema(journeys, 'Journeys on Frequency'),
        ]}
      />

      <PhotoHero
        image="/images/site/yoga-in-the-grass.jpg"
        alt="A large group practicing cat-cow on yoga mats across a lawn at golden hour, palms behind them"
        focal="object-center"
        eyebrow="Practice, together"
        title={<>Pick a <span className="text-primary">Journey</span></>}
        subtitle="A Journey is part of The Quest: a short, ordered set of small daily Practices you run for a season. The first one takes under five minutes, before your coffee. Do it solo, or run it with your Circle and finish the season together. Free to start."
      >
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <Button href={BETA_CTA_HREF}>
            {BETA_CTA_LABEL} <ArrowRight className="w-4 h-4" />
          </Button>
          <Link
            href="/discover/circles"
            className="text-sm font-semibold text-white/80 hover:text-white transition-colors"
          >
            or just browse, no account needed →
          </Link>
        </div>
      </PhotoHero>

      {journeys.length === 0 ? (
        // Founding state: no public Journeys yet. Frame it as a beginning.
        <section className="relative overflow-hidden bg-surface px-6 py-20 sm:py-24">
          <FrequencyArcs
            aria-hidden
            className="pointer-events-none absolute -top-12 left-1/2 -translate-x-1/2 w-[38rem] max-w-none text-primary opacity-[0.05]"
          />
          <div className="relative max-w-3xl mx-auto text-center">
            <SectionHeading
              eyebrow="Founding chapter"
              title={<>The first Journeys are <span className="text-primary">being mapped</span></>}
              kicker="Every Journey starts as one person's daily Practice, written down."
            />
            <p className="mt-6 text-lg text-muted leading-relaxed">
              The library is quiet for now. Join the beta and you can build the first ones:
              a handful of small Practices, in order, with a five-minute way in. Share one, and
              your Circle can run it beside you.
            </p>
            <div className="mt-9">
              <Button href={BETA_CTA_HREF}>{BETA_CTA_LABEL}</Button>
            </div>
          </div>
        </section>
      ) : (
        <>
          {/* ── The library ─────────────────────────────────────── */}
          <section className="relative overflow-hidden bg-surface px-6 py-20 sm:py-24">
            <FrequencyArcs
              aria-hidden
              className="pointer-events-none absolute -top-10 right-0 w-[32rem] max-w-none text-primary opacity-[0.05]"
            />
            <div className="relative max-w-4xl mx-auto">
              <div className="text-center max-w-2xl mx-auto mb-9">
                <SectionHeading
                  eyebrow="The library"
                  title={<>What you can <span className="text-primary">practice</span></>}
                  kicker="Pick one, start small, and keep it up for a season."
                />
                <p className="mt-5 text-lg text-muted leading-relaxed">
                  Each Journey is a few Practices in order, with an honest time ask and a
                  forgiving finish line. Find the one that sounds like your mornings.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {journeys.map((j) => (
                  <JourneyCard key={j.id} journey={j} />
                ))}
              </div>
            </div>
          </section>

          {/* ── Why a Journey ───────────────────────────────────── */}
          <ZigZag
            tone="canvas"
            img="/images/site/downward-dog.jpg"
            alt="A group holding downward dog on yoga mats on a lawn under a tall palm, ocean town behind them"
            imgAspect="portrait"
            eyebrow="Why a Journey"
            title="Small practices, kept up, with company"
            kicker="A rhythm you can hold, and people holding it with you."
          >
            <p>
              The hard part of any practice is not the first day. It is the tenth, the one
              where nobody would notice if you skipped. A Journey is built for that day: small
              enough to keep, ordered so you always know the next step, forgiving enough that a
              few hard weeks won&apos;t undo your streak.
            </p>
            <p>
              And when your Circle runs the same Journey together, the tenth day has witnesses.
              You show up because they did, and keeping it up stops being willpower and starts
              being us.
            </p>
          </ZigZag>

          <div className="relative overflow-hidden">
            <OrganicBlob
              aria-hidden
              className="pointer-events-none absolute -bottom-24 -right-16 w-[30rem] max-w-none text-primary opacity-[0.04]"
            />
            <Statement tone="ink">
              A practice is easier to keep <span className="text-primary">together</span>.
            </Statement>
          </div>
        </>
      )}

      <div className="text-center bg-surface pb-16">
        <Link
          href="/discover"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-strong hover:underline"
        >
          Back to Discover <ArrowRight className="w-4 h-4" />
        </Link>
      </div>

      <BetaCTA
        heading="Start your first Journey"
        body="Join the North County San Diego beta: adopt a Journey, run it with your Circle, and finish the season together."
      />
    </>
  )
}
