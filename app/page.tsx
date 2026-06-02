import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { ChevronDown, ArrowRight, Check, Heart, MapPin, Users, CalendarDays } from 'lucide-react'
import { Render } from '@measured/puck/rsc'
import { createClient } from '@/lib/supabase/server'
import { MarketingHeader } from '@/components/layout/marketing-header'
import { MarketingFooter } from '@/components/layout/marketing-footer'
import { Statement, ZigZag, Marquee, BetaCTA, Section, SectionHeading } from '@/components/marketing/marketing-ui'
import { getInitials, relativeTime } from '@/lib/utils'
import { SITE_NAME, SITE_TAGLINE, SITE_DESCRIPTION, BETA_CTA_LABEL, BETA_CTA_HREF, SOCIAL_PROOF_FLOOR, FOUNDING_PLACE } from '@/lib/site'
import { type CommunityRole, ROLE_RANK, RoleBadge } from '@/lib/community-roles'
import { config } from '@/lib/page-editor/config'
import { getPublishedData } from '@/lib/page-editor/data'
import { getJanitor } from '@/lib/page-editor/guard'
import { getLiveData } from '@/lib/page-editor/live-data'
import type { LiveData, LiveEvent } from '@/components/marketing/blocks'

export const metadata: Metadata = {
  title: { absolute: `${SITE_NAME} · ${SITE_TAGLINE}` },
  description: SITE_DESCRIPTION,
  alternates: { canonical: '/' },
  openGraph: {
    title: `${SITE_NAME} · ${SITE_TAGLINE}`,
    description: `A third space for a disconnected generation — not home, not work, a place to be human, together. ${SITE_DESCRIPTION} Free during the beta, now taking root in ${FOUNDING_PLACE}.`,
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

  const [pageData, live] = await Promise.all([getPublishedData('home'), getLiveData(supabase)])

  // Published in the visual editor → render that. Otherwise fall back to the
  // original hardcoded design (zero-downtime). Live data is injected as metadata.
  if (pageData && Array.isArray(pageData.content) && pageData.content.length > 0) {
    return (
      <>
        <MarketingHeader overHero />
        <Render config={config} data={pageData} metadata={{ live }} />
        <MarketingFooter />
      </>
    )
  }

  return <LegacySplash live={live} />
}

function LegacySplash({ live }: { live: LiveData }) {
  const posts = live.posts as PostPreviewRow[]
  const memberCount = live.memberCount
  const circleCount = live.circleCount
  const upcomingEvents = live.upcomingEvents
  const hasProof = memberCount >= SOCIAL_PROOF_FLOOR

  return (
    <>
      <MarketingHeader overHero />

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section className="relative min-h-screen flex flex-col items-center justify-center text-center px-6 overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat scale-105"
          style={{ backgroundImage: 'url(/images/site/lab-thermal.jpg)' }}
          role="img"
          aria-label="The thermal circuit at The Lab, glowing warm in low light"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/75 via-black/55 to-black/90" />

        <div className="relative z-10 flex flex-col items-center w-full max-w-4xl">
          <p className="text-[11px] sm:text-xs font-bold uppercase tracking-[0.3em] text-primary mb-6">
            A third space for a disconnected generation
          </p>
          <h1 className="font-display uppercase text-white text-[2.75rem] leading-[0.95] sm:text-6xl lg:text-7xl max-w-3xl text-balance">
            Find your people. Feel at home again.
          </h1>
          <p className="mt-7 text-base sm:text-lg text-white/80 max-w-xl leading-relaxed">
            Not home. Not work. A real place to exhale, reset, and be missed when
            you don&apos;t show up — half app, half physical space, all human.
          </p>

          <div className="mt-9 flex items-center gap-3 flex-wrap justify-center">
            <Link
              href={BETA_CTA_HREF}
              className="rounded-2xl bg-primary text-on-primary px-8 py-3.5 text-base font-bold hover:bg-primary-hover transition-colors"
            >
              {BETA_CTA_LABEL}
            </Link>
            <Link
              href="/how-it-works"
              className="rounded-2xl border border-white/30 px-8 py-3.5 text-base font-medium text-white hover:bg-white/10 hover:border-white/50 transition-colors"
            >
              See how it works
            </Link>
          </div>

          {/* Honest trust line — founding framing, no fabricated metrics */}
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
        </div>

        <div className="absolute bottom-10 flex flex-col items-center gap-2 text-white/40">
          <span className="text-[11px] font-bold tracking-widest uppercase">See the vision</span>
          <ChevronDown className="w-5 h-5 animate-bounce" aria-hidden />
        </div>
      </section>

      {/* ── What you get (orient a first-time visitor fast) ──────────────── */}
      <Section tone="surface" pad="py-20 sm:py-24">
        <div className="text-center mb-12">
          <p className="text-sm font-bold uppercase tracking-[0.25em] text-primary-strong mb-4">
            What you actually get
          </p>
          <h2 className="font-display uppercase text-text text-4xl sm:text-5xl text-balance">
            Belonging, with a shape.
          </h2>
          <p className="mt-5 text-lg text-muted leading-relaxed max-w-xl mx-auto">
            Three moves to go from scrolling alone to showing up with people who
            know your name.
          </p>
        </div>
        <div className="grid gap-5 sm:grid-cols-3">
          <Step
            icon={Heart}
            step="01"
            title="Pick what you practice"
            body="Movement, breathwork, creativity, human relating. Your Interests connect you to people who care about the same things."
          />
          <Step
            icon={Users}
            step="02"
            title="Join a Circle near you"
            body="A small group around your Interest, with an always-on space online and a standing time to meet in person."
          />
          <Step
            icon={MapPin}
            step="03"
            title="Show up — online and at The Lab"
            body="Movement studios, a thermal circuit, a connection bar. The environment does the work; you just arrive."
          />
        </div>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-sm font-bold uppercase tracking-wide text-primary-strong">
          <Link href="/how-it-works" className="inline-flex items-center gap-1.5 hover:underline">
            How it works <ArrowRight className="w-4 h-4" aria-hidden />
          </Link>
          <Link href="/the-lab" className="inline-flex items-center gap-1.5 hover:underline">
            Tour The Lab <ArrowRight className="w-4 h-4" aria-hidden />
          </Link>
          <Link href="/pricing" className="inline-flex items-center gap-1.5 hover:underline">
            See pricing <ArrowRight className="w-4 h-4" aria-hidden />
          </Link>
          <Link href="/demo" className="inline-flex items-center gap-1.5 hover:underline">
            Take a look inside <ArrowRight className="w-4 h-4" aria-hidden />
          </Link>
        </div>
      </Section>

      {/* ── Problem ──────────────────────────────────────────────────────── */}
      <ZigZag
        img="/images/site/community-1.jpg"
        alt="A Frequency community gathered together outdoors, talking and laughing"
        eyebrow="Something is broken"
        title="And everyone feels it."
        tone="canvas"
        imgAspect="landscape"
        imgPosition="center"
      >
        <p>
          Most of a generation reports feeling lonely. Not because there
          aren&apos;t people around, but because the <em>places</em> that used to
          hold us have quietly disappeared.
        </p>
        <p>
          The corner café, the town square, the gathering ground. We traded them
          for feeds and followers, and ended up surrounded yet unseen. It
          didn&apos;t work — and we all feel it.
        </p>
      </ZigZag>

      {/* ── Story ────────────────────────────────────────────────────────── */}
      <ZigZag
        img="/images/site/moonlight-2.jpg"
        alt="A Frequency gathering on the bluffs at Moonlight Beach at sunrise"
        reverse
        imgAspect="portrait"
        imgPosition="top"
        title={
          <>
            <span className="block text-3xl sm:text-4xl tracking-[0.12em] text-muted">
              The Frequency
            </span>
            <span className="block text-6xl sm:text-7xl text-text">Story</span>
          </>
        }
        kicker="Moonlight and the mission"
        cta={{ label: 'Read the full story', href: '/about' }}
      >
        <p>It started on the cliffs of Moonlight Beach in 2020.</p>
        <p>
          A few of us gathered every morning to breathe and reconnect. Within
          eighteen months, a thousand people were showing up. No guru, no brand,
          no agenda. Just people who needed each other and a place to be.
        </p>
        <p>
          It proved the hunger is real. It also proved that without a home, even
          the most beautiful community can&apos;t hold. So we set out to build
          one that could.
        </p>
      </ZigZag>

      <Statement>
        That&apos;s when the seed of
        <br />
        <span className="text-primary">Frequency</span> was first planted.
      </Statement>

      {/* ── Vision ───────────────────────────────────────────────────────── */}
      <ZigZag
        img="/images/site/moonlight-1.jpg"
        alt="Members of the Frequency community embracing on the beach"
        eyebrow="The vision"
        tone="canvas"
        imgAspect="natural"
        title={
          <>
            The vision <span className="text-primary">lives on</span>
          </>
        }
        cta={{ label: 'See how it works', href: '/how-it-works' }}
      >
        <p>
          Frequency is social infrastructure <em>and</em> physical space.
          Designed from the ground up to regulate your nervous system and bring
          you back to people who actually see you.
        </p>
        <p>
          Guru-free, and built to outlast any one person. A model that keeps real
          connection within reach for everyone — not just the few who can afford
          it.
        </p>
      </ZigZag>

      <Statement tone="surface">
        Starting in{' '}
        <span className="text-primary whitespace-nowrap">{FOUNDING_PLACE}.</span>
        <br />
        Coming to your city.
      </Statement>

      {/* ── What we're building (dark band) ──────────────────────────────── */}
      <section className="bg-text">
        <Marquee items={['What we’re building', 'The Lab', 'The Network', 'The Model']} />
        <div className="max-w-5xl mx-auto px-6 py-24 sm:py-32 space-y-24 sm:space-y-28">
          <Pillar
            img="/images/site/lab-storefront.jpg"
            alt="The storefront of The Lab, Frequency's prototype third space"
            title="The Lab"
            body="A prototype third space: movement studios, a thermal circuit, a connection bar, and an events floor. Part regulation studio, part social hub, part venue. The environment does the work."
            href="/the-lab"
          />
          <Pillar
            img="/images/site/community-1.jpg"
            alt="A Frequency Circle meeting in person"
            title="The Network"
            body="A community that spreads city by city. Circles cluster into neighborhoods, neighborhoods into whole areas. Bottom-up and never appointed, so it grows on its own momentum."
            href="/how-it-works"
            reverse
          />
          <Pillar
            img="/images/site/lab-pool.jpg"
            alt="The cold pool in the thermal circuit at The Lab"
            title="The Model"
            body="Built to last and built to include. Memberships sustain the spaces so connection stays within reach. Nobody is excluded, and people who can pay more fund those who can't. Circulation, not exclusion."
            href="/pricing"
          />
        </div>
      </section>

      {/* ── It's already happening (live proof) ──────────────────────────── */}
      <section className="bg-surface px-6 py-24 sm:py-28">
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-sm font-bold uppercase tracking-[0.25em] text-primary-strong mb-4">
            Not a someday idea
          </p>
          <h2 className="font-display uppercase text-text text-4xl sm:text-5xl mb-6">
            It&apos;s already happening.
          </h2>
          {hasProof ? (
            <>
              <p className="text-lg leading-relaxed text-muted max-w-xl mx-auto mb-12">
                Real people, real Circles, real gatherings — growing in{' '}
                {FOUNDING_PLACE} right now.
              </p>
              <div className="grid grid-cols-3 gap-6 max-w-xl mx-auto">
                <Stat value={memberCount} label="Members" />
                <Stat value={circleCount} label="Circles" />
                <Stat value={upcomingEvents.length} label="Events soon" />
              </div>
            </>
          ) : (
            <p className="text-lg leading-relaxed text-muted max-w-xl mx-auto">
              The first circles are forming in {FOUNDING_PLACE}. The founding
              members are shaping what this becomes — come be one of them.
            </p>
          )}
        </div>
      </section>

      {/* ── Upcoming events (live) ───────────────────────────────────────── */}
      {upcomingEvents.length > 0 && (
        <section className="bg-marketing-canvas px-6 py-20 sm:py-24">
          <div className="max-w-2xl mx-auto">
            <div className="flex items-center justify-center gap-2 mb-9">
              <CalendarDays className="w-5 h-5 text-primary-strong" aria-hidden />
              <h2 className="font-display uppercase text-text text-3xl sm:text-4xl text-center">
                Coming up near you
              </h2>
            </div>
            <div className="space-y-3">
              {upcomingEvents.map((event) => (
                <EventRow key={event.id} event={event} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Member posts (live social proof) ─────────────────────────────── */}
      {posts.length > 0 && (
        <section className="bg-surface px-6 py-20 sm:py-24">
          <div className="max-w-2xl mx-auto">
            <p className="text-center text-sm font-bold uppercase tracking-[0.25em] text-primary-strong mb-4">
              In their own words
            </p>
            <h2 className="text-center font-display uppercase text-text text-3xl sm:text-4xl mb-10 text-balance">
              People showing up for each other
            </h2>
            <div className="space-y-4">
              {posts.map((post) => (
                <PostPreviewCard key={post.id} post={post} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Is this for you? (objection handling / short FAQ) ────────────── */}
      <Section tone="canvas" pad="py-20 sm:py-24">
        <SectionHeading
          eyebrow="Honest answers"
          title="Is this for you?"
          kicker="The real questions people ask before they join."
        />
        <div className="space-y-3">
          <Faq q="What does it cost?">
            Crew membership is $10/mo — and completely free during the beta. No
            card today. Join now and your founder pricing is locked in when paid
            memberships launch.{' '}
            <Link href="/pricing" className="font-semibold text-primary-strong hover:underline">
              See the full breakdown
            </Link>
            .
          </Faq>
          <Faq q="Do I have to be outgoing?">
            No. Circles are small on purpose — a handful of people, not a crowd.
            You don&apos;t have to perform or network. You just have to show up,
            and the structure does the rest.
          </Faq>
          <Faq q="Is there a catch or a guru?">
            None. Frequency is leaderful, not leader-dependent — built to outlast
            any one person. No charismatic founder to follow, no upsell funnel.
            Memberships exist to sustain the physical spaces, not to extract.
          </Faq>
          <Faq q="I'm not in North County San Diego.">
            The first space is taking root there now. Add your name anyway —
            we&apos;re mapping where people are so we know which city seeds next.
            That&apos;s how it spreads: city by city, like cells.
          </Faq>
          <Faq q="What if it's not for me?">
            Leave anytime, no questions. The beta is free, there&apos;s no card on
            file, and nothing locks you in. The only thing you risk is missing the
            founding cohort.
          </Faq>
        </div>
      </Section>

      {/* ── Founding-cohort scarcity (true) ──────────────────────────────── */}
      <Section tone="surface" pad="py-16 sm:py-20">
        <div className="rounded-3xl border border-border bg-marketing-canvas px-7 py-9 sm:px-10 sm:py-11">
          <p className="text-sm font-bold uppercase tracking-[0.25em] text-primary-strong mb-4">
            Founding cohort
          </p>
          <h2 className="font-display uppercase text-text text-3xl sm:text-4xl mb-5 text-balance">
            We&apos;re opening a few spots at a time.
          </h2>
          <p className="text-lg text-muted leading-relaxed mb-6 max-w-xl">
            A community is only as good as the people who start it, so we&apos;re
            growing the beta deliberately — a small group at a time, so every new
            member is actually welcomed in. Add your name and we&apos;ll reach out
            when the next spots open.
          </p>
          <ul className="grid gap-3 sm:grid-cols-2 mb-8">
            <Perk>Free for the whole beta — no card</Perk>
            <Perk>Founder pricing locked for life</Perk>
            <Perk>Shape the Circles from day one</Perk>
            <Perk>First through the doors at The Lab</Perk>
          </ul>
          <Link
            href={BETA_CTA_HREF}
            className="inline-flex items-center gap-2 rounded-2xl bg-primary text-on-primary px-8 py-3.5 text-base font-bold hover:bg-primary-hover transition-colors"
          >
            {BETA_CTA_LABEL} <ArrowRight className="w-5 h-5" aria-hidden />
          </Link>
        </div>
      </Section>

      {/* ── Closing CTA ──────────────────────────────────────────────────── */}
      <BetaCTA
        heading="Be one of the first."
        body="Two words to belong, a Circle to call yours, and a place to be human — together. Add your name and we'll reach out when a spot opens."
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
  reverse = false,
}: {
  img: string
  alt: string
  title: string
  body: string
  href?: string
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
          {title}
        </h3>
        <div className="bg-surface rounded-3xl p-8 shadow-2xl">
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

function Stat({ value, label }: { value: number | string; label: string }) {
  return (
    <div>
      <p className="font-display text-6xl sm:text-7xl text-text">{value}</p>
      <p className="text-xs text-subtle mt-3 uppercase tracking-widest font-bold">{label}</p>
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

// "What you get" step — numbered, icon-led, benefit-first card.
function Step({
  icon: Icon,
  step,
  title,
  body,
}: {
  icon: typeof Heart
  step: string
  title: string
  body: string
}) {
  return (
    <div className="flex flex-col rounded-3xl border border-border bg-surface-elevated p-7 shadow-sm">
      <div className="flex items-center justify-between mb-5">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary-bg text-primary-strong">
          <Icon className="h-5 w-5" aria-hidden />
        </span>
        <span className="font-display text-2xl text-border-strong" aria-hidden>
          {step}
        </span>
      </div>
      <h3 className="text-lg font-bold text-text mb-2">{title}</h3>
      <p className="text-base text-muted leading-relaxed">{body}</p>
    </div>
  )
}

// Live event row — date chip + title, links to the beta capture.
function EventRow({ event }: { event: LiveEvent }) {
  const d = new Date(event.starts_at)
  const month = d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()
  const day = d.getDate()
  const dateStr = d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
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

// Objection-handling FAQ. Native <details>/<summary> disclosure so the section
// stays a Server Component (no client JS for a simple accordion).
function Faq({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <details className="group rounded-2xl border border-border bg-surface px-6 py-5 shadow-sm [&_summary]:list-none">
      <summary className="flex cursor-pointer items-center justify-between gap-4 text-left">
        <span className="text-lg font-semibold text-text">{q}</span>
        <ChevronDown
          className="h-5 w-5 shrink-0 text-subtle transition-transform group-open:rotate-180"
          aria-hidden
        />
      </summary>
      <div className="mt-4 text-base leading-relaxed text-muted">{children}</div>
    </details>
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
