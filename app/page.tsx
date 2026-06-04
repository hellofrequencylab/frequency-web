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
import { getInitials, relativeTime, eventDateBadge, formatEventDate } from '@/lib/utils'
import { SITE_NAME, SITE_TAGLINE, SITE_DESCRIPTION, BETA_CTA_LABEL, BETA_CTA_HREF, SOCIAL_PROOF_FLOOR, FOUNDING_PLACE } from '@/lib/site'
import { type CommunityRole, ROLE_RANK, RoleBadge } from '@/lib/community-roles'
import { getJanitor } from '@/lib/page-editor/guard'
import { getLiveData } from '@/lib/page-editor/live-data'
import type { LiveData, LiveEvent } from '@/components/marketing/blocks'

export const metadata: Metadata = {
  title: { absolute: `${SITE_NAME} · ${SITE_TAGLINE}` },
  description: SITE_DESCRIPTION,
  alternates: { canonical: '/' },
  openGraph: {
    title: `${SITE_NAME} · ${SITE_TAGLINE}`,
    description: `A third space, half app and half real place: a free community that pulls you off the screen, a game that rewards showing up, and real rooms to gather in. Free during the beta, now taking root in ${FOUNDING_PLACE}.`,
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

function Splash({ live }: { live: LiveData }) {
  const posts = live.posts as PostPreviewRow[]
  const memberCount = live.memberCount
  const circleCount = live.circleCount
  const upcomingEvents = live.upcomingEvents
  const hasProof = memberCount >= SOCIAL_PROOF_FLOOR

  return (
    <>
      <MarketingHeader overHero />

      {/* ── Hero · the hook + the model in one breath ──────────────────────── */}
      <PhotoHero
        minHeight="screen"
        image="/images/site/971634cd-1d52-4b3a-a0ab-5713d395d58a.jpg"
        alt="A circle of people sitting together on the grass at golden hour, eyes closed, arms wide, breathing as one"
        focal="object-center"
        eyebrow="Connected to everything, close to no one"
        title={
          <>
            A place to be <span className="text-primary">missed.</span>
          </>
        }
        subtitle="Frequency is a third space — half community app, half real place. Find your people by what you love, get pulled off the screen by a game that rewards showing up, and gather where it takes root: a room you can walk into."
        footer={
          <>
            <p className="mt-8 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-sm text-white/55">
              <span className="font-semibold text-white/75">Free during the beta.</span>
              <span aria-hidden className="text-white/25">·</span>
              <span>No card. Founder pricing locked. Leave anytime.</span>
            </p>
            <p className="mt-2 text-sm text-white/40">
              The first circles are taking root in {FOUNDING_PLACE}.{' '}
              <Link href="/sign-in" className="underline hover:text-white/70 transition-colors">
                Already a member? Sign in
              </Link>
            </p>
            <ScrollCue label="What it is" />
          </>
        }
      >
        <div className="flex items-center justify-center">
          <Button href={BETA_CTA_HREF}>
            {BETA_CTA_LABEL} <ArrowRight className="w-5 h-5" aria-hidden />
          </Button>
        </div>
      </PhotoHero>

      {/* ── The ache · it's not you ────────────────────────────────────────── */}
      <ZigZag
        img="/images/site/fd40d12c-7667-4d4e-b4c0-3b828170d9b1.jpg"
        alt="A handwritten 'you are beautiful' card tucked into an aloe plant beside people resting on the grass"
        eyebrow="It's not you"
        title={
          <>
            The places that held us
            <br />
            just <span className="text-primary">vanished.</span>
          </>
        }
        imgAspect="portrait"
        tone="surface"
      >
        <p>
          Most of a generation reports feeling lonely — not for lack of people, but for lack of{' '}
          <em>places</em>. The corner café, the town square, the gathering ground all quietly closed.
        </p>
        <p>
          We traded them for feeds and followers and ended up surrounded yet unseen. You&apos;re not
          broken. The third place is.
        </p>
      </ZigZag>

      <PullQuote tone="canvas" cite="The wedge, in one line">
        Seen, not followed.
        <br />
        <span className="text-primary">Missed,</span> not muted.
      </PullQuote>

      {/* ── The model · three parts, one community (the legibility beat) ────── */}
      <section className="relative bg-slat">
        <div className="light-strip absolute inset-x-0 top-0 z-10" />
        <Marquee items={['One community', 'One game', 'Real places', 'Built together']} />
        <div className="max-w-5xl mx-auto px-6 py-24 sm:py-28">
          <Reveal className="max-w-2xl mx-auto text-center">
            <p className="text-sm font-bold uppercase tracking-[0.25em] text-primary mb-5">The model</p>
            <h2 className="font-display uppercase text-white text-5xl sm:text-6xl leading-[0.95] text-balance">
              Three parts.
              <br />
              <span className="text-primary">One community.</span>
            </h2>
            <p className="mt-6 text-lg text-white/70 leading-relaxed">
              Most apps are just a feed. Frequency is three pieces pulling the same direction — off the
              screen and into a room.
            </p>
          </Reveal>
          <div className="mt-20 space-y-24 sm:space-y-28">
            <Reveal>
              <Pillar
                img="/images/site/community-1.jpg"
                alt="A small circle of neighbors talking and laughing together on a sunny lawn"
                index="01"
                title="The Community"
                body="Find your people by what you love. Pick an interest, join a small Circle near you, and show up. It's bottom-up and leaderful — Circles cluster into neighborhoods and spread city by city, never appointed from above."
                href="/how-it-works"
              />
            </Reveal>
            <Reveal>
              <Pillar
                img="/images/site/36d99363-e483-40a0-b173-7e7ee6c1b379.jpg"
                alt="A small group spinning hula hoops together on the beach beneath a lone palm at golden hour"
                index="02"
                title="The Game"
                body="The part that gets you off the screen. Showing up, inviting a stranger, backing a local spot — the things that actually build community — are what the game rewards. Not scrolling. Real life is the high score."
                href="/how-it-works"
                reverse
              />
            </Reveal>
            <Reveal>
              <Pillar
                img="/images/site/lab-storefront.jpg"
                alt="The warm-lit storefront of The Lab, Frequency's prototype third space, at dusk"
                index="03"
                title="The Lab"
                body="Where the community gets a body. A real third space with a front door — movement studios, a thermal circuit, a connection bar, an events floor. The room does the work; you just walk in."
                href="/the-lab"
              />
            </Reveal>
          </div>
        </div>
        <div className="light-strip absolute inset-x-0 bottom-0 z-10" />
      </section>

      {/* ── How you join · two words and you're in ─────────────────────────── */}
      <Section tone="canvas">
        <Reveal>
          <SectionHeading
            eyebrow="How you join"
            title={
              <>
                Two words and <span className="text-primary">you&apos;re in.</span>
              </>
            }
            kicker="No application. No audition. No performance."
          />
        </Reveal>
        <Reveal delay={100}>
          <Steps
            steps={[
              {
                title: 'Pick what you love',
                body: 'Surfing, sound baths, supper clubs, strength training — choose the interest that’s yours. That’s word one.',
              },
              {
                title: 'Join a Circle',
                body: 'A small standing group around it, near you. Drop in on the next gathering — that’s word two, and that’s belonging.',
              },
              {
                title: 'Show up',
                body: 'Come back. Your people notice, the game rewards it, and you’re missed when you’re gone.',
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
            className="object-cover object-center scale-110"
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
                  A few of us started gathering on the cliffs every morning to breathe and reconnect.
                  Within eighteen months, a thousand people were showing up.
                </p>
                <p className="text-white/70">
                  No guru. No brand. No agenda. Just people who needed each other and a place to be. It
                  proved the hunger is real — and that it can be answered.
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
                <CountUp value={1000} />
              </p>
              <p className="mt-3 text-xs uppercase tracking-widest font-bold text-white/50">
                People, at the peak
              </p>
            </div>
            <div>
              <p className="font-display text-5xl sm:text-7xl text-white">
                <CountUp value={18} />
              </p>
              <p className="mt-3 text-xs uppercase tracking-widest font-bold text-white/50">
                Months to get there
              </p>
            </div>
            <div>
              <p className="font-display text-5xl sm:text-7xl text-primary">0</p>
              <p className="mt-3 text-xs uppercase tracking-widest font-bold text-white/50">
                Gurus involved
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
        tone="surface"
        reverse
      >
        <p>
          No guru, no franchise. Leaders rise from the people who simply keep showing up. Circles fill
          and split, neighborhoods multiply, and where enough people gather in one place, the next Lab
          gets a reason to open.
        </p>
        <p>
          Membership keeps the rooms open — and those who can give more quietly hold the door for those
          who can&apos;t. Belonging shouldn&apos;t depend on what you can afford.
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
      >
        <p>
          A standing time. A handful of faces that light up when you arrive. A room of settled nervous
          systems that settles yours, too.
        </p>
        <p>You don&apos;t have to perform. You just have to show up.</p>
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
                Real people, real Circles, real gatherings — taking root in {FOUNDING_PLACE} right now.
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
                The first Circles are forming in {FOUNDING_PLACE}. The founding members are shaping what
                this becomes — come be one of them.
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
              <h2 className="font-display uppercase text-text text-3xl sm:text-4xl mb-10 text-balance">
                People showing up for each other
              </h2>
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

      {/* ── Is this for you? (objection handling / short FAQ) ──────────────── */}
      <Section tone="canvas">
        <Reveal>
          <SectionHeading
            eyebrow="Honest answers"
            title="Is this for you?"
            kicker="The real questions people ask before they join."
          />
        </Reveal>
        <div className="space-y-3">
          <Faq q="Do I have to be outgoing?">
            No. Circles are small on purpose — a handful of people, not a crowd. You don&apos;t have to
            perform or network. You just have to show up, and the structure does the rest.
          </Faq>
          <Faq q="What does it cost?">
            The community is free, forever. Crew membership — which turns on the game — is $10/mo, and
            free during the beta. No card today; join now and your founder pricing is locked when paid
            memberships launch.{' '}
            <Link href="/pricing" className="font-semibold text-primary-strong hover:underline">
              See the full breakdown
            </Link>
            .
          </Faq>
          <Faq q="Is there a catch or a guru?">
            None. Frequency is leaderful, not leader-dependent — built to outlast any one person. No
            charismatic founder to follow, no upsell funnel. Memberships exist to sustain the physical
            spaces, not to extract.
          </Faq>
          <Faq q="I'm not in North County San Diego.">
            The first space is taking root there now. Add your name anyway — we&apos;re mapping where
            people are so we know which city seeds next. That&apos;s how it spreads: city by city, like
            cells.
          </Faq>
          <Faq q="What if it's not for me?">
            Leave anytime, no questions. The beta is free, there&apos;s no card on file, and nothing
            locks you in. The only thing you risk is missing the founding cohort.
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
              A community is only as good as the people who start it — so we grow the beta deliberately,
              a small group at a time, so every new member is actually welcomed in. The constraint is
              the care. Add your name and we&apos;ll reach out when the next spots open.
            </p>
            <ul className="grid gap-3 sm:grid-cols-2 mb-8">
              <Perk>Free for the whole beta — no card</Perk>
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
        heading="Come be one of the first."
        body="A Circle to call yours, a standing time, and a place to be human — together. Add your name and we'll reach out when a spot opens."
      />

      <MarketingFooter />
    </>
  )
}

// ── Building blocks ─────────────────────────────────────────────────────────

// Dark-band pillar: large circular image with a big display heading and a
// floating light card holding the body, overlapping the circle. Alternates.
function Pillar({
  img,
  alt,
  title,
  body,
  href,
  index,
  reverse = false,
}: {
  img: string
  alt: string
  title: string
  body: string
  href?: string
  index?: string
  reverse?: boolean
}) {
  return (
    <div
      className={`flex flex-col items-center sm:items-stretch sm:flex-row ${
        reverse ? 'sm:flex-row-reverse' : ''
      }`}
    >
      <Image
        src={img}
        alt={alt}
        width={512}
        height={512}
        sizes="(min-width: 640px) 32rem, 20rem"
        className="w-80 h-80 sm:w-[32rem] sm:h-[32rem] rounded-full object-cover border-4 border-white/10 shrink-0"
      />
      <div
        className={`relative z-10 flex flex-col justify-center max-w-md -mt-12 sm:mt-0 ${
          reverse ? 'sm:-mr-20' : 'sm:-ml-20'
        }`}
      >
        <h3 className="font-display uppercase text-white text-4xl sm:text-5xl mb-5 px-2 text-center sm:text-left">
          {index && <span className="text-primary mr-3 align-baseline">{index}</span>}
          {title}
        </h3>
        <div className="bg-surface rounded-3xl p-8 shadow-pop">
          <p className="text-base text-muted leading-relaxed">{body}</p>
          {href && (
            <Link
              href={href}
              className="mt-5 inline-flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide text-primary-strong hover:underline"
            >
              Learn more <ArrowRight className="w-4 h-4" />
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}

function PostPreviewCard({ post }: { post: PostPreviewRow }) {
  const a = post.author
  const showRole = hasRole(a?.community_role ?? null)
  const initials = a?.display_name ? getInitials(a.display_name) : '?'

  return (
    <article className="rounded-2xl border border-border bg-surface shadow-sm hover:shadow-md transition-shadow">
      <div className="p-5">
        <div className="flex items-start gap-3 mb-3">
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
        </div>

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
        href={BETA_CTA_HREF}
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
