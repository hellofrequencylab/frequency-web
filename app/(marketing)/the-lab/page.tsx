import type { Metadata } from 'next'
import { Render } from '@measured/puck/rsc'
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
  PullQuote,
  ZigZag,
  Marquee,
  PillarNav,
  BetaCTA,
  Button,
  Card,
  Stat,
  Lead,
  Body,
} from '@/components/marketing/marketing-ui'
import { BETA_CTA_LABEL, BETA_CTA_HREF, FOUNDING_PLACE } from '@/lib/site'
import { config } from '@/lib/page-editor/config'
import { getPublishedData } from '@/lib/page-editor/data'

export const revalidate = 3600

export const metadata: Metadata = {
  title: 'The Lab',
  description:
    'The Frequency Lab is a third space engineered for your nervous system. Somewhere to move, gather, cool down, and come back to yourself.',
  alternates: { canonical: '/the-lab' },
  openGraph: {
    title: 'The Lab · Frequency',
    description:
      'A third space built to be felt: movement studios, a thermal circuit, a cold pool, a connection bar, and an events floor.',
    url: '/the-lab',
  },
}

const INSIDE = [
  {
    icon: Dumbbell,
    title: 'Movement studios',
    body: 'Breathwork at sunrise, ecstatic dance after dark, strength in between, programmed for your nervous system, not a mirror.',
  },
  {
    icon: Flame,
    title: 'The thermal circuit',
    body: 'Cedar sauna and steam, hot enough to quiet the mind. The first half of the loop that resets you to baseline.',
  },
  {
    icon: Snowflake,
    title: 'The cold pool',
    body: 'A plunge that shocks everything loose. Do it alone and it’s a habit; do it with your circle and it’s a ritual.',
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
  const data = await getPublishedData('the-lab')
  if (data && Array.isArray(data.content) && data.content.length > 0) {
    return <Render config={config} data={data} />
  }
  return <LegacyTheLab />
}

function LegacyTheLab() {
  return (
    <>
      <PhotoHero
        image="/images/site/lab-storefront.jpg"
        alt="The Lab at dusk: a warm-lit timber building glowing over a quiet plaza, the front door to a third space"
        focal="object-center"
        eyebrow="The Lab"
        title="A third space with a front door."
        subtitle="Not home, not work. A real place you can walk into, off the street and out of the noise: dark timber, low amber light, the smell of cedar and steam, greenery in every corner. A room engineered to bring your whole nervous system back to baseline. The first one is taking root in North County San Diego."
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
          A feed can keep people warm between meetings. It can&apos;t hold the
          weight of a sound bath, the gasp of a cold plunge, or the long exhale
          of the hour after, when nobody reaches for their keys. The Lab is the
          room those things happen in: a place built to be felt in the body, not
          scrolled past on a screen.
        </Lead>
        <Body>
          The moment the door closes behind you, the city drops away. The air
          turns warm and a little resinous. Light, sound, temperature, cedar
          underfoot, and the people in the room are all tuned to do one thing:
          drop your shoulders, slow your breath, and bring you back to yourself,
          then back to each other.
        </Body>
      </Section>

      <Statement tone="surface">
        Not a gym. Not a café. Not a studio.{' '}
        <span className="text-primary">All of it</span>, on purpose.
      </Statement>

      {/* ── Room by room: the body's journey through the space ───────────── */}
      <ZigZag
        img="/images/site/lab-concept.jpg"
        alt="A warm, plant-filled movement floor inside The Lab, timber underfoot and greenhouse glass overhead, lit low for an evening class"
        eyebrow="Movement studios · arrival"
        title="Rooms built to move you."
        imgAspect="landscape"
        imgPosition="left"
        tone="surface"
      >
        <p>
          Step in off the street and the traffic noise falls away in a single
          beat. Warm timber under bare feet, plants spilling from every corner,
          glass reaching up toward the dark, and a sound system that wraps the
          whole room. Your shoulders drop before the class even starts.
        </p>
        <p>
          Breathwork as the sun comes up and the floor is still cool. Strength
          through the middle of the day. Ecstatic dance once the lights go low
          and the bass climbs out of the floor and into your chest, until you
          forget there was ever a screen in your pocket. Every studio is built
          around your nervous system, not a wall of mirrors.
        </p>
        <p>
          The schedule is shaped by the community, not a franchise playbook. The
          practices people keep showing up for are the ones that stay on the
          board.
        </p>
      </ZigZag>

      <ZigZag
        img="/images/site/lab-thermal.jpg"
        alt="The cedar sauna and thermal circuit at The Lab, amber light strips glowing across slatted wood and steam rising off the water"
        eyebrow="The thermal circuit · heat"
        title="First the heat."
        imgAspect="natural"
        reverse
        tone="canvas"
      >
        <p>
          Push open the cedar door and the heat meets you like a wall. Within a
          minute the sweat beads, the breath lengthens and slows, and the
          chatter in your head goes quiet. Amber light pools low along the slats.
          The air is thick and resinous with steam and the smell of warm wood,
          and you feel the day start to loosen its grip on your shoulders.
        </p>
        <p>
          This is the first half of the loop, the part that opens you all the
          way up before the cold snaps you back. You sit until the noise burns
          off and you can feel your own pulse in your wrists and throat. Twenty
          minutes in here can reset a whole day. It&apos;s the ritual the
          regulars quietly build their week around.
        </p>
      </ZigZag>

      <ZigZag
        img="/images/site/lab-pool.jpg"
        alt="The cold plunge pool at The Lab, dark still water lit by a thin line of amber under the stone rim"
        eyebrow="The cold pool · shock"
        title="Then the cold."
        imgAspect="landscape"
        imgPosition="bottom"
        tone="surface"
      >
        <p>
          Out of the sauna and straight to the rim of the plunge, skin still
          steaming in the cool air. One breath in, then under. The cold closes
          around you like a hand and every loose thought goes silent at once.
          The gasp is involuntary. So is the grin that follows it.
        </p>
        <p>
          The contrast is the medicine. Heat then cold floods you with a clarity
          you could never talk yourself into: the breath quick and electric, the
          mind scrubbed clean, the body wide awake. You climb out laughing with a
          stranger across the steam. Do it alone and it&apos;s a habit. Do it
          with your circle and it becomes the thing you text each other about at
          six in the morning.
        </p>
      </ZigZag>

      <PullQuote tone="canvas">
        You leave lighter than you walked in.{' '}
        <span className="text-primary">Heat, cold, and the long exhale</span>{' '}
        after.
      </PullQuote>

      <ZigZag
        img="/images/site/lab-lounge.jpg"
        alt="The connection bar lounge at The Lab: dark slatted wood, a warm amber chair, low light and soft seating"
        eyebrow="The connection bar · the exhale"
        title="Where you land after."
        imgAspect="landscape"
        imgPosition="left"
        reverse
        tone="canvas"
      >
        <p>
          Skin still humming, nervous system finally settled, you land at the bar
          with a warm mug between both hands and someone you didn&apos;t know an
          hour ago in the next seat. The light is low and amber, the slatted wood
          drinks the sound, and the whole room seems to exhale with you. No
          alcohol agenda here: adaptogens, coffee, tea, and the long unhurried
          lingering that most rooms are quietly designed to prevent.
        </p>
        <p>
          This is the third place between the studio and the front door, the hush
          after the work, where shoulders stay down and the conversation runs
          long and strangers quietly become the people you keep coming back for.
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
        alt="The events floor at The Lab set for an evening gathering, the stage washed in colored light and warmth spilling across the open floor"
        eyebrow="The events floor"
        title="Room to gather."
        imgAspect="landscape"
        imgPosition="right"
        tone="ink"
      >
        <p>
          The same events you RSVP&apos;d to in the app, sound baths, workshops,
          sunset socials, the occasional full-blown celebration, happening in a
          room built to hold a crowd that actually knows each other. The lights
          drop, color washes the floor, and the whole space leans in.
        </p>
        <p>
          When a circle outgrows a living room, this is where it lands. The floor
          flexes from a hushed ceremony, a hundred people breathing in time, to a
          packed Saturday night with the bass up and the doors thrown open.
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

      {/* The loop, in numbers — a quick proof rhythm before the location turn */}
      <Section tone="surface">
        <SectionHeading
          eyebrow="The loop"
          title="One circuit, head to toe."
          kicker="Heat, cold, then the long exhale."
        />
        <div className="grid grid-cols-3 gap-6 sm:gap-8">
          <Stat value="5" label="Rooms under one roof" />
          <Stat value="1" label="Continuous circuit" />
          <Stat value="0" label="Mirrors on the wall" />
        </div>
      </Section>

      {/* ── Tie to community + the founding location ─────────────────────── */}
      <Section tone="canvas">
        <SectionHeading
          eyebrow="Where it begins"
          title="Founded in North County San Diego."
          kicker="The first room, built by the first members."
        />
        <Lead>
          The first Lab is a prototype: a flagship rooted in one neighborhood,
          shaped by the people it serves. By the time a place is ready for a Lab,
          the community is already there: the circles are meeting, the rituals
          are forming, the regulars know each other&apos;s names.
        </Lead>
        <Body>
          It&apos;s built from day one to be repeatable, so the version that works
          in {FOUNDING_PLACE} can open in your city next. The community always
          comes first; the Lab is simply where it gets a body.
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
