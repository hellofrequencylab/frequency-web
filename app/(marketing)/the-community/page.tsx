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
  PullQuote,
  Stat,
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
import { BETA_CTA_LABEL, BETA_CTA_HREF, FOUNDING_PLACE } from '@/lib/site'
import { ProductTour } from './tour'

export const revalidate = 3600

export const metadata: Metadata = {
  title: 'The Community',
  description:
    'You don’t need another app. You need your people. Channels, Interests, and Circles: small standing groups that grow on their own.',
  alternates: { canonical: '/the-community' },
  openGraph: {
    title: 'The Community · Frequency',
    description:
      'Four channels, your interests, and a Circle near you. Community with a shape, leaderful and built to last.',
    url: '/the-community',
  },
}

const CHANNELS = [
  {
    icon: Brain,
    title: 'Mind',
    body: 'Meditation, breathwork, learning, the quiet practices that settle a nervous system. The people who text you the morning you skip it, just so you know the seat was there.',
  },
  {
    icon: HeartPulse,
    title: 'Body',
    body: 'Movement, strength, cold and heat, the run club and the sauna night. The faces you sweat next to week after week, until one day they stop being faces and become your people.',
  },
  {
    icon: Sparkle,
    title: 'Spirit',
    body: 'Ceremony, sound, human relating, the men’s table and the women’s circle. The work you do shoulder to shoulder, where you put down the version of yourself everyone else gets and are finally just known.',
  },
  {
    icon: Palette,
    title: 'Expression',
    body: 'Music, art, dance, making things with your hands. The room that turns and lights up when you walk in carrying your guitar again, because they saved you the corner by the window.',
  },
]

export default async function TheCommunityPage() {
  const data = await getPublishedData('the-community')
  if (data && Array.isArray(data.content) && data.content.length > 0) {
    return <Render config={config} data={data} />
  }
  return <LegacyTheCommunity />
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
        subtitle="The faces that light up when you walk in. A standing time, a handful of regulars, your usual seat already saved. The quiet relief of being known by name, and missed the week you don't come. Frequency gives that a shape, and it only takes two words to belong."
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
          You can have a thousand followers and still drive home alone. What
          you&apos;re missing isn&apos;t reach. It&apos;s the standing time, the
          handful of faces, the room small enough that your empty chair gets
          noticed before the night is over.
        </Lead>
        <Body>
          Think of the last place you felt that. A team, a band, a house you all
          lived in, a season that ended. The thing you miss isn&apos;t the
          activity. It&apos;s being expected. Walking in and having someone glance
          up, grin, and go back to what they were doing, because you arriving was
          ordinary, and ordinary is the whole point.
        </Body>
        <Body>
          That kind of belonging never came from a feed, and it won&apos;t come
          from one more. It comes from a shape: somewhere to show up, the same
          people to show up for, and enough of a rhythm that being there stops
          feeling like a plan and starts feeling like home. Frequency is that
          shape, and joining it takes two words, not an application.
        </Body>
      </Section>

      <Statement tone="surface">
        Not a feed. Not a follower count.{' '}
        <span className="text-primary">A few people who notice.</span>
      </Statement>

      {/* The feeling, made concrete — a belonging stat row */}
      <Section tone="canvas">
        <SectionHeading
          eyebrow="The shape of belonging"
          title="Small on purpose."
          kicker="Belonging needs a number small enough to hold you."
        />
        <p className="text-lg text-muted leading-relaxed mb-9 max-w-prose">
          A crowd can&apos;t miss you. A Circle can. These are the numbers that
          turn a room full of strangers into the people who keep a seat warm for
          you.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-8">
          <Stat value="8–12" label="Faces in a Circle" />
          <Stat value="1" label="Standing time a week" />
          <Stat value="2" label="Words to belong" />
          <Stat value="0" label="Applications to fill out" />
        </div>
      </Section>

      {/* The four channels — the domains a whole life moves through */}
      <Section tone="surface">
        <SectionHeading
          eyebrow="The four channels"
          title="A whole life has four channels."
          kicker="Mind, Body, Spirit, Expression. Start in any of them."
        />
        <p className="text-lg text-muted leading-relaxed mb-9">
          Channels are the four domains a real life moves through. They&apos;re the
          map you arrive on: pick the one that&apos;s calling you right now, and the
          interests and Circles inside it are where you actually land, among people
          who lit up the same way you did when they found it. You don&apos;t have to
          arrive sure of anything. You just have to walk toward the one that feels
          warm.
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
            text="Choose a channel, then an interest inside it: breathwork, strength, supper clubs, sound. It's the thread that pulls you toward people who care about the same thing you do."
          />
          <Step
            n="02"
            icon={Users}
            title="Join a Circle"
            text="Find your people near you. A small standing group built around your interest, small enough that the regulars learn your name on the first night and notice the week you go missing."
          />
          <Step
            n="03"
            icon={CalendarCheck}
            title="Show up"
            text="That's the whole secret. By the third time, they know your name and your order. By the fifth, your empty chair gets a text before you've even decided not to come. Showing up stops being effort and starts being home."
          />
        </div>
      </Section>

      {/* Interests + Circles — the core mechanic, in detail */}
      <ZigZag
        img="/images/site/971634cd-1d52-4b3a-a0ab-5713d395d58a.jpg"
        alt="A Frequency Circle seated together in meditation at golden hour, faces calm and present"
        eyebrow="Where you belong"
        title="Interests and Circles"
        kicker="Two words are all it takes to find your place."
        imgAspect="portrait"
        imgPosition="top"
        tone="surface"
      >
        <p>
          An <strong className="text-text">interest</strong> is what you practice:
          a topic inside a channel. Surfing, sound baths, strength, human relating.
          It connects you to people everywhere who care about the same things you
          do, the ones who already speak your language, so the first conversation
          starts halfway in.
        </p>
        <p>
          A <strong className="text-text">Circle</strong> is your people, near you.
          A small standing group built around an interest, with an always-on space
          to stay close and a standing time to meet in person. Small enough that
          the regulars learn your name, clock your usual seat, save it when
          you&apos;re running late, and feel it in the room when you go quiet.
        </p>
        <p>
          That is the difference between an audience and a Circle. An audience can
          grow forever and never miss a single person. A Circle is sized so it
          can&apos;t help but notice you.
        </p>
      </ZigZag>

      {/* Sensory beat — the relief of being seen */}
      <ZigZag
        img="/images/site/fd40d12c-7667-4d4e-b4c0-3b828170d9b1.jpg"
        alt="A 'you are beautiful' card propped among people resting on the grass after practice"
        eyebrow="The feeling"
        title="The relief of being seen."
        kicker="Known by name, missed when you're gone."
        imgAspect="landscape"
        imgPosition="center"
        reverse
        tone="canvas"
      >
        <p>
          There is a particular relief that lands the third or fourth time you walk
          into the same room. Nobody explains the rules. Somebody just says your
          name, slides over to make space, and the night carries you. You stop
          rehearsing the small talk in the car and start belonging.
        </p>
        <p>
          That is the whole register Frequency is built for. Faces that light up
          when you come in. The regular who notices you skipped last week and asks
          if you&apos;re alright, and means it. A handful of people for whom your
          showing up is not optional, because they would feel the gap if it
          stopped.
        </p>
        <p>
          You spend years being useful to people and impressive to people. This is
          the rarer thing: being plainly glad-to-see-you to people. No performance
          required, your absence felt, your name already in someone&apos;s mouth
          before you reach the door.
        </p>
      </ZigZag>

      {/* A voice in the build — a regular, on what showing up turned into */}
      <PullQuote tone="surface">
        &ldquo;I came for the cold plunge. I stayed because, six weeks in, a
        near-stranger texted to ask where I&apos;d been.{' '}
        <span className="text-primary">That had not happened to me in years.</span>&rdquo;
      </PullQuote>

      {/* The app — an interactive look at what carries the thread day to day */}
      <Section tone="canvas">
        <SectionHeading
          eyebrow="The app"
          title="Your people, in your pocket."
          kicker="Tap through the four things you'll actually use."
        />
        <p className="text-lg text-muted leading-relaxed mb-9 max-w-prose">
          The app is not where the belonging happens. It&apos;s the thread that
          keeps the warmth alive between meetings, then hands you back to the room.
          A feed small enough to read every face, the Circle you call home, the
          standing times to show up for, and a way to say thank you when someone
          shows up for you. Tap through it.
        </p>
        <ProductTour />
      </Section>

      <Statement tone="surface">
        Two words are all you need to{' '}
        <span className="text-primary">belong</span>.
      </Statement>

      {/* The growth loop — cells, not franchises */}
      <ZigZag
        img="/images/site/PHOTO-2020-09-09-16-38-27.jpeg"
        alt="A large Frequency community practicing yoga together on a lawn at golden hour"
        eyebrow="How it grows"
        title="It spreads like cells, not franchises."
        imgAspect="natural"
        tone="canvas"
      >
        <p>
          Circles are designed to divide. When one fills up, it doesn&apos;t put
          people on a waitlist. It seeds a new Circle, led by someone who was ready
          to step up, so nobody is left standing at the edge of a room that&apos;s
          already full.
        </p>
        <p>
          A handful of neighbouring Circles becomes a neighborhood. Neighborhoods
          become a whole local community. None of it is appointed from above. It
          grows on its own momentum, the way real things do, and every new seat is
          one more person who gets to be known.
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
            text="A handful of neighbors around one interest. The smallest unit that can hold you."
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
        alt="A Frequency music circle gathered in a ring on a cliffside above the ocean at golden hour"
        eyebrow="Why it lasts"
        title="Guru-free. By design."
        imgAspect="natural"
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
      <ZigZag
        img="/images/site/community-1.jpg"
        alt="A large Frequency community spread across a neighborhood lawn at golden hour, mats laid out in rows"
        eyebrow="Where it starts"
        title="It begins in one real place."
        kicker={`The founding community is taking shape in ${FOUNDING_PLACE}.`}
        imgAspect="natural"
        tone="surface"
      >
        <p>
          Every cell starts somewhere. Ours is taking root in {FOUNDING_PLACE}:
          real Circles, real gatherings, real neighbors who show up for each other
          on a Tuesday and notice the Tuesday you don&apos;t.
        </p>
        <p>
          Join the beta and you&apos;re not a number on a waitlist. You&apos;re one
          of the people this whole thing grows from, an early face the next person
          walks in and recognizes. And you can start anywhere: a Circle only needs
          a few people, a standing time, and someone willing to be the first to say
          see you next week.
        </p>
      </ZigZag>

      <PillarNav current="/the-community" tone="canvas" />

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
