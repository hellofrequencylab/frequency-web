import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowRight, Check, CalendarDays } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { MarketingHeader } from '@/components/layout/marketing-header'
import { MarketingFooter } from '@/components/layout/marketing-footer'
import {
  Marquee,
  BetaCTA,
  Button,
  Section,
  SectionHeading,
  PhotoHero,
  PullQuote,
  Stat,
  Steps,
  ZigZag,
  Faq,
} from '@/components/marketing/marketing-ui'
import { Reveal, Parallax, CountUp, ScrollCue } from '@/components/marketing/motion'
import { JsonLd } from '@/components/json-ld'
import { faqSchema } from '@/lib/jsonld'
import { getInitials, relativeTime, eventDateBadge, formatEventDate } from '@/lib/utils'
import { SITE_NAME, SITE_TAGLINE, SITE_DESCRIPTION, BETA_CTA_LABEL, BETA_CTA_HREF, SOCIAL_PROOF_FLOOR, FOUNDING_PLACE } from '@/lib/site'
import { type CommunityRole, ROLE_RANK, RoleBadge } from '@/lib/community-roles'
import { communityHref } from '@/lib/community-href'
import { getJanitor } from '@/lib/page-editor/guard'
import { getLiveData } from '@/lib/page-editor/live-data'
import type { LiveData, LiveEvent } from '@/components/marketing/blocks'

export const metadata: Metadata = {
  title: { absolute: `${SITE_NAME} · ${SITE_TAGLINE}` },
  description: SITE_DESCRIPTION,
  alternates: { canonical: '/' },
  openGraph: {
    title: `${SITE_NAME} · ${SITE_TAGLINE}`,
    description: `We're rebuilding the third place: a real room you can walk into, sauna, cold plunge, warm light, and the people who notice when you're gone. Find your circle anywhere; the first Lab is taking root in ${FOUNDING_PLACE}. Free during the beta.`,
    url: '/',
  },
}

type PostPreviewRow = {
  id: string
  body: string
  created_at: string
  media_urls: string[]
  author: {
    display_name: string
    handle: string
    avatar_url: string | null
    community_role?: string
  } | null
}

function hasRole(role: string | null | undefined): role is CommunityRole {
  return !!role && role in ROLE_RANK
}

// Plain-text mirror of the visible "Is this for you?" FAQ, emitted as FAQPage
// JSON-LD (AEO: lets search + AI engines surface and cite the answers).
const HOME_FAQ = [
  {
    q: 'Do I have to be outgoing?',
    a: 'Not at all. Circles are deliberately small, a handful of regulars rather than a crowd, so there is no pressure to perform. You do not have to network or post. The standing time and the small group do the work, and familiarity quietly turns into belonging.',
  },
  {
    q: 'What does it cost?',
    a: 'The community is free, forever. Browsing, joining a Circle, and showing up never cost anything. Crew membership, which turns on the Quest and helps keep the physical spaces open, is $10 a month and free for the whole beta. There is no card today, and your founder pricing is locked in for life when paid memberships launch.',
  },
  {
    q: 'Is there a catch?',
    a: 'None. Frequency is leaderful, not leader-dependent: it is built to outlast any one person, with no single figure to follow and no upsell funnel. Memberships fund the physical spaces rather than extract from members.',
  },
  {
    q: 'I am not in North County San Diego.',
    a: 'That is fine, the community starts anywhere. The first Lab is taking root in North County San Diego, but a Circle only needs a few people and a standing time, so you can start one where you are. We map where people gather so we know which city to seed next.',
  },
  {
    q: 'What if it is not for me?',
    a: 'Then you leave anytime, no questions and nothing lost. The beta is free, there is no card on file, and nothing locks you in. The only thing you risk by waiting is missing the founding cohort.',
  },
]

export default async function RootPage({
  searchParams,
}: {
  searchParams: Promise<{ preview?: string }>
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Logged-in users get their feed — except a janitor with `?preview`, who can
  // preview the public splash (e.g. via the Pages directory "View" link).
  if (user) {
    const { preview } = await searchParams
    const canPreview = preview !== undefined && (await getJanitor())
    if (!canPreview) redirect('/feed')
  }

  // The splash is code-locked (see EDITABLE_PAGES note in lib/page-editor/data):
  // `home` is intentionally not editable in the visual editor, so the coded
  // flagship splash is always the source of truth for `/` — no published draft
  // can shadow it.
  const live = await getLiveData(supabase)
  return <Splash live={live} />
}

// Splash narrative — Place → People → Path (ADR-078):
//   the Lab leads as the emblem, community carries the "start anywhere" on-ramp,
//   and the Quest closes the feature arc before the CTA.
function Splash({ live }: { live: LiveData }) {
  const posts = live.posts as PostPreviewRow[]
  const postsCurated = live.postsCurated
  const memberCount = live.memberCount
  const circleCount = live.circleCount
  const upcomingEvents = live.upcomingEvents
  const hasProof = memberCount >= SOCIAL_PROOF_FLOOR

  return (
    <>
      <MarketingHeader overHero />

      {/* ── PLACE · Hero — the Lab is the emblem ───────────────────────────── */}
      <PhotoHero
        minHeight="screen"
        image="/images/site/lab-thermal.jpg"
        alt="The cedar sauna and thermal circuit inside The Lab, glowing in warm amber light"
        focal="object-[center_40%]"
        eyebrow="Not home. Not work."
        title={
          <>
            We&apos;re rebuilding the <span className="text-primary">third place.</span>
          </>
        }
        subtitle="Push the door and the warmth reaches you first: cedar and steam, the cold plunge breathing in the corner, low amber light on dark wood, and a handful of faces that clock the day you don't show. The first one is taking root in North County San Diego. Wherever you are tonight, you can start your circle by morning."
        footer={
          <>
            <p className="mt-8 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-sm text-white/55">
              <span className="font-semibold text-white/75">Free during the beta.</span>
              <span aria-hidden className="text-white/25">·</span>
              <span>No card. Founder pricing locked. Leave anytime.</span>
            </p>
            <p className="mt-2 text-sm text-white/40">
              The first Lab is taking root in {FOUNDING_PLACE}.{' '}
              <Link href="/sign-in" className="underline hover:text-white/70 transition-colors">
                Already a member? Sign in
              </Link>
            </p>
            <ScrollCue label="Why we're building it" />
          </>
        }
      >
        <div className="flex items-center justify-center">
          <Button href={BETA_CTA_HREF}>
            {BETA_CTA_LABEL} <ArrowRight className="w-5 h-5" aria-hidden />
          </Button>
        </div>
      </PhotoHero>

      {/* ── The ache · why it's needed (compressed) ────────────────────────── */}
      <ZigZag
        img="/images/site/fd40d12c-7667-4d4e-b4c0-3b828170d9b1.jpg"
        alt="A handwritten 'you are beautiful' card tucked into an aloe plant beside people resting on the grass"
        eyebrow="It's not you"
        title={
          <>
            The places that held us
            <br />
            are <span className="text-primary">vanishing.</span>
          </>
        }
        imgAspect="portrait"
        imgPosition="center"
        tone="surface"
      >
        <p>
          Most of a generation reports feeling lonely, not for lack of people, but for lack of{' '}
          <em>places</em>. The corner café, the bowling league, the church basement, the front
          stoop, the town square: the gathering grounds where the regulars knew your face all
          quietly closed their doors, one by one, until there was nowhere left to simply turn up.
        </p>
        <p>
          We traded them for feeds and ended up surrounded yet unseen, a thousand connections and
          nobody expecting us on a Tuesday night. Nobody to notice the week we go quiet. You&apos;re
          not broken, and you&apos;re not too far gone. The
          third place is what broke. <span className="font-semibold text-text">So we&apos;re
          building it back, brick and body.</span>
        </p>
      </ZigZag>

      <PullQuote tone="canvas" cite="The wedge, in one line">
        Seen, not followed.
        <br />
        <span className="text-primary">Missed,</span> not muted.
      </PullQuote>

      {/* ── PLACE · The Lab — the emblem, expanded ─────────────────────────── */}
      <ZigZag
        img="/images/site/lab-pool.jpg"
        alt="The cold plunge pool at The Lab, still water under low amber light"
        eyebrow="The third place, with a front door"
        title={
          <>
            A room <span className="text-primary">built to be felt.</span>
          </>
        }
        kicker="Heat, then cold, then quiet, then connection."
        imgPosition="center"
        tone="surface"
        reverse
      >
        <p>
          Cedar and dark wood, low amber light, steam curling up the slats while the greenery
          breathes beside you, every surface tuned to your nervous system. A thermal circuit you
          sink into until your jaw unclenches, a cold pool that snaps you awake to your own pulse,
          movement studios, a connection bar, an events floor. Sweat until the day lets go of you,
          plunge until you gasp, then cool down slow on a warm bench and stay for the faces.
        </p>
        <p>
          You walk out loose-limbed and lit up, shoulders down, breath long, the kind of settled
          calm that follows you all the way home. The first Lab is taking root in {FOUNDING_PLACE}.
          The next ones rise wherever enough people keep showing up.
        </p>
        <Link
          href="/the-lab"
          className="mt-1 inline-flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide text-primary-strong hover:underline"
        >
          Step inside the Lab <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </ZigZag>

      {/* ── PEOPLE · Community — your people, start anywhere ────────────────── */}
      <ZigZag
        img="/images/site/community-1.jpg"
        alt="A small circle of neighbors talking and laughing together on a sunny lawn"
        eyebrow="Your people, near you"
        title={
          <>
            It starts with <span className="text-primary">people.</span>
          </>
        }
        imgPosition="center"
        tone="canvas"
      >
        <p>
          Before there&apos;s a room, there&apos;s a Circle: a small standing group around something
          you love, a Saturday run, a supper club, a sauna night, a side project. The same handful of
          faces, the same time each week, until the day they stop being strangers and start being
          yours, the ones who wave before you reach the door.
        </p>
        <p>
          <span className="font-semibold text-text">Join one near you, or start one tonight,
          anywhere.</span>{' '}
          Real plans, real faces, off the feed. You get known by name, asked where you&apos;ve been,
          remembered between gatherings, missed out loud when you skip a week. Circles cluster into
          neighborhoods and spread city by city, and where enough people gather, the next Lab gets a
          reason to open its doors.
        </p>
      </ZigZag>

      {/* ── How you join · two words and you're in ─────────────────────────── */}
      <Section tone="surface">
        <Reveal>
          <SectionHeading
            eyebrow="How you join"
            title={
              <>
                Two words and <span className="text-primary">you&apos;re in.</span>
              </>
            }
            kicker="No application. No audition. No performance. Just a yes."
          />
        </Reveal>
        <Reveal delay={100}>
          <Steps
            steps={[
              {
                title: 'Pick what you love',
                body: 'Surfing, sound baths, supper clubs, strength training. Name the thing that’s already yours and you’ll find the people who never stopped doing it. That’s word one.',
              },
              {
                title: 'Join a Circle',
                body: 'A small standing group around it, near you. Drop in on the next gathering and walk into a room that was already saving you a seat. That’s word two, and that’s belonging.',
              },
              {
                title: 'Show up',
                body: 'Come back, then come back again. Your people learn your name, the Quest rewards the streak, and one ordinary week you realize you’re the one who gets missed.',
              },
            ]}
          />
        </Reveal>
      </Section>

      {/* ── Proof · Moonlight Beach, the origin as evidence ────────────────── */}
      <section className="relative bg-slat overflow-hidden">
        <div className="light-strip absolute inset-x-0 top-0 z-20" />
        <Parallax speed={-0.18} className="absolute inset-0">
          <Image
            src="/images/site/63978107-8b40-4ce2-8eaf-01a2f6f35cb9.jpg"
            alt="Roughly a thousand people gathered on the sand at Moonlight Beach, arms raised in celebration at sunrise"
            fill
            sizes="100vw"
            className="object-cover object-[center_35%] scale-110"
          />
        </Parallax>
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(180deg, rgb(20 18 16 / 0.78) 0%, rgb(20 18 16 / 0.62) 48%, rgb(20 18 16 / 0.9) 100%)',
          }}
        />
        <div className="amber-glow absolute inset-0 pointer-events-none" />
        <div className="relative z-10 mx-auto max-w-5xl px-6 py-28 sm:py-40">
          <Reveal>
            <p className="text-sm font-bold uppercase tracking-[0.25em] text-primary mb-5">
              Moonlight Beach · 2020
            </p>
            <h2 className="font-display uppercase text-white text-5xl sm:text-6xl lg:text-8xl leading-[0.9] text-balance">
              It already
              <br />
              <span className="text-primary">happened once.</span>
            </h2>
          </Reveal>
          <div className="mt-12 grid gap-10 lg:grid-cols-12">
            <Reveal as="div" delay={100} className="lg:col-span-7 lg:col-start-6">
              <div className="space-y-5 text-lg sm:text-xl text-white/85 leading-relaxed">
                <p>
                  We started gathering on the cliffs at Moonlight Beach to sit and breathe at first
                  light, every single morning. Through winter, through rain, through the cold gray
                  dawns and the years when the world told everyone to stay home, we kept showing up
                  for more than 500 mornings straight.
                </p>
                <p className="text-white/70">
                  Over a thousand people came through. No app, no agenda, no fee, just a standing
                  time and a place to be known. Strangers learned each other&apos;s names, saved each
                  other&apos;s seats, and some are still close today. It proved the hunger is real,
                  and that it can be answered.
                </p>
              </div>
              <Link
                href="/about"
                className="mt-7 inline-flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide text-primary hover:underline"
              >
                Read the full story <ArrowRight className="w-4 h-4" aria-hidden />
              </Link>
            </Reveal>
          </div>
          <Reveal delay={200} className="mt-16 grid grid-cols-3 gap-6 max-w-2xl">
            <div>
              <p className="font-display text-5xl sm:text-7xl text-white">
                <CountUp value={500} />+
              </p>
              <p className="mt-3 text-xs uppercase tracking-widest font-bold text-white/50">
                Mornings in a row
              </p>
            </div>
            <div>
              <p className="font-display text-5xl sm:text-7xl text-white">
                <CountUp value={1000} />+
              </p>
              <p className="mt-3 text-xs uppercase tracking-widest font-bold text-white/50">
                People came through
              </p>
            </div>
            <div>
              <p className="font-display text-5xl sm:text-7xl text-primary">$0</p>
              <p className="mt-3 text-xs uppercase tracking-widest font-bold text-white/50">
                To show up
              </p>
            </div>
          </Reveal>
        </div>
        <div className="light-strip absolute inset-x-0 bottom-0 z-20" />
      </section>

      {/* ── Built together · the flywheel + pay-it-forward ─────────────────── */}
      <ZigZag
        img="/images/site/PHOTO-2020-09-09-16-38-27.jpeg"
        alt="Dozens of neighbors practicing yoga together on a sunlit lawn between palm trees"
        eyebrow="Built together"
        title={
          <>
            It grows on <span className="text-primary">its own.</span>
          </>
        }
        kicker="Leaderful, never leader-dependent."
        imgPosition="bottom"
        tone="surface"
        reverse
      >
        <p>
          No guru, no franchise, no one to follow home. Leaders rise from the people who simply keep
          showing up and start saving the seats for the next ones in. Circles fill and split like
          cells, neighborhoods multiply, and where enough people gather in one place, the next Lab
          gets a reason to open its doors.
        </p>
        <p>
          Membership keeps the rooms warm and the lights on, and those who can give more quietly hold
          the door for those who can&apos;t. Belonging should never depend on what you can afford,
          so it won&apos;t.
        </p>
      </ZigZag>

      <PullQuote tone="canvas" cite="The rule we won't trade">
        Circulation, <span className="text-primary">not exclusion.</span>
      </PullQuote>

      {/* ── The exhale · what belonging here feels like ────────────────────── */}
      <ZigZag
        img="/images/site/22a51611-07f6-4c39-8a26-1c996295b6d3.jpg"
        alt="People dancing together with arms raised at golden hour, faces lit and joyful"
        eyebrow="The exhale"
        title={
          <>
            What it feels like to be <span className="text-primary">known.</span>
          </>
        }
        tone="surface"
        imgAspect="portrait"
        imgPosition="top"
      >
        <p>
          A standing time you don&apos;t have to think about. A handful of faces that light up the
          second you walk in, that call your name across the room. A circle of settled nervous
          systems that quietly settles yours, until your shoulders drop, your breath slows, and the
          whole week slides off your back.
        </p>
        <p>
          You don&apos;t have to be clever or on or interesting. You don&apos;t have to perform or
          earn your place at the door. You just have to show up, let yourself be seen, and be glad
          you came.
        </p>
      </ZigZag>

      {/* ── It's real, and it's early (honest live proof) ──────────────────── */}
      <section className="relative bg-slat px-6 py-24 sm:py-28 overflow-hidden">
        <div className="light-strip absolute inset-x-0 top-0 z-10" />
        <div className="amber-glow absolute inset-0 pointer-events-none" />
        <div className="relative z-10 mx-auto max-w-3xl text-center">
          <Reveal>
            <p className="text-sm font-bold uppercase tracking-[0.25em] text-primary mb-4">
              Not a someday idea
            </p>
            <h2 className="font-display uppercase text-on-ink text-4xl sm:text-5xl mb-6">
              It&apos;s already happening.
            </h2>
          </Reveal>
          {hasProof ? (
            <Reveal delay={100}>
              <p className="text-lg leading-relaxed text-on-ink-muted max-w-xl mx-auto mb-12">
                Real people, real Circles, real gatherings already on the calendar, taking root in{' '}
                {FOUNDING_PLACE} right now. Not a pitch deck, not a someday. A community with a
                standing time you can walk into this week.
              </p>
              <div className="grid grid-cols-3 gap-6 max-w-xl mx-auto">
                <Stat value={memberCount} label="Members" tone="ink" />
                <Stat value={circleCount} label="Circles" tone="ink" />
                <Stat value={upcomingEvents.length} label="Events soon" tone="ink" />
              </div>
            </Reveal>
          ) : (
            <Reveal delay={100}>
              <p className="text-lg leading-relaxed text-on-ink-muted max-w-xl mx-auto">
                The first Circles are forming in {FOUNDING_PLACE} right now. The founding members are
                the ones shaping what this becomes, the names everyone after them will know. Come be
                one of them.
              </p>
            </Reveal>
          )}
        </div>
        <div className="light-strip absolute inset-x-0 bottom-0 z-10" />
      </section>

      {/* ── Upcoming events (live) ─────────────────────────────────────────── */}
      {upcomingEvents.length > 0 && (
        <section className="bg-marketing-canvas px-6 py-20 sm:py-24">
          <div className="max-w-2xl mx-auto">
            <Reveal className="flex items-center justify-center gap-2 mb-9">
              <CalendarDays className="w-5 h-5 text-primary-strong" aria-hidden />
              <h2 className="font-display uppercase text-text text-3xl sm:text-4xl text-center">
                Coming up near you
              </h2>
            </Reveal>
            <div className="space-y-3">
              {upcomingEvents.map((event, i) => (
                <Reveal key={event.id} delay={i * 60}>
                  <EventRow event={event} />
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Member posts (live social proof) ───────────────────────────────── */}
      {posts.length > 0 && (
        <section className="bg-surface px-6 py-20 sm:py-24">
          <div className="max-w-2xl mx-auto">
            <Reveal className="text-center">
              <p className="text-sm font-bold uppercase tracking-[0.25em] text-primary-strong mb-4">
                In their own words
              </p>
              <h2 className={`font-display uppercase text-text text-3xl sm:text-4xl text-balance ${postsCurated ? 'mb-3' : 'mb-10'}`}>
                People showing up for each other
              </h2>
              {postsCurated && (
                <p className="mb-10 text-sm text-subtle">Hand-picked by Vera</p>
              )}
            </Reveal>
            <div className="space-y-4">
              {posts.map((post, i) => (
                <Reveal key={post.id} delay={i * 60}>
                  <PostPreviewCard post={post} />
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── PATH · The Quest — the last feature, the reason you come back ───── */}
      <section className="relative bg-slat overflow-hidden">
        <div className="light-strip absolute inset-x-0 top-0 z-10" />
        <Marquee items={['One community', 'One Quest', 'Real places', 'Built together']} />
        <div className="amber-glow absolute inset-0 pointer-events-none" />
        <div className="relative z-10 mx-auto max-w-5xl px-6 py-24 sm:py-28">
          <div className="grid items-center gap-12 lg:grid-cols-12">
            <Reveal className="lg:col-span-7">
              <p className="text-sm font-bold uppercase tracking-[0.25em] text-primary mb-5">
                Your Quest
              </p>
              <h2 className="font-display uppercase text-white text-5xl sm:text-6xl leading-[0.95] text-balance">
                Real life is the <span className="text-primary">high score.</span>
              </h2>
              <div className="mt-7 max-w-xl space-y-4 text-lg text-white/75 leading-relaxed">
                <p>
                  Membership turns on the Quest, the part that pulls you off the screen and back into
                  the room. Inviting the stranger who turns into a regular, backing the local spot,
                  showing up on the cold morning you&apos;d rather not: the small brave acts that
                  actually build a community are the only thing it counts. Not scrolling. Not likes.
                  The streak that matters is the one you keep in person.
                </p>
                <p className="font-semibold text-white/90">
                  You level up by becoming someone your people would feel the absence of.
                </p>
              </div>
            </Reveal>
            <Reveal delay={120} className="lg:col-span-5">
              <div className="relative aspect-[4/5] overflow-hidden rounded-3xl border border-white/10 shadow-pop">
                <Image
                  src="/images/site/36d99363-e483-40a0-b173-7e7ee6c1b379.jpg"
                  alt="A small group spinning hula hoops together on the beach beneath a lone palm at golden hour"
                  fill
                  sizes="(min-width: 1024px) 28rem, 100vw"
                  className="object-cover object-[center_60%]"
                />
              </div>
            </Reveal>
          </div>
        </div>
        <div className="light-strip absolute inset-x-0 bottom-0 z-10" />
      </section>

      {/* ── Is this for you? (objection handling / short FAQ) ──────────────── */}
      <Section tone="canvas">
        <JsonLd data={[faqSchema(HOME_FAQ)]} />
        <Reveal>
          <SectionHeading
            eyebrow="Honest answers"
            title="Is this for you?"
            kicker="The real questions people ask before they join."
          />
        </Reveal>
        <div className="space-y-3">
          <Faq q="Do I have to be outgoing?">
            Not at all. Circles are deliberately small, a handful of regulars rather than a crowd, so
            there&apos;s no room to disappear and no pressure to perform. You don&apos;t have to network,
            post, or be &ldquo;on.&rdquo; The standing time and the small group do the work, and
            familiarity quietly turns into belonging on its own. A lot of our quietest members say
            it&apos;s the first place they&apos;ve felt at ease in years.
          </Faq>
          <Faq q="What does it cost?">
            The community is free, forever. Browsing, joining a Circle, and showing up never cost
            anything. Crew membership, which turns on the Quest and helps keep the physical spaces open,
            is $10/mo and free for the whole beta. There&apos;s no card today: join now and your founder
            pricing is locked in for life when paid memberships launch. Memberships exist to sustain the
            rooms and hold the door open for people who can&apos;t pay, never to extract from you.{' '}
            <Link href="/pricing" className="font-semibold text-primary-strong hover:underline">
              See the full breakdown
            </Link>
            .
          </Faq>
          <Faq q="Is there a catch?">
            None. Frequency is leaderful, not leader-dependent: it&apos;s built to outlast any one
            person, with no single figure to follow and no upsell funnel hiding behind the free tier.
            Leaders rise from the people who simply keep showing up, and when someone moves on, the
            Circle keeps going. The whole model is designed to sustain real places to gather, which is
            why memberships fund the rooms rather than line anyone&apos;s pockets.
          </Faq>
          <Faq q="I'm not in North County San Diego.">
            That&apos;s fine, the community starts anywhere. The first Lab is taking root in North County
            San Diego, but a Circle only needs a few people and a standing time, so you can start one
            where you are tonight. We&apos;re mapping where people gather so we know which city to seed
            next, and that&apos;s exactly how it spreads: Circle by Circle, neighborhood by neighborhood,
            city by city, like cells. Add your name and tell us where you are.
          </Faq>
          <Faq q="What if it's not for me?">
            Then you leave anytime, no questions and nothing lost. The beta is free, there&apos;s no card
            on file, and nothing locks you in: no contracts, no cancellation maze. Try a gathering or
            two, and if the room isn&apos;t for you, walk away with our blessing. The only thing you
            actually risk by waiting is missing the founding cohort and the founder pricing that comes
            with it.
          </Faq>
        </div>
      </Section>

      {/* ── The invitation — true scarcity, one calm path ──────────────────── */}
      <Section tone="surface" pad="py-16 sm:py-20">
        <Reveal>
          <div className="rounded-3xl border border-border bg-marketing-canvas px-7 py-9 sm:px-10 sm:py-11 shadow-pop">
            <p className="text-sm font-bold uppercase tracking-[0.25em] text-primary-strong mb-4">
              Founding cohort
            </p>
            <h2 className="font-display uppercase text-text text-3xl sm:text-4xl mb-5 text-balance">
              We open a few spots at a time.
            </h2>
            <p className="text-lg text-muted leading-relaxed mb-6 max-w-xl">
              A community is only as good as the people who start it, so we grow the beta deliberately,
              a small group at a time, so every new member is actually welcomed in by name rather than
              dropped into a crowd. The constraint is the care. Add your name and we&apos;ll reach out
              when the next spots open.
            </p>
            <ul className="grid gap-3 sm:grid-cols-2 mb-8">
              <Perk>Free for the whole beta, no card</Perk>
              <Perk>Founder pricing locked for life</Perk>
              <Perk>Shape the Circles from day one</Perk>
              <Perk>First through the doors at The Lab</Perk>
            </ul>
            <Button href={BETA_CTA_HREF}>
              {BETA_CTA_LABEL} <ArrowRight className="w-5 h-5" aria-hidden />
            </Button>
          </div>
        </Reveal>
      </Section>

      {/* ── Closing CTA ────────────────────────────────────────────────────── */}
      <BetaCTA
        heading="Come build the third place."
        body="A Circle to call yours, a standing time, and a real room to walk into. Add your name and we'll reach out when a spot opens."
      />

      <MarketingFooter />
    </>
  )
}

// ── Building blocks ─────────────────────────────────────────────────────────

function PostPreviewCard({ post }: { post: PostPreviewRow }) {
  const a = post.author
  const showRole = hasRole(a?.community_role ?? null)
  const initials = a?.display_name ? getInitials(a.display_name) : '?'

  const identity = (
    <>
      {a?.avatar_url ? (
        <Image
          src={a.avatar_url}
          alt={a.display_name}
          width={40}
          height={40}
          className="w-10 h-10 rounded-full object-cover shrink-0"
        />
      ) : (
        <div className="w-10 h-10 rounded-full bg-surface-elevated text-muted text-xs font-semibold flex items-center justify-center shrink-0 select-none">
          {initials}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-base font-semibold text-text truncate">
            {a?.display_name ?? 'Community member'}
          </span>
          {showRole && (
            <RoleBadge role={a!.community_role as CommunityRole} className="text-[10px] leading-tight" />
          )}
        </div>
        <p className="text-xs text-subtle mt-0.5">
          {a?.handle && <>@{a.handle} · </>}
          {relativeTime(post.created_at)}
        </p>
      </div>
    </>
  )

  return (
    <article className="rounded-2xl border border-border bg-surface shadow-sm hover:shadow-md transition-shadow">
      <div className="p-5">
        {a?.handle ? (
          <Link href={communityHref(`/people/${a.handle}`, false)} className="flex items-start gap-3 mb-3 group">
            {identity}
          </Link>
        ) : (
          <div className="flex items-start gap-3 mb-3">{identity}</div>
        )}

        <p className="text-base text-text leading-relaxed line-clamp-3">{post.body}</p>

        {post.media_urls?.length > 0 && (
          <div className="relative mt-3 h-72 w-full rounded-xl overflow-hidden border border-border">
            <Image
              src={post.media_urls[0]}
              alt={`Shared by ${a?.display_name ?? 'a Frequency member'}`}
              fill
              sizes="(min-width: 768px) 40rem, 100vw"
              className="object-cover"
            />
          </div>
        )}
      </div>
    </article>
  )
}

// Live event row — date chip + title, links to the beta capture.
function EventRow({ event }: { event: LiveEvent }) {
  const { month, day } = eventDateBadge(event.starts_at)
  const dateStr = formatEventDate(event.starts_at)
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-border bg-surface px-5 py-4 shadow-sm">
      <div className="shrink-0 flex h-12 w-12 flex-col items-center justify-center rounded-xl bg-primary-bg">
        <span className="text-[9px] font-bold leading-none text-primary-strong">{month}</span>
        <span className="text-base font-bold leading-tight text-primary-strong">{day}</span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-base font-semibold text-text">{event.title}</p>
        <p className="mt-0.5 text-sm text-subtle">
          {dateStr}
          {event.city && <> &middot; {event.city}</>}
        </p>
      </div>
      <Link
        href={communityHref(`/events/${event.slug}`, false)}
        className="flex shrink-0 items-center gap-1 text-sm font-semibold text-primary-strong hover:underline"
      >
        Join <ArrowRight className="h-3 w-3" aria-hidden />
      </Link>
    </div>
  )
}

// Founding-cohort perk — checkmark + line.
function Perk({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3 text-base text-text">
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary-bg text-primary-strong">
        <Check className="h-3 w-3" aria-hidden />
      </span>
      <span className="leading-snug">{children}</span>
    </li>
  )
}
