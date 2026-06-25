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
  title: 'Local Circles',
  description:
    'Browse the local Circles forming on Frequency: small groups of up to 50 neighbors meeting in person around something they share.',
  alternates: { canonical: '/discover/circles' },
  openGraph: {
    title: `Local Circles · ${SITE_NAME}`,
    description: 'Browse the local Circles forming on Frequency and find your people.',
    url: '/discover/circles',
  },
  twitter: {
    card: 'summary_large_image',
    title: `Local Circles · ${SITE_NAME}`,
    description: 'Browse the local Circles forming on Frequency and find your people.',
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
          circleListSchema(circles, 'Local Circles on Frequency'),
        ]}
      />

      <PhotoHero
        image="/images/site/meditation-circle-outdoor.jpg"
        alt="A seated meditation Circle on a concrete overlook under soft overcast light, blankets out and a neighborhood spread out behind them"
        focal="object-center"
        eyebrow="Find your people"
        title={<>Circles forming <span className="text-primary">now</span></>}
        subtitle="Somewhere close to you, a handful of neighbors already have a standing time and a saved seat. A Circle is up to fifty of them, gathered around one thing they share: a practice, a place, a love. Browse freely. A free account is all it takes to step inside."
      >
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
          <Button href={BETA_CTA_HREF}>{BETA_CTA_LABEL}</Button>
          <Button href="/discover" variant="ghost">
            or just browse, no account needed →
          </Button>
        </div>
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
            eyebrow="Why a Circle"
            title={<>A crowd can&apos;t miss you. A <span className="text-primary">Circle</span> can.</>}
            kicker="Small enough to learn every name, big enough to always have plans."
          />
          <p className="mt-5 text-lg text-muted leading-relaxed max-w-prose mx-auto">
            You can have a thousand followers and still walk to the car alone. A Circle is
            the opposite shape: a few faces that light up when you arrive, a seat that gets
            noticed the week it&apos;s empty, a near-stranger who texts to ask where you&apos;ve
            been. That&apos;s what&apos;s waiting on the other side of a browse.
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
            <SectionHeading eyebrow="Near you" title="Browse the Circles" />
            <p className="mt-5 text-lg text-muted leading-relaxed">
              Every Circle here is real and forming in North County San Diego. Read the rooms,
              the practices, the standing times. Find one that sounds like your people, or a
              reason to gather your own. The first night is the hardest. After that, you&apos;re
              a regular.
            </p>
          </div>
          {circles.length === 0 ? (
            <p className="text-center text-muted">No public Circles yet. Check back soon.</p>
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

      {/* ── How Circles grow ────────────────────────────────────── */}
      <ZigZag
        tone="ink"
        img="/images/site/breathwork-circle-friends.jpg"
        alt="A group standing in a clear ring on a foggy ocean overlook, with one person in the center"
        imgAspect="natural"
        eyebrow="How Circles grow"
        title="A Circle divides to stay close"
        kicker="Fifty isn't a limit. It's the edge of knowing everyone."
      >
        <p>
          Circles gather around something small and true: a sunrise swim, a guitar, a grief.
          They stay where you can still learn everyone&apos;s name, where your empty chair gets
          noticed before the night is over.
        </p>
        <p>
          When a Circle outgrows that closeness, it doesn&apos;t sprawl. It divides, like a cell,
          like a family at a long table, so the warmth carries into two rooms instead of thinning
          across one. Nobody gets left at the edge of a room that&apos;s already full.
        </p>
        <p>
          That&apos;s how a single standing time becomes a neighborhood: one seat at a time, grown
          rather than built, led by whoever was ready to be the next to say see you next week.
        </p>
      </ZigZag>

      {/* ── Sensory beat: the third time ────────────────────────── */}
      <ZigZag
        tone="surface"
        img="/images/site/group-of-friends.jpg"
        alt="Ten friends smiling together, squeezed onto a bench after practice, mats and water bottles at their feet"
        imgAspect="landscape"
        imgPosition="center"
        reverse
        eyebrow="The third time"
        title="By the third time, they know your order"
        kicker="No audition. Two words and you're in the room."
      >
        <p>
          Something shifts the third or fourth time you walk into the same room. Nobody
          explains the rules. Somebody just says your name, slides over to make space, and
          the evening carries you.
        </p>
        <p>
          You stop rehearsing the small talk in the car. You stop being a guest. A Circle is
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
        body="Join the North County San Diego beta to step inside a Circle, or start one of your own."
      />
    </>
  )
}
