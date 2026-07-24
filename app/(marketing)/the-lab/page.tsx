import type { Metadata } from 'next'
import { BlockRender } from '@/lib/page-editor/block-render'
import { BlockDocJsonLd } from '@/lib/page-editor/block-seo'
import {
  ArrowRight,
  Dumbbell,
  Flame,
  Snowflake,
  Coffee,
  Sparkles,
  MapPin,
  Users,
} from 'lucide-react'
import {
  PhotoHero,
  Section,
  SectionHeading,
  Statement,
  ZigZag,
  Marquee,
  PillarNav,
  BetaCTA,
  Button,
  Card,
  Lead,
  Body,
} from '@/components/marketing/marketing-ui'
import { BETA_CTA_LABEL, BETA_CTA_HREF, FOUNDING_PLACE } from '@/lib/site'
import { config } from '@/lib/page-editor/config'
import { getPublishedData } from '@/lib/page-editor/data'
import { getTemplate, isRenderable } from '@/lib/page-editor/templates'
import { createAdminClient } from '@/lib/supabase/admin'
import { getLiveData } from '@/lib/page-editor/live-data'
import { JsonLd } from '@/components/json-ld'
import { breadcrumbSchema, faqSchema } from '@/lib/jsonld'

export const revalidate = 3600

export const metadata: Metadata = {
  title: 'The Lab: the third space we are building',
  description:
    'The Lab is a third space the Frequency community is building: rooms to move, gather, warm up, cool down, and switch off in person. The first is taking root in North County San Diego. Not open yet.',
  alternates: { canonical: '/the-lab' },
  openGraph: {
    title: 'The Lab · Frequency',
    description:
      'A third space the community is building, not open yet: movement studios, a thermal circuit, a cold pool, a connection bar, and an events floor. The first is taking root in North County San Diego.',
    url: '/the-lab',
  },
}

// Answer-first FAQ schema that matches the honest present: The Lab is a room the
// community is building, not a live venue you can visit today. Kept in lockstep
// with the visible copy below (CONTENT-VOICE §8b: schema must not out-claim the
// page). "Third space" keyword carried in the first answer; the answers forward
// to /founders (back the build) and /discover (the live community).
const THE_LAB_FAQ = [
  {
    q: 'What is The Lab?',
    a: "The Lab is a third space the Frequency community is building: not home, not work, a real room to move, warm up in the sauna, cool down in the plunge, gather, and switch off in person. The first one is taking root in North County San Diego. It is not open yet.",
  },
  {
    q: 'Can I visit The Lab yet?',
    a: 'Not yet. The first Lab is being built by the founding community. You can help shape the room before the doors open by joining the Beta or backing the build as a Founder.',
  },
  {
    q: "What will be inside The Lab?",
    a: 'Movement studios, a cedar thermal circuit, a cold plunge pool, a no-alcohol connection bar, and a flexible events floor. One building, tuned room by room.',
  },
  {
    q: 'Where is the first Lab?',
    a: 'The first Lab is taking root in North County San Diego, shaped by the people it serves, and built to repeat in other cities once the community is there.',
  },
]

const INSIDE = [
  {
    icon: Dumbbell,
    title: 'Movement studios',
    body: 'Breathwork at sunrise, ecstatic dance after dark, strength in between. Programmed to help you calm down, not to chase a mirror.',
  },
  {
    icon: Flame,
    title: 'The thermal circuit',
    body: 'Cedar sauna and steam, hot enough to quiet the mind. The first half of the loop that resets you to baseline.',
  },
  {
    icon: Snowflake,
    title: 'The cold pool',
    body: 'A plunge that shocks everything loose. Do it alone and it’s a habit; do it with your Circle and it’s a ritual.',
  },
  {
    icon: Coffee,
    title: 'The connection bar',
    body: 'No alcohol agenda: adaptogens, coffee, tea, and the lingering that turns strangers into regulars.',
  },
  {
    icon: Sparkles,
    title: 'The events floor',
    body: 'Sound baths, talks, ceremony, celebration. A flexible room built to hold a crowd that already knows each other.',
  },
  {
    icon: Users,
    title: 'Where circles meet',
    body: 'The groups you find in the app get a front door here. The feed brings you; the room takes over.',
  },
]

export default async function TheLabPage() {
  // getPublishedData -> getTemplate -> legacy: prefer the operator-published doc,
  // else the designed git template (so the designed page is live without a DB
  // publish), with the hardcoded legacy component as a last resort.
  const published = await getPublishedData('the-lab')
  const template = getTemplate('the-lab')
  const data = isRenderable(published) ? published : isRenderable(template) ? template : null
  const live = data ? await getLiveData(createAdminClient()).catch(() => null) : null
  return (
    <>
      <JsonLd
        data={breadcrumbSchema([{ name: 'The Lab', path: '/the-lab' }])}
      />
      <JsonLd data={faqSchema(THE_LAB_FAQ)} />
      {data && <BlockDocJsonLd data={data} path="/the-lab" />}
      {data ? <BlockRender config={config} data={data} metadata={live ? { live } : {}} /> : <LegacyTheLab />}
    </>
  )
}

function LegacyTheLab() {
  return (
    <>
      <PhotoHero
        image="/images/site/lab-thermal.jpg"
        alt="Low amber light glowing across the cedar thermal circuit inside The Lab"
        focal="object-center"
        eyebrow="The Lab"
        title="The third space we are building."
        subtitle="Not home, not work. A real room the community is building: dark wood, warm light, steam and greenery, somewhere to finally switch off in person. The first one is taking root in North County San Diego. Not open yet."
      >
        <Button href={BETA_CTA_HREF}>
          {BETA_CTA_LABEL} <ArrowRight className="w-5 h-5" />
        </Button>
      </PhotoHero>

      {/* The premise */}
      <Section tone="canvas" pad="pt-20 pb-10 sm:pt-24 sm:pb-12">
        <SectionHeading
          eyebrow="The premise"
          title="Community needs a body."
          kicker="The app is the thread. This is where it lands."
        />
        <Lead>
          A feed can keep people warm between meetings. It can&apos;t hold a
          sound bath, a cold plunge, or the hour after when nobody wants to
          leave. The Lab is the room those things happen in: a place built to
          be felt, not scrolled.
        </Lead>
        <Body>
          Light, sound, temperature, and the people around you are all tuned to
          do one thing: bring you back to yourself, then back to each other.
        </Body>
      </Section>

      <Statement tone="surface">
        Not a gym. Not a café. Not a studio.{' '}
        <span className="text-primary">All of it</span>, on purpose.
      </Statement>

      {/* ── Tour the spaces — varied imagery to complement the demo tour ──── */}
      <ZigZag
        img="/images/site/lab-concept.jpg"
        alt="A warm, plant-filled movement studio inside The Lab, lit for an evening class"
        eyebrow="Movement studios"
        title="Rooms built to move you."
        imgAspect="landscape"
        tone="surface"
      >
        <p>
          Step in off the street and the noise drops away. Breathwork at
          sunrise, strength through the day, ecstatic dance once the lights go
          low. Studios designed around your nervous system: wood underfoot,
          plants in the corners, sound that wraps the room.
        </p>
        <p>
          The schedule is shaped by the community, not a franchise playbook. The
          practices people show up for are the ones that stay on the board.
        </p>
      </ZigZag>

      <ZigZag
        img="/images/site/lab-thermal.jpg"
        alt="The cedar sauna and thermal circuit at The Lab, glowing in amber light"
        eyebrow="The thermal circuit"
        title="Heat, then cold, then quiet."
        imgAspect="portrait"
        reverse
        tone="canvas"
      >
        <p>
          Sweat it out in the cedar sauna until the mind goes quiet. This is the
          first half of the loop, the part that opens you up before the cold
          snaps you back.
        </p>
        <p>
          Twenty minutes here can reset a whole day. It&apos;s the ritual the
          regulars build their week around.
        </p>
      </ZigZag>

      <ZigZag
        img="/images/site/lab-pool.jpg"
        alt="The cold plunge pool at The Lab, still water under low light"
        eyebrow="The cold pool"
        title="Shock it all loose."
        imgAspect="landscape"
        tone="surface"
      >
        <p>
          Out of the sauna and straight into the plunge. The contrast is the
          medicine: it floods you with clarity and leaves you grinning at a
          stranger across the water.
        </p>
        <p>
          Do it alone and it&apos;s a habit. Do it with your Circle and it
          becomes the thing you text each other about at 6am.
        </p>
      </ZigZag>

      <ZigZag
        img="/images/site/lab-lounge.jpg"
        alt="The connection bar lounge at The Lab: dark wood, warm light, soft seating"
        eyebrow="The connection bar"
        title="Where the talking happens."
        imgAspect="portrait"
        reverse
        tone="canvas"
      >
        <p>
          Land at the bar with a coffee and somebody you didn&apos;t know an
          hour ago. No alcohol agenda: adaptogens, tea, real conversation, and
          the kind of lingering most places are designed to prevent.
        </p>
        <p>
          This is the third place between the studio and the door, where
          strangers quietly become the people you came for.
        </p>
      </ZigZag>

      {/* What's inside — quick-scan grid */}
      <Section tone="surface">
        <SectionHeading
          eyebrow="Inside"
          title="What you'll find."
          kicker="One building, tuned room by room."
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {INSIDE.map((f) => (
            <Card
              key={f.title}
              tone="feature"
              className="hover:border-border-strong transition-colors"
            >
              <div className="w-11 h-11 rounded-2xl bg-primary-bg flex items-center justify-center mb-4">
                <f.icon className="w-5 h-5 text-primary-strong" aria-hidden />
              </div>
              <h3 className="font-display uppercase text-text text-2xl leading-none">
                {f.title}
              </h3>
              <p className="mt-3 text-base text-muted leading-relaxed">{f.body}</p>
            </Card>
          ))}
        </div>
      </Section>

      {/* ── Dark beat: the events floor ──────────────────────────────────── */}
      <ZigZag
        img="/images/site/lab-concept.jpg"
        alt="The events floor at The Lab set for an evening gathering, strung with warm light"
        eyebrow="The events floor"
        title="Room to gather."
        imgAspect="landscape"
        tone="ink"
      >
        <p>
          The same events you RSVP&apos;d to in the app, sound baths,
          workshops, sunset socials, the occasional full-blown celebration,
          happening in a room built to hold a crowd that actually knows each
          other.
        </p>
        <p>
          When a circle outgrows a living room, this is where it lands. The
          floor flexes from an intimate ceremony to a packed Saturday night.
        </p>
      </ZigZag>

      <Statement tone="ink">
        The community comes first.{' '}
        <span className="text-primary">The Lab is where it gets a body.</span>
      </Statement>

      {/* Marquee inside a slat band for rhythm */}
      <div className="bg-slat">
        <Marquee
          items={[
            'Move',
            'Sweat',
            'Plunge',
            'Linger',
            'Gather',
            'Belong',
          ]}
        />
      </div>

      {/* ── Tie to community + the founding location ─────────────────────── */}
      <Section tone="canvas">
        <SectionHeading
          eyebrow="Where it begins"
          title="Founded in North County San Diego."
          kicker="The first room, built by the first members."
        />
        <Lead>
          The first Lab is a prototype: a flagship rooted in one neighborhood,
          shaped by the people it serves. By the time a place is ready for a
          Lab, the community is already there: the circles are meeting, the
          rituals are forming, the regulars know each other&apos;s names.
        </Lead>
        <Body>
          It&apos;s built from day one to be repeatable, so the version that
          works in {FOUNDING_PLACE} can open in your city next. The community
          always comes first; the Lab is simply where it gets a body. See{' '}
          <a href="/what-is-a-third-space" className="text-primary-strong underline">
            what a third space is
          </a>
          , back the build as a{' '}
          <a href="/founders" className="text-primary-strong underline">
            Founder
          </a>
          , or meet the live community on{' '}
          <a href="/discover" className="text-primary-strong underline">
            Discover
          </a>
          .
        </Body>
        <p className="mt-7 inline-flex items-center gap-2 text-sm font-bold uppercase tracking-[0.2em] text-primary-strong">
          <MapPin className="w-4 h-4" aria-hidden /> {FOUNDING_PLACE}
        </p>
      </Section>

      <PillarNav current="/the-lab" tone="surface" />

      <BetaCTA
        heading="Be part of building the first one."
        body="The community is how the Lab begins. Join the Beta and help shape the room before the doors open."
      />
    </>
  )
}
