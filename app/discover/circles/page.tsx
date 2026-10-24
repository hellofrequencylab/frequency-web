import type { Metadata } from 'next'
import { getPublicCircles, getPublicCounts, getPublicEvents } from '@/lib/discover'
import { CircleCard, SignInCta } from '@/components/discover/cards'
import { CommunityProof } from '@/components/discover/community-proof'
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
import { OG_SITE, ROOT_OG_IMAGES, SITE_NAME, BETA_CTA_HREF, BETA_CTA_LABEL } from '@/lib/site'
import { SITE_DESIGN } from '@/lib/theme/design'
import { FrequencyCircles } from '@/components/frequency/site/pages/discover/circles'

export const metadata: Metadata = {
  title: 'Local Circles',
  description:
    'Browse local Circles and community groups around a shared activity. Check each listing for meeting times, location and how to join.',
  alternates: { canonical: '/discover/circles' },
  openGraph: {
    ...OG_SITE,
    images: ROOT_OG_IMAGES,
    title: `Local Circles · ${SITE_NAME}`,
    description: 'Browse local Circles and community groups around a shared activity. Check each listing for meeting times, location and how to join.',
    url: '/discover/circles',
  },
  twitter: {
    card: 'summary_large_image',
    title: `Local Circles · ${SITE_NAME}`,
    description: 'Browse local Circles and community groups around a shared activity. Check each listing for meeting times, location and how to join.',
  },
}

export const revalidate = 3600

export default async function DiscoverCirclesPage() {
  const [circles, counts, events] = await Promise.all([
    getPublicCircles(200),
    getPublicCounts(),
    getPublicEvents(50),
  ])
  const schema = [
    breadcrumbSchema([
      { name: 'Discover', path: '/discover' },
      { name: 'Circles', path: '/discover/circles' },
    ]),
    circleListSchema(circles, 'Local Circles on Frequency'),
  ]

  // THE DESIGN SWITCH (ADR-1737): under Frequency the body is the site kit's directory, over the same
  // reads and the same JSON-LD. Build-time constant, so the route stays ISR.
  if (SITE_DESIGN === 'frequency') {
    return (
      <>
        <JsonLd data={schema} />
        <FrequencyCircles circles={circles} counts={counts} events={events.length} />
      </>
    )
  }

  return (
    <>
      <JsonLd data={schema} />

      <PhotoHero
        image="/images/site/PHOTO-2020-10-07-14-38-04.jpeg"
        alt="A group of friends dancing together on the beach at golden hour"
        focal="object-center"
        eyebrow="Find your people"
        title={<>Circles forming <span className="text-primary">now</span></>}
        subtitle="Want a regular time to meet people? Browse community Circles around an activity or interest. Read each group’s meeting times, location and how to join."
      >
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
          <Button href={BETA_CTA_HREF}>{BETA_CTA_LABEL}</Button>
          <Button href="/discover" variant="ghost">
            or just browse, no account needed →
          </Button>
        </div>
      </PhotoHero>

      {/* ── The premise ─────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-surface mk-beat">
        {/* Ripple rings: a single circle widening into the room, the core motif. */}
        <RippleRings
          aria-hidden
          className="pointer-events-none absolute -top-20 -right-20 w-[34rem] max-w-none text-primary opacity-[0.05]"
        />
        <div className="relative max-w-3xl mx-auto text-center">
          <SectionHeading
            eyebrow="Why a Circle"
            title={<>A crowd can&apos;t miss you. A <span className="text-primary-strong">Circle</span> can.</>}
            kicker="Small groups with their own activities and meeting times."
          />
          <p className="mt-5 text-body-lg text-muted leading-relaxed max-w-prose mx-auto">
            It can be hard to find a regular time to meet people. A Circle gathers around an activity, from a walk to a shared meal. Read the details and ask the Host what your first visit involves.
          </p>
        </div>
      </section>

      {/* ── The grid ────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-marketing-canvas mk-beat">
        {/* A loose constellation of people behind the grid, the network each circle opens. */}
        <CircleConstellation
          aria-hidden
          className="pointer-events-none absolute top-10 left-0 w-80 max-w-none text-primary opacity-[0.05]"
        />
        <div className="relative max-w-4xl mx-auto">
          <div className="mb-9 max-w-prose">
            <SectionHeading eyebrow="Near you" title="Browse the Circles" />
            <p className="mt-5 text-body-lg text-muted leading-relaxed">
              Browse the Circles listed here. Read each group’s activity, meeting format, location and access details, then ask the Host how to take part.
            </p>
          </div>
          {circles.length === 0 ? (
            <p className="text-center text-muted">No public Circles yet. Check back soon.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {circles.map((c) => (
                <div key={c.id} className="rounded-card transition-shadow hover:shadow-pop">
                  <CircleCard circle={c} />
                </div>
              ))}
            </div>
          )}

          {/* Live proof, then the ask: show a warm visitor the room is real
              before we offer the invite. Honest below SOCIAL_PROOF_FLOOR. */}
          <div className="mt-12 mx-auto max-w-2xl space-y-4">
            <CommunityProof
              members={counts.members}
              circles={counts.circles}
              events={events.length}
            />
            <SignInCta
              title="See one you'd show up to?"
              body="Step inside a Circle near you, RSVP to its standing time, and meet the regulars."
              action={BETA_CTA_LABEL}
              href={BETA_CTA_HREF}
            />
          </div>
        </div>
      </section>

      {/* ── How Circles grow ────────────────────────────────────── */}
      <ZigZag
        tone="ink"
        img="/images/site/hula-hoop-party.jpg"
        alt="A handful of friends spinning hula hoops together on a lawn at golden hour"
        imgAspect="natural"
        eyebrow="How Circles grow"
        title="A Circle divides to stay close"
        kicker="Small groups with their own meeting times."
      >
        <p>
          Circles gather around a shared activity or interest: a sunrise swim, a guitar, a conversation. Check the listing for the group size, meeting time and how to take part.
        </p>
        <p>
          If a group needs another gathering, a regular can host a second Circle. Choose a time, share the invitation and let people know which gathering they can join.
        </p>
        <p>
          Start with one activity and a time you can keep. You can ask someone to share the hosting as the group develops.
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
        title="Try one gathering, then decide"
        kicker="Check how to join before you come."
      >
        <p>
          A regular gathering gives people a time and place to meet again. You can try one date and take your time getting to know the people there.
        </p>
        <p>
          Ask the Host about the activity, access and arrival details if you have a question. Choose a group and a location that work for you.
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
          Find a gathering you would like to try.{' '}
          <span className="text-primary-strong">Pull up a chair.</span>
        </Statement>
      </div>

      <BetaCTA
        heading="Find a gathering you would like to try"
        body="Joining is free, and it stays free. Step inside a Circle near you, or start one of your own."
      />
    </>
  )
}
