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
    'Browse guided practice Journeys on Frequency: ordered sets of small daily practices you run for a season, alone or with your circle.',
  alternates: { canonical: '/discover/journeys' },
  openGraph: {
    title: `Journeys · ${SITE_NAME}`,
    description:
      'Guided practice Journeys: ordered sets of small daily practices you run for a season.',
    url: '/discover/journeys',
  },
  twitter: {
    card: 'summary_large_image',
    title: `Journeys · ${SITE_NAME}`,
    description:
      'Guided practice Journeys: ordered sets of small daily practices you run for a season.',
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
        image="/images/site/fd40d12c-7667-4d4e-b4c0-3b828170d9b1.jpg"
        alt="A Frequency member resting in savasana beside a hand-lettered “you are beautiful” sign"
        focal="object-center"
        eyebrow="Practice, together"
        title={<>Pick a <span className="text-primary">Journey</span></>}
        subtitle="A Journey is a short, ordered set of daily practices you run for a season. The first one takes under five minutes. Do it alone, or run it with your circle and finish the season together. Free to start, two words to belong."
      >
        <Button href={BETA_CTA_HREF}>{BETA_CTA_LABEL}</Button>
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
              kicker="Every Journey starts as one person's daily practice, written down."
            />
            <p className="mt-6 text-lg text-muted leading-relaxed">
              The library is quiet for now. Join the beta and you can build the first ones:
              a handful of small practices, ordered, with a five-minute way in. Share it, and
              your circle can run it beside you.
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
                  kicker="Pick one, start small, and let it become a rhythm."
                />
                <p className="mt-5 text-lg text-muted leading-relaxed">
                  Each Journey is a few practices in order, with an honest time ask and a
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
            img="/images/site/PHOTO-2020-09-09-16-38-27.jpeg"
            alt="A large Frequency community practicing yoga together on a lawn at golden hour"
            imgAspect="natural"
            eyebrow="Why a Journey"
            title="Small practices, kept up, with company"
            kicker="A rhythm you can hold, and people holding it with you."
          >
            <p>
              The hard part of any practice is not the first day. It is the tenth, the one
              where nobody would notice if you skipped. A Journey is built for that day: small
              enough to keep, ordered so you always know the next step, forgiving enough that a
              few hard weeks will not end your run.
            </p>
            <p>
              And when your circle runs the same Journey, the tenth day has witnesses. You show
              up because they did, and the rhythm stops being willpower and starts being us.
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
        body="Join the North County San Diego beta: adopt a Journey, run it with your circle, and finish the season together."
      />
    </>
  )
}
