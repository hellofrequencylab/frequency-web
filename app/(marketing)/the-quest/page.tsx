import type { Metadata } from 'next'
import {
  ArrowRight,
  Zap,
  Gem,
  Ghost,
  Footprints,
  Flame,
  Star,
  Repeat,
  HandHeart,
  Trophy,
  MapPin,
} from 'lucide-react'
import { BlockRender } from '@/lib/page-editor/block-render'
import { BlockDocJsonLd } from '@/lib/page-editor/block-seo'
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
import { articleSchema, breadcrumbSchema, faqSchema } from '@/lib/jsonld'

export const revalidate = 3600

export const metadata: Metadata = {
  title: 'How does The Quest work? Zaps, Gems, Journeys',
  description:
    'The Quest is a light game where showing up counts. Earn Zaps in person and Gems online, finish three Journeys each season, and climb the ranks by being there.',
  alternates: { canonical: '/the-quest' },
  openGraph: {
    title: 'The Quest · Frequency',
    description:
      'Real life is the reward. Zaps, Gems, season ranks, and Journeys: a path that rewards showing up, not scrolling.',
    url: '/the-quest',
  },
}

// Answer-first FAQ for AIO. Answers match the definitions the page ships (how the
// game works, Zaps vs Gems, the season ranks, a Journey) so structured data and
// visible copy agree. Canon: Ghost/Initiate/Adept/Master ranks, 5:1 Zap-to-Gem
// rollover, three Journeys per season (docs/NAMING.md).
const QUEST_FAQ = [
  {
    q: 'How does The Quest work?',
    a: 'The Quest is a light game built into Frequency. You earn Zaps for showing up in person and Gems for keeping your Circle warm online, run three Journeys each season for Mind, Body, and Spirit, and rise through the ranks by finishing the work.',
  },
  {
    q: 'What are Zaps and Gems?',
    a: 'Zaps are earned in person for real acts like showing up, hosting, or bringing someone new. Gems are earned online for the small acts that keep a Circle alive between gatherings. At season end Zaps roll into Gems at five to one, and Gems are spent in the Vault.',
  },
  {
    q: 'What are the season ranks?',
    a: 'The ranks are Ghost, Initiate, Adept, and Master. Your rank is simply how many Journeys you finished this season: zero makes you a Ghost, one an Initiate, two an Adept, and all three a Master. There is no points threshold, and ranks reset each season.',
  },
  {
    q: 'What is a Journey?',
    a: 'A Journey is a focused track that runs about four weeks, one each for Mind, Body, and Spirit. Each closes with an Expression Challenge where you share what you practiced. Finish a Journey and you earn a Pillar Trophy; finish all three and you reach Master.',
  },
  {
    q: 'Do I have to pay to play The Quest?',
    a: 'No. The community and The Quest are free to play, and everyone earns at full rate. Membership keeps open the rooms The Quest fills, and you never pay a cut of your own bookings. You are not buying points.',
  },
]

type IconType = React.ComponentType<{ className?: string }>

// The season ranks: tied to how many Journeys you finish, not how many Zaps you
// collect. Framed as what you've done this season, not a points tier.
const RANKS: { icon: IconType; name: string; tag: string; body: string }[] = [
  {
    icon: Ghost,
    name: 'Ghost',
    tag: 'Just arrived',
    body: "You found the room. Nobody knows your name yet, and that is exactly where everyone starts.",
  },
  {
    icon: Footprints,
    name: 'Initiate',
    tag: 'One Journey done',
    body: 'You finished your first Journey. The practice is real now, not just an intention.',
  },
  {
    icon: Flame,
    name: 'Adept',
    tag: 'Two Journeys done',
    body: 'Two down. You know what it takes to see something through, and you keep showing up anyway.',
  },
  {
    icon: Star,
    name: 'Master',
    tag: 'Three Journeys done',
    body: 'You finished the season. Mind, Body, Spirit: you moved through all three and came out changed.',
  },
]

export default async function TheQuestPage() {
  // getPublishedData -> getTemplate -> legacy: prefer the operator-published doc,
  // else the designed git template (so the designed page is live without a DB
  // publish), with the hardcoded legacy component as a last resort.
  const published = await getPublishedData('the-quest')
  const template = getTemplate('the-quest')
  const data = isRenderable(published) ? published : isRenderable(template) ? template : null
  const live = data ? await getLiveData(createAdminClient()).catch(() => null) : null
  return (
    <>
      <JsonLd
        data={[
          // Article schema so answer engines can cite the explainer of how the
          // game works (Zaps, Gems, season ranks, Journeys) (GE11-4).
          articleSchema({
            title: 'The Quest',
            description:
              'How The Quest works: a light, in-person game where you earn Zaps for showing up in real life and Gems online, climb the season ranks, and run Journeys of small daily Practices, solo or with your Circle.',
            path: '/the-quest',
            image: '/images/site/36d99363-e483-40a0-b173-7e7ee6c1b379.jpg',
          }),
          breadcrumbSchema([{ name: 'The Quest', path: '/the-quest' }]),
          // FAQPage so answer engines can lift how the game works, Zaps vs Gems,
          // and the ranks directly (GE11-4). Matches the FAQ copy below.
          faqSchema(QUEST_FAQ.map(({ q, a }) => ({ q, a }))),
        ]}
      />
      {data && <BlockDocJsonLd data={data} path="/the-quest" />}
      {data ? <BlockRender config={config} data={data} metadata={live ? { live } : {}} /> : <LegacyTheQuest />}
    </>
  )
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
        subtitle="Most apps reward the time you lose to them. The Quest rewards the time you give back to real people. You rise by becoming someone your community misses."
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
          something to climb, makes progress feel inevitable. The trouble is that
          almost every game spends that pull on nothing. The Quest spends it on
          the opposite. It points the whole loop at the things that genuinely
          make a life: showing up, being missed, holding the door for the next
          person.
        </Lead>
        <Body>
          You don&apos;t grind points. You build a reputation in a real place,
          with real people, who notice when you&apos;re there and feel it when
          you&apos;re not. The score is just a mirror held up to that.
        </Body>
      </Section>

      <Statement tone="surface">
        Not points to grind.{' '}
        <span className="text-primary">A person to become.</span>
      </Statement>

      {/* Zaps and Gems: the two currencies, in detail */}
      <ZigZag
        img="/images/site/PHOTO-2020-10-07-14-38-02.jpeg"
        alt="A Frequency circle gathered close together, laughing in golden afternoon light"
        eyebrow="Two currencies"
        title="Zaps in person. Gems on platform."
        kicker="One for the room. One for the thread that keeps it warm."
        imgAspect="landscape"
        tone="canvas"
      >
        <p>
          <strong className="text-text">Zaps</strong> are earned in the flesh.
          You show up to the sunrise circle, you host the sauna night, you bring a
          stranger who becomes a regular. Zaps are the weight of being there, the
          part no screen can fake.
        </p>
        <p>
          <strong className="text-text">Gems</strong> are earned on the platform:
          the small acts that keep a Circle alive between gatherings. A welcome to
          the newcomer, an event that fills the calendar, the photo that pulls
          everyone back. Both flow to the same place: a path you can feel under
          your feet.
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
              The real-world currency. Earned when you show up, host, bring someone
              new into the room, or make something others use. Your season standing,
              the part no screen can fake.
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
              The online currency. Earned by welcoming newcomers, filling the
              calendar, and keeping the thread warm between gatherings. The Gems
              you spend in the Vault.
            </p>
          </Card>
        </div>
      </Section>

      {/* Season ranks: tied to Journey completions */}
      <Section tone="canvas">
        <SectionHeading
          eyebrow="Season ranks"
          title="Ranks you earn by finishing."
          kicker="Not a leaderboard. A record of how many Journeys you completed this season."
        />
        <p className="text-lg text-muted leading-relaxed mb-9">
          Each season has three Journeys: Mind, Body, Spirit. Finish one and
          you become an Initiate. Finish two and you are Adept. Finish all
          three and you reach Master. There is no points threshold to cross,
          no leaderboard to beat. You just do the work, and the rank follows.
          Ranks reset each season so every season is a fresh start.
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
        You rise by{' '}
        <span className="text-primary">finishing the work.</span>
      </Statement>

      {/* Quests: three Journeys per season */}
      <ZigZag
        img="/images/site/PHOTO-2020-10-17-13-49-14.jpeg"
        alt="A Frequency music circle gathered on a cliffside at golden hour"
        eyebrow="Quests"
        title="Three Journeys. One season."
        kicker="Mind, Body, Spirit: each one a focused track, each one capped by an Expression Challenge."
        imgAspect="landscape"
        reverse
        tone="canvas"
      >
        <p>
          Each season of <strong className="text-text">The Quest</strong> gives
          you three Journeys to walk: one for the mind, one for the body, one
          for the spirit. Each runs for about four weeks, and each closes with
          an Expression Challenge where you share what you practiced with your
          community.
        </p>
        <p>
          Finish a Journey and you earn a Trophy. Finish all three and you reach
          Master, and you earn the Certificate: the season&apos;s capstone. Then
          the season resets, the next one opens, and you begin again.
        </p>
      </ZigZag>

      {/* What the Quest is built to do: three guardrails */}
      <Section tone="surface">
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
            text="Ranks reset each season so nobody is ever too far ahead to catch. It's a fresh climb, an open invitation, not a ladder you missed."
          />
        </div>
      </Section>

      {/* Rhythm band: marquee inside a dark slat band */}
      <div className="bg-slat">
        <Marquee
          items={[
            'Show up',
            'Earn Zaps',
            'Finish a Journey',
            'Earn a Trophy',
            'Bring someone new',
            'Reach Master',
          ]}
        />
      </div>

      {/* Membership turns on the Quest: the dark beat */}
      <ZigZag
        img="/images/site/22a51611-07f6-4c39-8a26-1c996295b6d3.jpg"
        alt="People dancing together with arms raised at golden hour, faces lit and joyful"
        eyebrow="Why it matters"
        title="Membership turns on the Quest."
        imgAspect="landscape"
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
      </ZigZag>

      <Statement tone="ink">
        Real life is the{' '}
        <span className="text-primary">reward.</span>
      </Statement>

      {/* Where it starts: grounding in the real beta */}
      <Section tone="canvas">
        <SectionHeading
          eyebrow="Where it starts"
          title="Your first season begins now."
          kicker={`The founding members are climbing it together in ${FOUNDING_PLACE}.`}
        />
        <Body>
          Every player starts as a Ghost. Join the beta and you start your first
          season alongside the founding members, the people shaping what these
          Journeys even mean. Pick a practice, log it, earn your first Zap, and
          watch the path light up. Finish a Journey and you earn a Trophy. Finish
          three and you reach Master. All it takes is a Circle and a standing time.
        </Body>
        <p className="mt-7 inline-flex items-center gap-2 text-sm font-bold uppercase tracking-[0.2em] text-primary-strong">
          <Trophy className="w-4 h-4" aria-hidden /> Season one is open
        </p>
        <p className="mt-6 text-base text-muted leading-relaxed">
          <a className="text-primary-strong font-semibold hover:underline" href="/discover">
            Find a Circle near you
          </a>{' '}
          to start your first season, or see what membership opens on the{' '}
          <a className="text-primary-strong font-semibold hover:underline" href="/pricing">
            pricing page
          </a>
          .
        </p>
      </Section>

      {/* Answer-first FAQ: mirrors the FAQPage schema so structured data and
          visible copy agree (docs SEO/AIO mandate). */}
      <Section tone="surface">
        <SectionHeading
          eyebrow="Questions"
          title="The short answers."
          kicker="How the game works, Zaps and Gems, the ranks, and a Journey."
        />
        <dl className="space-y-6">
          {QUEST_FAQ.map((item) => (
            <div key={item.q} className="rounded-2xl border border-border bg-canvas p-6">
              <dt className="font-display uppercase text-text text-xl leading-tight mb-2">
                {item.q}
              </dt>
              <dd className="text-base text-muted leading-relaxed">{item.a}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <PillarNav current="/the-quest" tone="surface" />

      <BetaCTA
        heading="Start your first season."
        body="Pick a Circle, show up, and earn your first Zap. The reward is a life you're actually living."
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
