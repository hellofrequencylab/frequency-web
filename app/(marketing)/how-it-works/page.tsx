import type { Metadata } from 'next'
import Link from 'next/link'
import {
  ArrowRight,
  Compass,
  Users,
  CalendarCheck,
  Sprout,
  Network,
  HandHeart,
  Radar,
  PenLine,
  BellRing,
  LayoutDashboard,
  ShieldCheck,
} from 'lucide-react'
import { Render } from '@measured/puck/rsc'
import {
  PhotoHero,
  Section,
  SectionHeading,
  ZigZag,
  Statement,
  Marquee,
  BetaCTA,
} from '@/components/marketing/marketing-ui'
import { config } from '@/lib/page-editor/config'
import { getPublishedData } from '@/lib/page-editor/data'
import { BETA_CTA_LABEL, BETA_CTA_HREF, FOUNDING_PLACE } from '@/lib/site'

export const revalidate = 3600

export const metadata: Metadata = {
  title: 'How it works',
  description:
    'Frequency is built bottom-up, from the people, not the org chart. Interests, Circles, and the gatherings that grow from them.',
  alternates: { canonical: '/how-it-works' },
  openGraph: {
    title: 'How Frequency works',
    description: 'Interests and Circles. Community with a shape, built to last.',
    url: '/how-it-works',
  },
}

export default async function HowItWorksPage() {
  const data = await getPublishedData('how-it-works')
  if (data && Array.isArray(data.content) && data.content.length > 0) {
    return <Render config={config} data={data} />
  }
  return <LegacyHowItWorks />
}

function LegacyHowItWorks() {
  return (
    <>
      <PhotoHero
        image="/images/site/22a51611-07f6-4c39-8a26-1c996295b6d3.jpg"
        alt="A Frequency community dancing together outdoors in golden-hour light"
        focal="object-center"
        eyebrow="How it works"
        title={
          <>
            Community with
            <br className="hidden sm:block" /> a shape.
          </>
        }
        subtitle="Most communities are a feed and a hope. Frequency has a structure that actually grows — and it only takes two words to belong."
      >
        <Link
          href={BETA_CTA_HREF}
          className="inline-flex items-center gap-2 rounded-2xl bg-primary text-on-primary px-8 py-3.5 font-bold hover:bg-primary-hover transition-colors shadow-pop"
        >
          {BETA_CTA_LABEL} <ArrowRight className="w-5 h-5" />
        </Link>
      </PhotoHero>

      {/* The three steps — how you actually get from curious to belonging */}
      <Section tone="surface">
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
            text="Choose an Interest — movement, breathwork, holistic health, creativity, human relating. It's the thread that ties you to people who care about the same thing."
          />
          <Step
            n="02"
            icon={Users}
            title="Join a Circle"
            text="Find your people near you. A small group built around your Interest, with an always-on virtual space and a standing time to meet in person."
          />
          <Step
            n="03"
            icon={CalendarCheck}
            title="Show up"
            text="That's the whole secret. Small enough that you're missed when you don't come — so showing up stops feeling like effort and starts feeling like home."
          />
        </div>
      </Section>

      {/* Interests + Circles — the core mechanic, in detail */}
      <ZigZag
        img="/images/site/971634cd-1d52-4b3a-a0ab-5713d395d58a.jpg"
        alt="A Frequency Circle gathered for breathwork outdoors"
        eyebrow="Where you belong"
        title="Interests and Circles"
        kicker="Two words are all it takes to find your place."
        imgAspect="landscape"
        tone="canvas"
      >
        <p>
          An <strong className="text-text">Interest</strong> is what you
          practice: movement, breathwork, holistic health, creativity, human
          relating. It connects you to people everywhere who care about the same
          things you do.
        </p>
        <p>
          A <strong className="text-text">Circle</strong> is your people, near
          you. A small group built around an Interest, with an always-on virtual
          space, and often a standing time to meet in person. Small enough that
          you&apos;re missed when you don&apos;t show up.
        </p>
      </ZigZag>

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
        tone="surface"
      >
        <p>
          Circles are designed to divide. When one fills up, it doesn&apos;t put
          people on a waitlist. It seeds a new Circle, led by someone who was
          ready to step up.
        </p>
        <p>
          A handful of neighbouring Circles becomes a neighborhood. Neighborhoods
          become a whole local community. None of it is appointed from above. It
          grows on its own momentum, the way real things do.
        </p>
      </ZigZag>

      {/* The shape of how it scales, made concrete */}
      <Section tone="canvas">
        <SectionHeading
          eyebrow="The shape of it"
          title="From one circle to a whole community."
          kicker="Nobody hands it down. It grows from the inside out."
        />
        <div className="grid gap-5 sm:grid-cols-3">
          <Layer
            icon={Users}
            title="A Circle"
            text="A handful of neighbors around one Interest. The smallest unit that can hold you."
          />
          <Layer
            icon={Network}
            title="A neighborhood"
            text="Circles that divide and multiply until your corner of the map is full of them."
          />
          <Layer
            icon={Sprout}
            title="A community"
            text="A whole local ecosystem — leaderful, self-sustaining, grown rather than built."
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
          Communities built around one charismatic founder live and die with
          that person. We&apos;ve all watched it happen. So Frequency is built
          to be the opposite: leaderful, not leader-dependent.
        </p>
        <p>
          Leaders rise from showing up, not from being anointed. Take the same
          structure away from any one of us and it keeps running, because the
          practices, the places, and the people were the point all along.
        </p>
      </ZigZag>

      {/* Rhythm band — marquee inside a dark slat band */}
      <section className="bg-slat">
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
      </section>

      {/* What makes a Circle hold — the pay-it-forward heart */}
      <Section tone="surface">
        <SectionHeading
          eyebrow="What holds it together"
          title="Leaderful, not leader-dependent."
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
            text="Leaders rise from showing up and looking after the people around them — never from being anointed from above."
          />
          <Hold
            icon={HandHeart}
            title="Pay it forward"
            text="When you can give a little more, you hold the door for the next person. Circulation, not exclusion."
          />
        </div>
      </Section>

      {/* AI as a companion to the host — sits beside the guru-free / leaderful beat */}
      <CompanionCoach />

      <Statement tone="surface">
        The practices, the places, and{' '}
        <span className="text-primary">the people</span> are the point.
      </Statement>

      {/* Where it's happening now — grounding in the real beta */}
      <Section tone="canvas">
        <SectionHeading
          eyebrow="Where it starts"
          title="It begins in one real place."
          kicker={`The founding community is taking shape in ${FOUNDING_PLACE}.`}
        />
        <p className="text-lg text-muted leading-relaxed">
          Every cell starts somewhere. Ours is taking root in{' '}
          {FOUNDING_PLACE} — real Circles, real gatherings, real neighbors who
          show up for each other. Join the beta and you&apos;re not a number on a
          waitlist; you&apos;re one of the people this whole thing grows from.
        </p>
      </Section>

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
    <div className="relative flex flex-col rounded-3xl border border-border bg-surface p-7 shadow-sm">
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
    </div>
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
    <div className="rounded-2xl border border-border bg-surface p-6">
      <div className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-primary-bg/50 mb-4">
        <Icon className="w-5 h-5 text-primary-strong" />
      </div>
      <h3 className="font-display uppercase text-text text-xl mb-2">{title}</h3>
      <p className="text-sm text-muted leading-relaxed">{text}</p>
    </div>
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
    <div className="rounded-2xl border border-border bg-surface p-6">
      <div className="flex items-center gap-2.5 mb-3">
        <Icon className="w-5 h-5 text-primary-strong" />
        <h3 className="font-bold text-text text-lg leading-snug">{title}</h3>
      </div>
      <p className="text-sm text-muted leading-relaxed">{text}</p>
    </div>
  )
}

// Tactical "AI as companion coach" beat. Each capability is framed as a pain
// point a host actually feels, then what the operator does about it — with a
// hard human-in-the-loop guardrail so it never reads as hands-off automation.
const companionItems: { icon: IconType; pain: string; text: string }[] = [
  {
    icon: Radar,
    pain: "You can't keep an eye on everyone.",
    text: "It flags the member who's gone quiet — no verified practice in two weeks — before they drift for good.",
  },
  {
    icon: PenLine,
    pain: "You don't have time to write the check-in.",
    text: 'It drafts it in your voice, with the context of what they last showed up for. Edit a word, or just send.',
  },
  {
    icon: BellRing,
    pain: 'Follow-up is the first thing to slip.',
    text: "Welcomes, re-engagement, a nudge when a streak's about to break — they fire on their own, so momentum doesn't ride on your memory.",
  },
  {
    icon: LayoutDashboard,
    pain: 'Too many tabs.',
    text: 'One surface gathers signals from Circles, events, practice and the game into a single who-needs-me-today view.',
  },
]

function CompanionCoach() {
  return (
    <Section tone="canvas">
      <SectionHeading
        eyebrow="In your corner"
        title={
          <>
            A companion, <span className="text-primary">not a guru</span>.
          </>
        }
        kicker="The admin runs in the background. You stay the human in the loop."
      />
      <p className="text-lg text-muted leading-relaxed mb-9">
        AI runs underneath Frequency as a quiet operator. It doesn&apos;t run your
        community — it clears the busywork so you can: spotting the signals
        you&apos;d miss, drafting the message you don&apos;t have time to write,
        and handing it back for your yes.
      </p>
      <div className="grid gap-5 sm:grid-cols-2">
        {companionItems.map(({ icon: Icon, pain, text }) => (
          <div key={pain} className="rounded-2xl border border-border bg-surface p-6">
            <div className="flex items-center gap-2.5 mb-3">
              <span className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-primary-bg/50">
                <Icon className="w-5 h-5 text-primary-strong" />
              </span>
              <h3 className="font-bold text-text text-lg leading-snug">{pain}</h3>
            </div>
            <p className="text-sm text-muted leading-relaxed">{text}</p>
          </div>
        ))}
      </div>
      <div className="mt-6 flex items-start gap-3 rounded-2xl border border-border bg-surface px-5 py-4">
        <ShieldCheck className="mt-0.5 w-5 h-5 shrink-0 text-primary-strong" />
        <p className="text-sm text-muted leading-relaxed">
          <strong className="text-text">It proposes; you approve.</strong> Nothing
          goes out without you, and anyone who&apos;s opted out is never touched.
          No bots posing as you, no auto-DMs behind your back.
        </p>
      </div>
    </Section>
  )
}
