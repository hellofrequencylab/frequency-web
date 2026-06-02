import type { Metadata } from 'next'
import { Render } from '@measured/puck/rsc'
import { Radar, PenLine, BellRing, LayoutDashboard, ShieldCheck } from 'lucide-react'
import {
  PageHero,
  ZigZag,
  Statement,
  BetaCTA,
  Section,
  SectionHeading,
  Lead,
} from '@/components/marketing/marketing-ui'
import { config } from '@/lib/page-editor/config'
import { getPublishedData } from '@/lib/page-editor/data'

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
      <PageHero
        eyebrow="The model"
        title="Community with a shape."
        subtitle="Most communities are a feed and a hope. Frequency has a structure that actually grows. And it only takes two words to belong."
      />

      {/* Interests + Circles */}
      <ZigZag
        img="/images/site/community-1.jpg"
        alt="A Frequency Circle gathering outdoors"
        eyebrow="Where you belong"
        title="Interests and Circles"
        imgAspect="landscape"
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

      <Statement tone="canvas">
        Two words are all you need to{' '}
        <span className="text-primary">belong</span>.
      </Statement>

      {/* The growth loop */}
      <ZigZag
        img="/images/site/moonlight-1.jpg"
        alt="A large Frequency community gathering"
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

      {/* Guru-free */}
      <ZigZag
        img="/images/site/moonlight-2.jpg"
        alt="A Frequency gathering at the beach"
        eyebrow="Why it lasts"
        title="Guru-free. By design."
        imgAspect="portrait"
        imgPosition="top"
        tone="canvas"
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

      <Statement tone="surface">
        The practices, the places, and{' '}
        <span className="text-primary">the people</span> are the point.
      </Statement>

      <CompanionCoach />

      <BetaCTA
        heading="Find your people."
        body="Pick what you practice, find a Circle near you, and start showing up."
      />
    </>
  )
}

// Tactical "AI as companion coach" section. Frames each capability as a pain
// point hosts actually feel, then what the operator does about it — and keeps a
// hard human-in-the-loop guardrail so it never reads as hands-off automation.
const companionItems = [
  {
    icon: Radar,
    pain: "You can't keep an eye on everyone.",
    body: "It flags the member who's gone quiet — no verified practice in two weeks — before they drift for good.",
  },
  {
    icon: PenLine,
    pain: "You don't have time to write the check-in.",
    body: "It drafts it in your voice, with the context of what they last showed up for. Edit a word, or just send.",
  },
  {
    icon: BellRing,
    pain: 'Follow-up is the first thing to slip.',
    body: "Welcomes, re-engagement, a nudge when a streak's about to break — they fire on their own, so momentum doesn't ride on your memory.",
  },
  {
    icon: LayoutDashboard,
    pain: 'Too many tabs.',
    body: 'One surface pulls signals from Circles, events, practice and the game into a single “who needs me today” view.',
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
      <Lead>
        AI runs underneath Frequency as a quiet operator. It doesn&apos;t run your
        community — it clears the busywork so you can: watching the signals
        you&apos;d miss, drafting the message you don&apos;t have time to write,
        and handing it back for your yes.
      </Lead>
      <div className="mt-10 grid gap-x-8 gap-y-9 sm:grid-cols-2">
        {companionItems.map(({ icon: Icon, pain, body }) => (
          <div key={pain} className="flex gap-4">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary-bg text-primary-strong">
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-extrabold leading-snug text-text">{pain}</h3>
              <p className="mt-1.5 text-base leading-relaxed text-muted">{body}</p>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-10 flex items-start gap-3 rounded-2xl border border-border bg-surface px-5 py-4 text-base leading-relaxed text-muted">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-signal-strong" />
        <span>
          <strong className="text-text">It proposes; you approve.</strong> Nothing
          goes out without you, and anyone who&apos;s opted out is never touched.
          No bots posing as you, no auto-DMs behind your back.
        </span>
      </p>
    </Section>
  )
}
