import type { Metadata } from 'next'
import {
  ArrowRight,
  Zap,
  Gem,
  Ghost,
  Footprints,
  Eye,
  Radio,
  Telescope,
  Crown,
  Repeat,
  HandHeart,
  Trophy,
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

export const revalidate = 3600

export const metadata: Metadata = {
  title: 'The Quest',
  description:
    'Showing up should count. Earn zaps in person and gems on platform, climb the season ranks, and choose an Arc. You level up by becoming someone your community misses.',
  alternates: { canonical: '/the-quest' },
  openGraph: {
    title: 'The Quest · Frequency',
    description:
      'Real life is the high score. Zaps, gems, season ranks, and Arcs: a path that rewards showing up, not scrolling.',
    url: '/the-quest',
  },
}

type IconType = React.ComponentType<{ className?: string }>

// The season ranks — a path from invisible to indispensable. Framed as who you
// become to the people around you, not a points tier.
const RANKS: { icon: IconType; name: string; tag: string; body: string }[] = [
  {
    icon: Ghost,
    name: 'Ghost',
    tag: 'Just arrived',
    body: 'You found the room. Nobody knows your name yet, and that’s exactly where everyone starts.',
  },
  {
    icon: Footprints,
    name: 'Runner',
    tag: 'Showing up',
    body: 'You keep coming back. The same faces start to expect you, and the standing time becomes yours.',
  },
  {
    icon: Eye,
    name: 'Operative',
    tag: 'Known by name',
    body: 'You’re a regular now. You notice the newcomer in the corner, and you’re the one who says hello.',
  },
  {
    icon: Radio,
    name: 'Agent',
    tag: 'Holding the door',
    body: 'You carry a Circle. You bring people in, smooth the rough edges, and keep the standing time alive.',
  },
  {
    icon: Telescope,
    name: 'Conduit',
    tag: 'Seeding the next',
    body: 'When your Circle fills, you seed the next one. You connect rooms that didn’t know each other.',
  },
  {
    icon: Crown,
    name: 'Luminary',
    tag: 'Missed by many',
    body: 'A whole neighborhood is warmer because you kept showing up. The community would feel your absence.',
  },
]

export default async function TheQuestPage() {
  const data = await getPublishedData('the-quest')
  if (data && Array.isArray(data.content) && data.content.length > 0) {
    return <Render config={config} data={data} />
  }
  return <LegacyTheQuest />
}

function LegacyTheQuest() {
  return (
    <>
      <PhotoHero
        image="/images/site/36d99363-e483-40a0-b173-7e7ee6c1b379.jpg"
        alt="A small group spinning hula hoops together on the beach beneath a lone palm at golden hour"
        focal="object-center"
        eyebrow="The Quest"
        title={
          <>
            Showing up
            <br className="hidden sm:block" /> should count.
          </>
        }
        subtitle="Most apps reward the time you lose to them. The Quest rewards the time you give back to real people. Real life is the high score, and you climb it by becoming someone your community counts on, the kind of regular a room feels the absence of when your chair stays empty."
      >
        <Button href={BETA_CTA_HREF}>
          {BETA_CTA_LABEL} <ArrowRight className="w-5 h-5" />
        </Button>
      </PhotoHero>

      {/* The premise */}
      <Section tone="canvas" pad="pt-20 pb-10 sm:pt-24 sm:pb-12">
        <SectionHeading
          eyebrow="The premise"
          title="Most games waste your life. This one builds it."
          kicker="The reward loop, pointed at the things that actually matter."
        />
        <Lead>
          We know what a good game does to a person: it pulls you back, gives you
          something to climb, makes the next step feel inevitable. The trouble is
          that almost every game spends that pull on nothing, on a number that
          dies when the servers do. The Quest spends it on the opposite. It points
          the whole loop at the things that genuinely make a life: showing up,
          being missed, holding the door for the next person.
        </Lead>
        <Body>
          You don&apos;t grind points. You build a reputation in a real place,
          with real people, who notice when you&apos;re there and feel it when
          you&apos;re not. The progress you can feel isn&apos;t on a bar. It&apos;s
          in the way a room turns when you walk in, the way your name gets said
          before you&apos;ve said anything. The score is just a mirror held up to
          that.
        </Body>
        <Body>
          And it asks for less than you&apos;d think. Not a transformation, not a
          new you by spring. Just the next morning, the next standing time, the
          one small yes you can actually keep. The Quest holds the long arc so you
          only ever have to carry today, and quietly, week over week, today starts
          adding up to a life you recognize as your own.
        </Body>
      </Section>

      <Statement tone="surface">
        Not points to grind.{' '}
        <span className="text-primary">A person to become.</span>
      </Statement>

      {/* Zaps + gems — the two currencies, in detail */}
      <ZigZag
        img="/images/site/PHOTO-2020-10-07-14-38-02.jpeg"
        alt="A Frequency circle gathered close together, one friend lifted and laughing in golden afternoon light"
        eyebrow="Two currencies"
        title="Zaps in person. Gems on platform."
        kicker="One for the room. One for the thread that keeps it warm."
        imgAspect="landscape"
        imgPosition="center"
        tone="canvas"
      >
        <p>
          <strong className="text-text">Zaps</strong> are earned in the flesh.
          You show up to the sunrise circle, you host the sauna night, you bring a
          stranger who becomes a regular. Zaps are the weight of being there, the
          part no screen can fake, given to you by the people who watched you do it.
          A zap isn&apos;t a tap on a button. It&apos;s someone turning to you and
          saying, without saying it, glad you came.
        </p>
        <p>
          <strong className="text-text">Gems</strong> are earned on the platform:
          the small acts that keep a Circle alive between gatherings. A welcome to
          the newcomer, an event that fills the calendar, the photo that pulls
          everyone back. Both flow to the same place: a path you can feel under
          your feet, building whether the season is loud or quiet, whether anyone
          is keeping count or not.
        </p>
      </ZigZag>

      {/* The two currencies, made scannable */}
      <Section tone="surface">
        <SectionHeading
          eyebrow="What you earn"
          title="Earned by being there."
          kicker="Two ways to move, both pointed at real connection."
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card tone="feature" className="hover:border-border-strong transition-colors">
            <div className="w-11 h-11 rounded-2xl bg-signal-bg flex items-center justify-center mb-4">
              <Zap className="w-5 h-5 text-signal-strong" aria-hidden />
            </div>
            <h3 className="font-display uppercase text-text text-2xl leading-none">
              Zaps
            </h3>
            <p className="mt-3 text-base text-muted leading-relaxed">
              In-person gratitude. Earned when you show up, host, or bring someone
              new into the room. The currency of presence.
            </p>
          </Card>
          <Card tone="feature" className="hover:border-border-strong transition-colors">
            <div className="w-11 h-11 rounded-2xl bg-primary-bg flex items-center justify-center mb-4">
              <Gem className="w-5 h-5 text-primary-strong" aria-hidden />
            </div>
            <h3 className="font-display uppercase text-text text-2xl leading-none">
              Gems
            </h3>
            <p className="mt-3 text-base text-muted leading-relaxed">
              On-platform care. Earned by welcoming newcomers, filling the
              calendar, and keeping the thread warm between gatherings.
            </p>
          </Card>
        </div>
      </Section>

      <PullQuote tone="canvas" cite="The whole loop, in one line">
        The reward was never the badge.{' '}
        <span className="text-primary">It was the morning you almost
        skipped, and went.</span>
      </PullQuote>

      {/* The quiet satisfaction of showing up — the sensory, felt beat */}
      <ZigZag
        img="/images/site/63978107-8b40-4ce2-8eaf-01a2f6f35cb9.jpg"
        alt="A Frequency circle cheering with arms and peace signs raised on the beach at dusk"
        eyebrow="What it feels like"
        title="The quiet thrill of being expected."
        kicker="Not a notification. The small, real lift of walking in and being known."
        imgAspect="landscape"
        imgPosition="bottom"
        reverse
        tone="surface"
      >
        <p>
          There is a specific satisfaction the apps can&apos;t hand you: the one
          that comes from showing up again when you almost didn&apos;t. The drive
          you talked yourself into. The cold morning you went anyway. The small,
          unmistakable lift of walking into a room where people are glad it&apos;s
          you.
        </p>
        <p>
          That feeling compounds. One showing-up becomes a habit, a habit becomes
          a reputation, and a reputation becomes the thing you can&apos;t quite
          name when someone asks why you seem steadier lately. The Quest is built
          to make that feeling legible, to let you watch yourself become someone
          your people lean on.
        </p>
        <p>
          And it runs both ways. The morning you don&apos;t make it, someone
          clocks the gap and texts to see if you&apos;re alright. That is the
          quiet engine of the whole thing: being counted on enough that your
          absence is felt, and showing up enough that your presence is the easy,
          ordinary fact of someone else&apos;s week.
        </p>
      </ZigZag>

      {/* Momentum, made concrete — a Stat row anchoring the felt beat */}
      <Section tone="canvas">
        <SectionHeading
          eyebrow="Momentum"
          title="Small steps, stacked."
          kicker="A season is just a lot of showing up, counted kindly."
        />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 sm:gap-6">
          <Stat value="1" label="Zap to begin" />
          <Stat value="6" label="Ranks to climb" />
          <Stat value="∞" label="Seasons to come" />
        </div>
        <p className="mt-9 text-lg text-muted leading-relaxed">
          Nobody arrives indispensable. You get there one standing time at a time,
          and the path keeps the next step lit so the climb never asks for more
          than the morning in front of you.
        </p>
      </Section>

      {/* Season ranks — the path from invisible to indispensable */}
      <Section tone="surface">
        <SectionHeading
          eyebrow="Season ranks"
          title="From ghost to luminary."
          kicker="Not a leaderboard. A record of who you became this season."
        />
        <p className="text-lg text-muted leading-relaxed mb-9">
          Each season you climb a path that mirrors your place in the community:
          from the stranger who just found the room to the person a whole
          neighborhood would miss. The ranks aren&apos;t trophies. They&apos;re a
          map of how deeply you&apos;ve woven yourself in, and they reset every
          season, because the point was never the badge. The point is who you
          become getting there, and the chance to do it again from the ground.
        </p>
        <ol className="grid gap-4 sm:grid-cols-2">
          {RANKS.map((r, i) => (
            <li key={r.name}>
              <Card tone="feature" className="h-full">
                <div className="flex items-center justify-between mb-4">
                  <span className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-primary-bg/50">
                    <r.icon className="w-5 h-5 text-primary-strong" aria-hidden />
                  </span>
                  <span className="font-display uppercase text-4xl text-border-strong leading-none">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  <h3 className="font-display uppercase text-text text-2xl leading-none">
                    {r.name}
                  </h3>
                  <span className="text-xs font-bold uppercase tracking-widest text-primary-strong">
                    {r.tag}
                  </span>
                </div>
                <p className="mt-3 text-sm text-muted leading-relaxed">{r.body}</p>
              </Card>
            </li>
          ))}
        </ol>
      </Section>

      <Statement tone="surface">
        You level up by becoming someone{' '}
        <span className="text-primary">your community misses.</span>
      </Statement>

      {/* A season as a fresh climb — the felt, sensory beat on starting again */}
      <ZigZag
        img="/images/site/PHOTO-2020-10-07-14-38-04.jpeg"
        alt="A Frequency circle dancing close together on the beach, hair flying, faces lit with joy"
        eyebrow="A new season"
        title="Every season, the climb resets."
        kicker="Not back to zero. Back to the start line, with everything you learned still in your legs."
        imgAspect="landscape"
        imgPosition="center"
        tone="canvas"
      >
        <p>
          When a season ends, the ranks fall away and you stand at the bottom
          again, a ghost beside the newest face in the room. It sounds like a loss
          until you feel it: the strange relief of a clean morning, a path lit
          fresh, the climb yours to make all over again.
        </p>
        <p>
          The badge resets. You don&apos;t. The regulars still know your name, the
          standing time is still yours, and the version of you that learned to
          show up walks into the new season already steadier. A season isn&apos;t
          a score to defend. It&apos;s a fresh hill, and the joy is in climbing it
          with the people who climbed the last one beside you.
        </p>
      </ZigZag>

      {/* Arcs — multi-step seasonal journeys */}
      <ZigZag
        img="/images/site/PHOTO-2020-10-17-13-49-14.jpeg"
        alt="A Frequency music circle gathered on a cliffside at golden hour"
        eyebrow="Arcs"
        title="A journey worth taking."
        kicker="Seasonal paths with a beginning, a middle, and a changed you at the end."
        imgAspect="landscape"
        imgPosition="center"
        reverse
        tone="surface"
      >
        <p>
          An <strong className="text-text">Arc</strong> is a multi-step seasonal
          journey you choose to walk: a string of real-world steps that add up to
          something. A 30 morning cold-plunge streak. Hosting your first supper
          club. Bringing three friends into a Circle and watching them stay.
        </p>
        <p>
          Arcs give a season its shape. They turn a vague intention to be more
          present into a path with a next step always lit, and a community walking
          it beside you. You don&apos;t finish an Arc with more points. You finish
          it as someone a little more woven in.
        </p>
        <p>
          And you rarely walk one alone. An Arc is the kind of thing you mention on
          a Tuesday and find three people already in, the half-said plan that turns
          into a standing one. The steps are yours. The momentum belongs to the
          room, and it carries you on the mornings your own willpower comes up
          short.
        </p>
      </ZigZag>

      {/* What the Quest is built to do — three guardrails */}
      <Section tone="canvas">
        <SectionHeading
          eyebrow="What it rewards"
          title="Pointed at the right things."
          kicker="Every mechanic answers to one rule: does this build real community?"
        />
        <div className="grid gap-5 sm:grid-cols-3">
          <Guard
            icon={MapPin}
            title="Presence over scrolling"
            text="The biggest rewards live off the screen. Zaps come from being in the room, so the Quest pulls you toward people, never deeper into a feed."
          />
          <Guard
            icon={HandHeart}
            title="Generosity over grinding"
            text="You rise by bringing others in and holding the door, not by farming points. The path rewards the people who make the room warmer."
          />
          <Guard
            icon={Repeat}
            title="Rhythm over streaks"
            text="Ranks reset each season so nobody is ever too far ahead to catch. It’s a fresh climb, an open invitation, not a ladder you missed."
          />
        </div>
      </Section>

      {/* Rhythm band — marquee inside a dark slat band */}
      <div className="bg-slat">
        <Marquee
          items={[
            'Show up',
            'Earn zaps',
            'Climb your rank',
            'Walk an Arc',
            'Bring someone new',
            'Be missed when you’re gone',
          ]}
        />
      </div>

      {/* Membership turns on the Quest — the dark beat */}
      <ZigZag
        img="/images/site/22a51611-07f6-4c39-8a26-1c996295b6d3.jpg"
        alt="People dancing together with arms raised at golden hour, faces lit and joyful"
        eyebrow="Why it matters"
        title="Membership turns on the Quest."
        imgAspect="landscape"
        imgPosition="center"
        reverse
        tone="ink"
      >
        <p>
          The Quest is the part of membership that pulls you off the screen and
          into the room. It&apos;s the engine that turns a good intention into a
          standing habit, and a standing habit into the people who know your name.
        </p>
        <p>
          The community is free, forever. The Quest, and the rooms it fills, is
          what membership keeps open. You&apos;re not buying points. You&apos;re
          funding the place where showing up gets to count.
        </p>
        <p>
          Think of it as keeping the lights on in the room you keep coming back to.
          The sunrise circle that&apos;s there every week, the standing time that
          doesn&apos;t flake, the path that remembers who you became last season.
          That steadiness costs something to hold open, and membership is how a
          community holds it open for everyone, including the version of you that
          shows up next year.
        </p>
      </ZigZag>

      <Statement tone="ink">
        Real life is the{' '}
        <span className="text-primary">high score.</span>
      </Statement>

      {/* Where it starts — grounding in the real beta */}
      <Section tone="canvas">
        <SectionHeading
          eyebrow="Where it starts"
          title="Your first season begins now."
          kicker={`The founding cohort is climbing it together in ${FOUNDING_PLACE}.`}
        />
        <Body>
          Every player starts as a ghost. Join the beta and you start your first
          season alongside the founding members, the people shaping what these
          ranks and Arcs even mean. Show up once, earn your first zap, and watch
          the path light up. You can begin anywhere: all it takes is a Circle and
          a standing time.
        </Body>
        <Body>
          A year from now, the only question that matters won&apos;t be how high
          you ranked. It will be whether a few real people would feel it if you
          stopped coming. Start this season and you start becoming that person:
          the regular, the one who holds the door, the name a room says before
          you&apos;ve said a word.
        </Body>
        <p className="mt-7 inline-flex items-center gap-2 text-sm font-bold uppercase tracking-[0.2em] text-primary-strong">
          <Trophy className="w-4 h-4" aria-hidden /> Season one is open
        </p>
      </Section>

      <PillarNav current="/the-quest" tone="surface" />

      <BetaCTA
        heading="Start your first season."
        body="Pick a Circle, show up, and earn your first zap. The high score is a life you’re actually living."
      />
    </>
  )
}

// ── Local sub-components ──────────────────────────────────────────────────────

function Guard({
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
        <Icon className="w-5 h-5 text-primary-strong" aria-hidden />
        <h3 className="font-bold text-text text-lg leading-snug">{title}</h3>
      </div>
      <p className="text-sm text-muted leading-relaxed">{text}</p>
    </Card>
  )
}
