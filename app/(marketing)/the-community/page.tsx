import type { Metadata } from 'next'
import {
  ArrowRight,
  Brain,
  HeartPulse,
  Sparkle,
  Palette,
  Compass,
  Users,
  CalendarCheck,
  Sprout,
  Network,
  HandHeart,
  Sunrise,
  MessageCircle,
  MapPin,
} from 'lucide-react'
import { Render } from '@measured/puck/rsc'
import {
  PhotoHero,
  Section,
  SectionHeading,
  ZigZag,
  Statement,
  Marquee,
  PillarNav,
  BetaCTA,
  Button,
  Card,
  Lead,
  Body,
} from '@/components/marketing/marketing-ui'
import { config } from '@/lib/page-editor/config'
import { getPublishedData } from '@/lib/page-editor/data'
import { getTemplate, isRenderable } from '@/lib/page-editor/templates'
import { createAdminClient } from '@/lib/supabase/admin'
import { getLiveData } from '@/lib/page-editor/live-data'
import { BETA_CTA_LABEL, BETA_CTA_HREF, FOUNDING_PLACE } from '@/lib/site'
import { JsonLd } from '@/components/json-ld'
import { articleSchema, breadcrumbSchema } from '@/lib/jsonld'
import { ProductTour } from './tour'

export const revalidate = 3600

export const metadata: Metadata = {
  title: 'The Community',
  description:
    'You don’t need another app. You need your people. Pillars, Channels, and Circles: small standing groups that grow on their own.',
  alternates: { canonical: '/the-community' },
  openGraph: {
    title: 'The Community · Frequency',
    description:
      'Four Pillars, your Channels, and a Circle near you. Community with a shape, leaderful and built to last.',
    url: '/the-community',
  },
}

const CHANNELS = [
  {
    icon: Brain,
    title: 'Mind',
    body: 'Meditation, breathwork, learning. The quiet practices that help you switch off and sharpen a life.',
  },
  {
    icon: HeartPulse,
    title: 'Body',
    body: 'Movement, strength, cold and heat, the run club and the sauna night. The practices you feel the next morning.',
  },
  {
    icon: Sparkle,
    title: 'Spirit',
    body: 'Ceremony, sound, human relating, the men’s table and the women’s circle. The work you do shoulder to shoulder.',
  },
  {
    icon: Palette,
    title: 'Expression',
    body: 'Music, art, dance, making things with your hands. The creative practices that need a room and a crowd.',
  },
]

export default async function TheCommunityPage() {
  // getPublishedData -> getTemplate -> legacy: prefer the operator-published doc,
  // else the designed git template (so the designed page is live without a DB
  // publish), with the hardcoded legacy component as a last resort.
  const published = await getPublishedData('the-community')
  const template = getTemplate('the-community')
  const data = isRenderable(published) ? published : isRenderable(template) ? template : null
  const live = data ? await getLiveData(createAdminClient()).catch(() => null) : null
  return (
    <>
      <JsonLd
        data={[
          // Article schema so answer engines treat the pillar explainer as a
          // citable source for "how Frequency's community works" (GE11-4).
          articleSchema({
            title: 'The Community',
            description:
              'How Frequency organizes community: four Pillars to find your practice, Channels to find your people, and Circles, small standing local groups that meet in person and grow on their own.',
            path: '/the-community',
            image: '/images/site/22a51611-07f6-4c39-8a26-1c996295b6d3.jpg',
          }),
          breadcrumbSchema([{ name: 'The Community', path: '/the-community' }]),
        ]}
      />
      {data ? <Render config={config} data={data} metadata={live ? { live } : {}} /> : <LegacyTheCommunity />}
    </>
  )
}

function LegacyTheCommunity() {
  return (
    <>
      <PhotoHero
        image="/images/site/22a51611-07f6-4c39-8a26-1c996295b6d3.jpg"
        alt="A Frequency community dancing together outdoors in golden-hour light"
        focal="object-center"
        eyebrow="The Community"
        title={
          <>
            You don&apos;t need another app.
            <br className="hidden sm:block" /> You need your people.
          </>
        }
        subtitle="Most communities are a feed and a hope. Frequency has a structure that actually grows, and it only takes two words to belong."
      >
        <Button href={BETA_CTA_HREF}>
          {BETA_CTA_LABEL} <ArrowRight className="w-5 h-5" />
        </Button>
      </PhotoHero>

      {/* The premise */}
      <Section tone="canvas" pad="pt-20 pb-10 sm:pt-24 sm:pb-12">
        <SectionHeading
          eyebrow="The premise"
          title="The cure for too many feeds isn't one more."
          kicker="It's a few real people, near you, who notice when you're gone."
        />
        <Lead>
          You already have the apps. What you&apos;re missing is the standing time,
          the handful of faces, the small group small enough that your absence
          leaves a hole. That&apos;s not a feature you download. It&apos;s a
          structure you join.
        </Lead>
        <Body>
          Frequency gives community a shape: four Pillars to find your practice,
          Channels to find your people, and Circles to actually belong. No
          application, no audition, two words and you&apos;re in the room.
        </Body>
      </Section>

      <Statement tone="surface">
        Not a feed. Not a follower count.{' '}
        <span className="text-primary">A few people who notice.</span>
      </Statement>

      {/* The four Pillars — the parts a whole life moves through */}
      <Section tone="surface">
        <SectionHeading
          eyebrow="The four Pillars"
          title="A whole life has four Pillars."
          kicker="Mind, Body, Spirit, Expression. Start in any of them."
        />
        <p className="text-lg text-muted leading-relaxed mb-9">
          The Pillars are the four parts a real life moves through. They&apos;re the
          map you arrive on: pick the one that&apos;s calling you right now, and the
          Channels and Circles inside it are where you actually land.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {CHANNELS.map((c) => (
            <Card
              key={c.title}
              tone="feature"
              className="hover:border-border-strong transition-colors"
            >
              <div className="w-11 h-11 rounded-2xl bg-primary-bg flex items-center justify-center mb-4">
                <c.icon className="w-5 h-5 text-primary-strong" aria-hidden />
              </div>
              <h3 className="font-display uppercase text-text text-2xl leading-none">
                {c.title}
              </h3>
              <p className="mt-3 text-base text-muted leading-relaxed">{c.body}</p>
            </Card>
          ))}
        </div>
      </Section>

      {/* The three steps — how you actually get from curious to belonging */}
      <Section tone="canvas">
        <SectionHeading
          eyebrow="From the people, not the org chart"
          title="Three steps to belong."
          kicker="No application. No audition. Two words and you're in the room."
        />
        <div className="grid gap-5 sm:grid-cols-3">
          <Step
            n="01"
            icon={Compass}
            title="Pick what you practice"
            text="Choose a Pillar, then a Channel inside it: breathwork, strength, supper clubs, sound. It's the thread that ties you to people who care about the same thing."
          />
          <Step
            n="02"
            icon={Users}
            title="Join a Circle"
            text="Find your people near you. A small standing group built around your Channel, with an always-on virtual space and a standing time to meet in person."
          />
          <Step
            n="03"
            icon={CalendarCheck}
            title="Show up"
            text="That's the whole secret. Small enough that you're missed when you don't come, so showing up stops feeling like effort and starts feeling like home."
          />
        </div>
      </Section>

      {/* Channels + Circles — the core mechanic, in detail */}
      <ZigZag
        img="/images/site/971634cd-1d52-4b3a-a0ab-5713d395d58a.jpg"
        alt="A Frequency Circle gathered for breathwork outdoors"
        eyebrow="Where you belong"
        title="Channels and Circles"
        kicker="Two words are all it takes to find your place."
        imgAspect="landscape"
        tone="surface"
      >
        <p>
          A <strong className="text-text">Channel</strong> is what you practice:
          a topic inside a Pillar. Surfing, sound baths, strength, human relating.
          It connects you to people everywhere who care about the same things you
          do.
        </p>
        <p>
          A <strong className="text-text">Circle</strong> is your people, near you.
          A small standing group built around a Channel, with an always-on
          virtual space, and a standing time to meet in person. Small enough that
          you&apos;re missed when you don&apos;t show up.
        </p>
      </ZigZag>

      {/* The app — an interactive look at what carries the thread day to day */}
      <Section tone="canvas">
        <SectionHeading
          eyebrow="The app"
          title="Your people, in your pocket."
          kicker="Tap through the four things you'll actually use."
        />
        <ProductTour />
      </Section>

      <Statement tone="surface">
        Two words are all you need to{' '}
        <span className="text-primary">belong</span>.
      </Statement>

      {/* The growth loop — cells, not franchises */}
      <ZigZag
        img="/images/site/PHOTO-2020-09-09-16-38-27.jpeg"
        alt="A large Frequency community practicing yoga together on a lawn"
        eyebrow="How it grows"
        title="It spreads like cells, not franchises."
        imgAspect="landscape"
        reverse
        tone="canvas"
      >
        <p>
          Circles are designed to divide. When one fills up, it doesn&apos;t put
          people on a waitlist. It seeds a new Circle, led by someone who was ready
          to step up.
        </p>
        <p>
          A handful of neighbouring Circles becomes a neighborhood. Neighborhoods
          become a whole local community. None of it is appointed from above. It
          grows on its own momentum, the way real things do.
        </p>
      </ZigZag>

      {/* The shape of how it scales, made concrete */}
      <Section tone="surface">
        <SectionHeading
          eyebrow="The shape of it"
          title="From one Circle to a whole community."
          kicker="Nobody hands it down. It grows from the inside out."
        />
        <div className="grid gap-5 sm:grid-cols-3">
          <Layer
            icon={Users}
            title="A Circle"
            text="A handful of neighbors around one Channel. The smallest unit that can hold you."
          />
          <Layer
            icon={Network}
            title="A neighborhood"
            text="Circles that divide and multiply until your corner of the map is full of them."
          />
          <Layer
            icon={Sprout}
            title="A community"
            text="A whole local ecosystem: leaderful, self-sustaining, grown rather than built."
          />
        </div>
      </Section>

      {/* Guru-free — the dark beat */}
      <ZigZag
        img="/images/site/PHOTO-2020-10-17-13-49-14.jpeg"
        alt="A Frequency music circle gathered on a cliffside at golden hour"
        eyebrow="Why it lasts"
        title="Guru-free. By design."
        imgAspect="landscape"
        reverse
        tone="ink"
      >
        <p>
          Communities built around one charismatic founder live and die with that
          person. We&apos;ve all watched it happen. So Frequency is built to be the
          opposite: leaderful, not leader-dependent.
        </p>
        <p>
          Leaders rise from showing up, not from being anointed. Take the same
          structure away from any one of us and it keeps running, because the
          practices, the places, and the people were the point all along.
        </p>
      </ZigZag>

      {/* Rhythm band — marquee inside a dark slat band */}
      <div className="bg-slat">
        <Marquee
          items={[
            'Pick what you practice',
            'Join a Circle',
            'Show up',
            'Be missed when you don’t',
            'Lead by showing up',
            'Pay it forward',
          ]}
        />
      </div>

      {/* What makes a Circle hold — the pay-it-forward heart */}
      <Section tone="surface">
        <SectionHeading
          eyebrow="What holds it together"
          title="Leaderful, not leader-dependent."
          kicker="Three things keep a Circle standing on its own."
        />
        <div className="grid gap-5 sm:grid-cols-3">
          <Hold
            icon={CalendarCheck}
            title="Small and standing"
            text="Circles stay small on purpose. A standing time, the same faces, and the quiet accountability of being noticed."
          />
          <Hold
            icon={Sprout}
            title="Earned, not appointed"
            text="Leaders rise from showing up and looking after the people around them, never from being anointed from above."
          />
          <Hold
            icon={HandHeart}
            title="Pay it forward"
            text="When you can give a little more, you hold the door for the next person. Circulation, not exclusion."
          />
        </div>
      </Section>

      <Statement tone="surface">
        The practices, the places, and{' '}
        <span className="text-primary">the people</span> are the point.
      </Statement>

      {/* A day in Frequency — how the structure plays out in real life */}
      <Section tone="canvas">
        <SectionHeading
          eyebrow="A day in Frequency"
          title="One ordinary Tuesday."
          kicker="How the thread pulls you back to people."
        />
        <ol className="space-y-5">
          <DayBeat
            icon={Sunrise}
            time="6:15a"
            title="The bluff before work"
            body="Your Sunrise Breathwork circle meets on Moonlight Beach. Cold, gold, quiet. You leave regulated instead of wired."
          />
          <DayBeat
            icon={MessageCircle}
            time="9:40a"
            title="A ping from the circle"
            body="Someone posts a photo from the morning. A few zaps, a couple of replies. The thread keeps the warmth alive between meetings."
          />
          <DayBeat
            icon={CalendarCheck}
            time="1:00p"
            title="One tap to RSVP"
            body="An event drops for Saturday's thermal circuit. You tap RSVP. Now you're expected, and you'll be missed if you don't show."
          />
          <DayBeat
            icon={MapPin}
            time="6:30p"
            title="Meet in the flesh"
            body="After work you walk into the room. Faces you know from the feed are already there. The app brought you here; the people take over."
          />
        </ol>
      </Section>

      {/* Where it's happening now — grounding in the real beta */}
      <Section tone="canvas">
        <SectionHeading
          eyebrow="Where it starts"
          title="It begins in one real place."
          kicker={`The founding community is taking shape in ${FOUNDING_PLACE}.`}
        />
        <Body>
          Every cell starts somewhere. Ours is taking root in {FOUNDING_PLACE}:
          real Circles, real gatherings, real neighbors who show up for each other.
          Join the beta and you&apos;re not a number on a waitlist; you&apos;re one
          of the people this whole thing grows from. And you can start anywhere: a
          Circle only needs a few people and a standing time.
        </Body>
      </Section>

      <PillarNav current="/the-community" tone="surface" />

      <BetaCTA
        heading="Find your people."
        body="Pick what you practice, find a Circle near you, and start showing up."
      />
    </>
  )
}

// ── Local sub-components ──────────────────────────────────────────────────────

type IconType = React.ComponentType<{ className?: string }>

function Step({
  n,
  icon: Icon,
  title,
  text,
}: {
  n: string
  icon: IconType
  title: string
  text: string
}) {
  return (
    <Card tone="feature" className="relative flex flex-col">
      <div className="flex items-center justify-between mb-5">
        <span className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-primary-bg/50">
          <Icon className="w-5 h-5 text-primary-strong" />
        </span>
        <span className="font-display uppercase text-4xl text-border-strong leading-none">
          {n}
        </span>
      </div>
      <h3 className="font-display uppercase text-text text-2xl mb-2">{title}</h3>
      <p className="text-sm text-muted leading-relaxed">{text}</p>
    </Card>
  )
}

function Layer({
  icon: Icon,
  title,
  text,
}: {
  icon: IconType
  title: string
  text: string
}) {
  return (
    <Card tone="feature">
      <div className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-primary-bg/50 mb-4">
        <Icon className="w-5 h-5 text-primary-strong" />
      </div>
      <h3 className="font-display uppercase text-text text-xl mb-2">{title}</h3>
      <p className="text-sm text-muted leading-relaxed">{text}</p>
    </Card>
  )
}

function Hold({
  icon: Icon,
  title,
  text,
}: {
  icon: IconType
  title: string
  text: string
}) {
  return (
    <Card tone="feature">
      <div className="flex items-center gap-2.5 mb-3">
        <Icon className="w-5 h-5 text-primary-strong" />
        <h3 className="font-bold text-text text-lg leading-snug">{title}</h3>
      </div>
      <p className="text-sm text-muted leading-relaxed">{text}</p>
    </Card>
  )
}

function DayBeat({
  icon: Icon,
  time,
  title,
  body,
}: {
  icon: IconType
  time: string
  title: string
  body: string
}) {
  return (
    <li className="flex items-start gap-4 rounded-2xl border border-border bg-surface p-5 sm:p-6 shadow-sm">
      <div className="shrink-0 w-12 h-12 rounded-2xl bg-primary-bg flex items-center justify-center">
        <Icon className="w-6 h-6 text-primary-strong" aria-hidden />
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="font-display uppercase text-text text-xl leading-none">
            {title}
          </span>
          <span className="text-xs font-bold uppercase tracking-widest text-primary-strong">
            {time}
          </span>
        </div>
        <p className="mt-2 text-base text-muted leading-relaxed">{body}</p>
      </div>
    </li>
  )
}
