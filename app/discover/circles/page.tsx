import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { getPublicCircles } from '@/lib/discover'
import { CircleCard } from '@/components/discover/cards'
import {
  ZigZag,
  Statement,
  BetaCTA,
  PhotoHero,
  SectionHeading,
  Button,
} from '@/components/marketing/marketing-ui'
import {
  RippleRings,
  CircleConstellation,
  OrganicBlob,
} from '@/components/marketing/vector-art'
import { JsonLd } from '@/components/json-ld'
import { breadcrumbSchema, circleListSchema } from '@/lib/jsonld'
import { SITE_NAME, BETA_CTA_HREF, BETA_CTA_LABEL } from '@/lib/site'

export const metadata: Metadata = {
  title: 'Local circles',
  description:
    'Browse the local circles forming on Frequency: small groups of up to 50 neighbors meeting in person around something they share.',
  alternates: { canonical: '/discover/circles' },
  openGraph: {
    title: `Local circles · ${SITE_NAME}`,
    description: 'Browse the local circles forming on Frequency and find your people.',
    url: '/discover/circles',
  },
}

export const revalidate = 3600

export default async function DiscoverCirclesPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const isAuthed = !!user

  const circles = await getPublicCircles(200)

  return (
    <>
      <JsonLd
        data={[
          breadcrumbSchema([
            { name: 'Discover', path: '/discover' },
            { name: 'Circles', path: '/discover/circles' },
          ]),
          circleListSchema(circles, 'Local circles on Frequency'),
        ]}
      />

      <PhotoHero
        image="/images/site/971634cd-1d52-4b3a-a0ab-5713d395d58a.jpg"
        alt="A group gathered outdoors at golden hour, arms thrown open mid-breathwork"
        focal="object-center"
        eyebrow="Find your people"
        title={<>Circles forming <span className="text-primary">now</span></>}
        subtitle="Somewhere close to you, a handful of neighbors already have a standing time and a saved seat. A circle is up to fifty of them, gathered around one thing they share: a practice, a place, a love. Browse freely; a free account is all it takes to step inside."
      >
        <Button href={BETA_CTA_HREF}>{BETA_CTA_LABEL}</Button>
      </PhotoHero>

      {/* ── The premise ─────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-surface px-6 py-20 sm:py-24">
        {/* Ripple rings: a single circle widening into the room, the core motif. */}
        <RippleRings
          aria-hidden
          className="pointer-events-none absolute -top-20 -right-20 w-[34rem] max-w-none text-primary opacity-[0.05]"
        />
        <div className="relative max-w-3xl mx-auto text-center">
          <SectionHeading
            eyebrow="Why a circle"
            title={<>A crowd can&apos;t miss you. A <span className="text-primary">circle</span> can.</>}
            kicker="Small enough to learn every name, big enough to always have plans."
          />
          <p className="mt-5 text-lg text-muted leading-relaxed max-w-prose mx-auto">
            You can have a thousand followers and still walk to the car alone. A circle is
            the opposite shape: a few faces that light up when you arrive, a seat that gets
            noticed the week it&apos;s empty, a near-stranger who texts to ask where you&apos;ve
            been. That is the relief waiting on the other side of a browse.
          </p>
        </div>
      </section>

      {/* ── The grid ────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-marketing-canvas px-6 py-20 sm:py-24">
        {/* A loose constellation of people behind the grid, the network each circle opens. */}
        <CircleConstellation
          aria-hidden
          className="pointer-events-none absolute top-10 left-0 w-80 max-w-none text-primary opacity-[0.05]"
        />
        <div className="relative max-w-4xl mx-auto">
          <div className="mb-9 max-w-prose">
            <SectionHeading eyebrow="Near you" title="Browse the circles" />
            <p className="mt-5 text-lg text-muted leading-relaxed">
              Every circle here is real and forming in North County San Diego. Read the rooms,
              the practices, the standing times. Find one that sounds like your people, or a
              reason to gather your own. The first night is the hardest; after that, you&apos;re
              a regular.
            </p>
          </div>
          {circles.length === 0 ? (
            <p className="text-center text-muted">No public circles yet. Check back soon.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {circles.map((c) => (
                <div key={c.id} className="rounded-2xl transition-shadow hover:shadow-pop">
                  <CircleCard circle={c} isAuthed={isAuthed} />
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── How circles grow ────────────────────────────────────── */}
      <ZigZag
        tone="ink"
        img="/images/site/PHOTO-2020-10-17-13-49-14.jpeg"
        alt="A music circle gathered on a cliffside above the ocean at golden hour"
        imgAspect="natural"
        eyebrow="How circles grow"
        title="A circle divides to stay close"
        kicker="Fifty is not a limit. It's the edge of intimacy."
      >
        <p>
          Circles gather around something small and true: a sunrise swim, a guitar, a grief.
          They stay where you can still learn everyone&apos;s name, where your empty chair gets
          noticed before the night is over.
        </p>
        <p>
          When a circle outgrows that closeness, it doesn&apos;t sprawl. It divides, like a cell,
          like a family at a long table, so the warmth carries into two rooms instead of thinning
          across one. Nobody gets left at the edge of a room that&apos;s already full.
        </p>
        <p>
          That is how a single standing time becomes a neighborhood: one seat at a time, grown
          rather than built, led by whoever was ready to be the next to say see you next week.
        </p>
      </ZigZag>

      {/* ── Sensory beat — the first night ──────────────────────── */}
      <ZigZag
        tone="surface"
        img="/images/site/fd40d12c-7667-4d4e-b4c0-3b828170d9b1.jpg"
        alt="A Frequency member resting on the grass beside a hand-lettered “you are beautiful” sign after practice"
        imgAspect="landscape"
        imgPosition="center"
        reverse
        eyebrow="The feeling"
        title="By the third time, they know your order"
        kicker="No audition. Two words and you're in the room."
      >
        <p>
          There is a particular relief that lands the third or fourth time you walk into the
          same room. Nobody explains the rules. Somebody just says your name, slides over to
          make space, and the evening carries you.
        </p>
        <p>
          You stop rehearsing the small talk in the car. You stop being a guest. A circle is
          sized so it can&apos;t help but notice you, and that noticing is the whole point:
          being plainly glad-to-see-you to a handful of people who live close enough to walk to.
        </p>
      </ZigZag>

      {/* ── The turn ────────────────────────────────────────────── */}
      <div className="relative overflow-hidden">
        {/* A soft warm blob behind the closing statement. */}
        <OrganicBlob
          aria-hidden
          className="pointer-events-none absolute -bottom-24 -left-16 w-[30rem] max-w-none text-primary opacity-[0.04]"
        />
        <Statement tone="canvas">
          Your people are already gathering.{' '}
          <span className="text-primary">Pull up a chair.</span>
        </Statement>
      </div>

      <BetaCTA
        heading="Your people are already gathering"
        body="Join the North County San Diego beta to step inside a circle, or start one of your own."
      />
    </>
  )
}
