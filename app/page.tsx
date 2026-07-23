import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowRight, CalendarDays } from 'lucide-react'
import { BlockRender } from '@/lib/page-editor/block-render'
import { createClient } from '@/lib/supabase/server'
import { MarketingHeader } from '@/components/layout/marketing-header'
import { MarketingFooter } from '@/components/layout/marketing-footer'
import {
  Marquee,
  Button,
  Section,
  SectionHeading,
  PhotoHero,
  PullQuote,
  Stat,
  Steps,
  Card,
  Faq,
} from '@/components/marketing/marketing-ui'
import { Illustration, type IllustrationName } from '@/components/marketing/illustrations'
import { Reveal, Parallax, CountUp, ScrollCue } from '@/components/marketing/motion'
import { JsonLd } from '@/components/json-ld'
import { faqSchema } from '@/lib/jsonld'
import { getInitials, relativeTime, eventDateBadge, formatEventDate } from '@/lib/utils'
import { SITE_NAME, SITE_TAGLINE, SITE_DESCRIPTION, BETA_CTA_LABEL, BETA_CTA_HREF, SOCIAL_PROOF_FLOOR, FOUNDING_PLACE } from '@/lib/site'
import { resolvePageContent } from '@/lib/page-content'
import { type CommunityRole, ROLE_RANK, RoleBadge } from '@/lib/community-roles'
import { communityHref } from '@/lib/community-href'
import { config } from '@/lib/page-editor/config'
import { getPublishedData } from '@/lib/page-editor/data'
import { getTemplate, isRenderable } from '@/lib/page-editor/templates'
import { Suspense } from 'react'
import { getLiveData } from '@/lib/page-editor/live-data'
import { getReferrer } from '@/lib/qr/referral'
import type { LiveEvent } from '@/components/marketing/blocks'
import { getMenu, getMenuSettings } from '@/lib/menus/read'
import type { MenuSettings, ResolvedMenu } from '@/lib/menus/types'

// The home is philosophy-led and builder-first: it sells a movement and a role,
// not "Circles near you." There is no local inventory yet, so the sequence runs
// manifesto → the three roles (Build / Practice / Spread, the same decision as
// /start) → how it works → live proof (honest below the SOCIAL_PROOF_FLOOR) →
// an honest "we are early" beat → a short FAQ → one CTA into /start. The single
// primary action is /start; "Join the Beta" is the secondary path.

// SEO title + description are operator-editable through the ADR-180 page-content
// system (edited at /pages/home; the coded strings below are the fallback). The
// page BODY stays a coded experience — see the EDITABLE_PAGES note below.
export async function generateMetadata(): Promise<Metadata> {
  const { title, description } = await resolvePageContent('/', {
    title: `${SITE_NAME} · ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
  })
  return {
    // `absolute` opts out of the root "%s · Frequency" template (the home title
    // already carries the brand).
    title: { absolute: title },
    description,
    alternates: { canonical: '/' },
    openGraph: { title, description, url: '/' },
  }
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

// The three roles — the same decision a visitor makes at /start. Each card carries
// its spot illustration and routes to its landing (and its first action there).
type HomeRole = {
  illustration: IllustrationName
  label: string
  blurb: string
  cta: string
  href: string
}

const HOME_ROLES: HomeRole[] = [
  {
    illustration: 'lead',
    label: 'Build',
    blurb: 'Be the reason your people have somewhere to go. Host one Circle and we hand you the format.',
    cta: 'Start one Circle',
    href: '/the-community',
  },
  {
    illustration: 'practice',
    label: 'Practice',
    blurb: 'Start where you are, today. Practices, Journeys, and the Mindless timer, all on your own.',
    cta: 'Do one practice today',
    href: '/the-quest',
  },
  {
    illustration: 'spread',
    label: 'Spread',
    blurb: 'Take a small role in building community around you. Bring one person, host once, or share the idea.',
    cta: 'Bring one person',
    href: '/the-community',
  },
]

// Plain-text mirror of the visible "Honest answers" FAQ, emitted as FAQPage
// JSON-LD (AEO: lets search + AI engines surface and cite the answers).
const HOME_FAQ = [
  {
    q: 'Do I have to be a leader to start?',
    a: 'No. There are three ways in. Build means you set out the chairs for one Circle, and we hand you the format. Practice means you start where you are today, on your own. Spread means you bring one person or host once. Pick the one that fits, and you can change your mind later.',
  },
  {
    q: 'What does it cost?',
    a: 'The community is free, forever. Browsing, joining a Circle, and showing up never cost anything. Crew membership, which turns on the Quest and helps keep the physical spaces open, is $9 a month and free for the whole beta. There is no card today, and your founder pricing is locked in for life when paid memberships launch.',
  },
  {
    q: 'Is there a catch?',
    a: 'None. Frequency is leaderful, not leader-dependent: it is built to outlast any one person, with no single figure to follow and no upsell funnel. Memberships fund the physical spaces rather than extract from members.',
  },
  {
    q: 'What if there are no Circles near me yet?',
    a: 'That is most places right now, and that is the point. We are recruiting the people who start them. A Circle only needs a few people and a standing time, so you can start one where you are. The first Lab is taking root in North County San Diego, and the next cities follow the people who show up.',
  },
  {
    q: 'What if it is not for me?',
    a: 'Then you leave anytime, no questions and nothing lost. The beta is free, there is no card on file, and nothing locks you in.',
  },
]

export default async function RootPage() {
  // Home ("/") shows the splash for EVERYONE, signed in or out (owner directive): the
  // marketing/home page is the brand front door, and a member's feed lives at /feed
  // (reached from the in-app logo / Community). We no longer bounce logged-in members
  // off "/" to their feed, so the "Home" nav tab lands on the splash as expected. We
  // still read `user` so the marketing header + splash render the signed-in chrome.
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // `home` is editable in the visual editor (see EDITABLE_PAGES in
  // lib/page-editor/data): the render chain is getPublishedData('home') ->
  // getTemplate('home') -> this coded splash as the last-resort fallback. So a
  // published draft or the designed template shadows the splash when present.
  // Personalize the splash when arriving via a scanned personal code: the /q
  // resolver dropped an fq_ref cookie, so we can name the inviter (research: a
  // generic splash discards the inviter's social proof, the strongest referral
  // lever). Read-only — the cookie is applied/cleared at signup.
  const referrer = await getReferrer()
  // DB-backed nav megas for the splash header (lib/menus); fall back to code defaults on any
  // miss, so safe pre-migration. The splash is always a logged-out 'visitor' surface.
  const [headerMenu, footerMenu, menuTimings] = await Promise.all([
    getMenu('header'),
    getMenu('footer'),
    getMenuSettings(),
  ])
  // getPublishedData -> getTemplate -> legacy, mirroring every other marketing route.
  // Home keeps its live counts OFF: a designed `home` template (when one ships) carries
  // the honest, qualitative founding framing — never invented numbers — and the coded
  // Splash stays the last-resort fallback. The home splash renders its OWN header/footer
  // (it sits over a dark hero, outside the (marketing) layout), so a Puck document is
  // wrapped in that same chrome here.
  const published = await getPublishedData('home')
  const template = getTemplate('home')
  const data = isRenderable(published) ? published : isRenderable(template) ? template : null
  if (data) {
    return (
      <>
        <MarketingHeader overHero isAuth={!!user} headerMenu={headerMenu} menuTimings={menuTimings} ctaLabel="Join the beta" />
        <main id="main">
          <BlockRender config={config} data={data} />
        </main>
        <MarketingFooter menu={footerMenu} />
      </>
    )
  }

  // The live-proof band (counts, events, posts) streams in its own <Suspense> inside Splash,
  // so getLiveData never blocks the hero's first byte (PAGE-FRAMEWORK §5).
  return (
    <Splash
      referrer={referrer}
      isAuth={!!user}
      headerMenu={headerMenu}
      footerMenu={footerMenu}
      menuTimings={menuTimings}
    />
  )
}

// Splash narrative — philosophy first, then the role:
//   manifesto (the third place is gone; you can be the reason it comes back) →
//   the three roles (Build / Practice / Spread) → how it works → live proof →
//   the honest "we are early" beat → the short FAQ → one CTA into /start.
function Splash({
  referrer,
  isAuth = false,
  headerMenu,
  footerMenu,
  menuTimings,
}: {
  referrer: { displayName: string; handle: string; avatarUrl: string | null; vcardEnabled: boolean } | null
  isAuth?: boolean
  headerMenu?: ResolvedMenu
  footerMenu?: ResolvedMenu
  menuTimings?: MenuSettings
}) {
  return (
    <>
      <MarketingHeader
        overHero
        isAuth={isAuth}
        headerMenu={headerMenu}
        menuTimings={menuTimings}
        ctaLabel="Join the beta"
      />

      <main id="main">
      {/* ── Collective hero — everything a community needs in one place; the
          collaboration-first Community Collective positioning (ADR-811). One
          primary CTA into /start. ─────────────────────────────────────────── */}
      <PhotoHero
        minHeight="screen"
        image="/images/site/community-1.jpg"
        alt="A small circle of neighbors talking and laughing together on a sunny lawn"
        focal="object-center"
        eyebrow="Not home. Not work. Your community."
        title={
          <>
            Everything a community needs,
            <br />
            in <span className="text-primary">one place.</span>
          </>
        }
        subtitle="Frequency is a community collective. We exist to support and create community. Start a circle, host events, grow a space, and share the work with people building the same thing."
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
            <ScrollCue label="Three ways to start" />
          </>
        }
      >
        <div className="flex flex-col items-center justify-center gap-4">
          {referrer && (
            <div className="inline-flex items-center gap-2.5 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm text-white shadow-sm backdrop-blur-sm">
              {referrer.avatarUrl ? (
                <Image
                  src={referrer.avatarUrl}
                  alt=""
                  width={28}
                  height={28}
                  className="h-7 w-7 rounded-full object-cover ring-2 ring-white/30"
                />
              ) : (
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/20 text-xs font-bold">
                  {getInitials(referrer.displayName)}
                </span>
              )}
              <span>
                <span className="font-semibold">{referrer.displayName}</span> invited you to Frequency
              </span>
            </div>
          )}
          {/* A scanned personal code lands here (the splash) for a not-yet-member scanner. When the
              inviter published a contact card, offer "Save contact" so the scan can reach it — the
              personal code's whole point in person. Links to the public vCard route (attachment .vcf). */}
          {referrer?.vcardEnabled && (
            <a
              href={`/people/${referrer.handle}/vcard`}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/5 px-3.5 py-1.5 text-sm font-semibold text-white shadow-sm backdrop-blur-sm transition-colors hover:bg-white/15"
            >
              Save {referrer.displayName.trim().split(/\s+/)[0]}&rsquo;s contact
            </a>
          )}
          <div className="flex flex-col items-center gap-3 sm:flex-row">
            <Button href="/start">
              Find your way in <ArrowRight className="w-5 h-5" aria-hidden />
            </Button>
            <Link
              href={BETA_CTA_HREF}
              className="text-sm font-semibold text-white/70 underline-offset-4 hover:text-white hover:underline"
            >
              {BETA_CTA_LABEL}
            </Link>
          </div>
        </div>
      </PhotoHero>

      {/* ── The case · why it falls to ordinary people ─────────────────────── */}
      <Section tone="canvas">
        <Reveal>
          <SectionHeading
            eyebrow="It's not you"
            title={
              <>
                The third place is broken.
                <br />
                <span className="text-primary">Somebody</span> has to start the next one.
              </>
            }
            kicker="It does not take a big personality. It takes a standing time and a door someone holds open."
          />
        </Reveal>
        <Reveal delay={100} className="space-y-5 text-lg text-muted leading-relaxed">
          <p>
            Most of a generation reports feeling lonely, not for lack of people, but for lack of{' '}
            <em>places</em>. The corner café, the town square, the gathering ground all quietly
            closed, and we traded them for feeds. You are not broken. The third place is.
          </p>
          <p>
            <span className="font-semibold text-text">
              No company is going to hand the third place back. People rebuild it, one Circle at a
              time.
            </span>{' '}
            Frequency is the toolkit for the people who decide to be one of them: the format, the
            rails, the backup, and a real room to grow into.
          </p>
        </Reveal>
      </Section>

      <PullQuote tone="surface" cite="The wedge, in one line">
        Seen, not followed.
        <br />
        <span className="text-primary">Missed,</span> not muted.
      </PullQuote>

      {/* ── The three roles — Build / Practice / Spread, the /start decision ── */}
      <Section tone="canvas">
        <Reveal>
          <SectionHeading
            eyebrow="Pick your way in"
            title={
              <>
                Three ways to <span className="text-primary">be one of them.</span>
              </>
            }
            kicker="Builders first. Pick the role that fits you, and we will point you at your first move."
          />
        </Reveal>
        <Reveal delay={100}>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            {HOME_ROLES.map((role) => (
              <Card key={role.label} tone="feature" className="flex flex-col text-center">
                <div className="mb-5 flex h-28 items-center justify-center">
                  <Illustration name={role.illustration} className="h-full" />
                </div>
                <h3 className="mb-2 font-display uppercase text-2xl text-text">{role.label}</h3>
                <p className="mb-6 text-base leading-relaxed text-muted">{role.blurb}</p>
                <div className="mt-auto">
                  <Button href={role.href} size="sm">
                    {role.cta} <ArrowRight className="h-4 w-4" aria-hidden />
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </Reveal>
        <p className="mt-10 text-center text-sm text-subtle">
          Not sure yet? Any door works.{' '}
          <Link href="/start" className="font-semibold text-primary-strong hover:underline">
            Help me pick
          </Link>
          .
        </p>
      </Section>

      {/* ── How it works · three plain steps ───────────────────────────────── */}
      <Section tone="surface">
        <Reveal>
          <SectionHeading
            eyebrow="How it works"
            title={
              <>
                A standing time, a small group, and <span className="text-primary">show up.</span>
              </>
            }
            kicker="No application. No audition. No performance."
          />
        </Reveal>
        <Reveal delay={100}>
          <Steps
            steps={[
              {
                title: 'Pick a Circle',
                body: 'A small standing group around something you love, a run, a supper, a sauna night, a side project. Join one near you, or start one where you are.',
              },
              {
                title: 'Set the rhythm',
                body: 'Same time, same group, week after week. We hand builders the format and the first-night script, so a group lasts past week three.',
              },
              {
                title: 'Show up',
                body: 'Come back. Your people notice, the Quest rewards the real stuff, and you are missed when you are gone.',
              },
            ]}
          />
        </Reveal>
      </Section>

      {/* ── It already happened once · Moonlight Beach as evidence ──────────── */}
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
              'linear-gradient(180deg, color-mix(in srgb, var(--color-ink) 78%, transparent) 0%, color-mix(in srgb, var(--color-ink) 62%, transparent) 48%, color-mix(in srgb, var(--color-ink) 90%, transparent) 100%)',
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
                  A few people started gathering on the cliffs at Moonlight Beach to meditate, every
                  single morning. They kept showing up for more than 500 days straight.
                </p>
                <p className="text-white/70">
                  Over a thousand people came through. No app, no agenda, just a standing time and a
                  place to be. It proved the hunger is real, and that ordinary people can answer it.
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

      {/* ── Live proof (counts · events · posts) — streamed so it never blocks the
          hero's first byte (PAGE-FRAMEWORK §5). Honest below the floor. ───── */}
      <Suspense fallback={<LiveProofSkeleton />}>
        <LiveProof />
      </Suspense>

      {/* ── It grows on its own · leaderful, pay-it-forward ─────────────────── */}
      <Section tone="canvas">
        <Reveal>
          <SectionHeading
            eyebrow="Built together"
            title={
              <>
                It grows on <span className="text-primary">its own.</span>
              </>
            }
            kicker="Leaderful, never leader-dependent."
          />
        </Reveal>
        <Reveal delay={100} className="space-y-5 text-lg text-muted leading-relaxed">
          <p>
            No guru, no franchise. Leaders rise from the people who simply keep showing up. Circles
            fill and split, neighborhoods multiply, and where enough people gather in one place, the
            next Lab gets a reason to open.
          </p>
          <p>
            Membership keeps the rooms open, and those who can give more quietly hold the door for
            those who can&apos;t. Belonging shouldn&apos;t depend on what you can afford.
          </p>
        </Reveal>
      </Section>

      <PullQuote tone="surface" cite="The rule we won't trade">
        Circulation, <span className="text-primary">not exclusion.</span>
      </PullQuote>

      {/* ── The honest "we are early" trust beat ───────────────────────────── */}
      <section className="relative bg-slat overflow-hidden">
        <div className="light-strip absolute inset-x-0 top-0 z-10" />
        <Marquee items={['Worldwide', 'Day one', 'Built together', 'Real places']} />
        <div className="amber-glow absolute inset-0 pointer-events-none" />
        <div className="relative z-10 mx-auto max-w-3xl px-6 py-24 sm:py-28 text-center">
          <Reveal>
            <p className="text-sm font-bold uppercase tracking-[0.25em] text-primary mb-4">
              The honest part
            </p>
            <h2 className="font-display uppercase text-on-ink text-4xl sm:text-5xl mb-6 text-balance">
              We are early. That&apos;s the offer.
            </h2>
          </Reveal>
          <Reveal delay={100}>
            <div className="mx-auto max-w-xl space-y-4 text-lg text-on-ink-muted leading-relaxed">
              <p>
                We won&apos;t pretend there are Circles on every corner yet. There aren&apos;t. The
                first ones are forming in {FOUNDING_PLACE}, and the rest of the map is open.
              </p>
              <p className="font-semibold text-on-ink/90">
                That is the whole point of joining now. You don&apos;t arrive to a finished thing.
                You help start it, and the way it works in your city is shaped by the people who show
                up first.
              </p>
            </div>
          </Reveal>
        </div>
        <div className="light-strip absolute inset-x-0 bottom-0 z-10" />
      </section>

      {/* ── Honest answers (short FAQ) ─────────────────────────────────────── */}
      <Section tone="canvas">
        <JsonLd data={[faqSchema(HOME_FAQ)]} />
        <Reveal>
          <SectionHeading
            eyebrow="Honest answers"
            title="Is this for you?"
            kicker="The real questions people ask before they start."
          />
        </Reveal>
        <div className="space-y-3">
          <Faq q="Do I have to be a leader to start?">
            No. There are three ways in. <span className="font-semibold text-text">Build</span> means
            you set out the chairs for one Circle, and we hand you the format, the first-night script,
            and the rails. <span className="font-semibold text-text">Practice</span> means you start
            where you are today, on your own, with the Practices and the Mindless timer.{' '}
            <span className="font-semibold text-text">Spread</span> means you bring one person, host
            once, or share the idea. Pick the one that fits, and you can change your mind later.
          </Faq>
          <Faq q="What does it cost?">
            The community is free, forever. Browsing, joining a Circle, and showing up never cost
            anything. Crew membership, which turns on the Quest and helps keep the physical spaces
            open, is $9/mo and free for the whole beta. There&apos;s no card today: join now and
            your founder pricing is locked in for life when paid memberships launch. Memberships
            exist to sustain the rooms and hold the door open for people who can&apos;t pay, never to
            extract from you.{' '}
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
          <Faq q="What if there are no Circles near me yet?">
            That&apos;s most places right now, and that&apos;s the point. We&apos;re recruiting the
            people who start them. A Circle only needs a few people and a standing time, so you can
            start one where you are. The first Lab is taking root in {FOUNDING_PLACE}, and the next
            cities follow the people who show up. Tell us where you are and we&apos;ll know which city
            to seed next.
          </Faq>
          <Faq q="What if it's not for me?">
            Then you leave anytime, no questions and nothing lost. The beta is free, there&apos;s no
            card on file, and nothing locks you in: no contracts, no cancellation maze. Try a
            gathering or two, and if the room isn&apos;t for you, walk away with our blessing.
          </Faq>
        </div>
      </Section>

      {/* ── Closing CTA — one calm path into /start ─────────────────────────── */}
      <section className="relative bg-slat px-6 py-24 sm:py-28 text-center overflow-hidden">
        <div className="light-strip absolute inset-x-0 top-0" />
        <div className="amber-glow absolute inset-0 pointer-events-none" />
        <div className="relative mx-auto max-w-2xl">
          <h2 className="font-display uppercase text-on-ink text-4xl sm:text-5xl mb-6 text-balance">
            Be the reason your people have somewhere to go.
          </h2>
          <p className="text-xl text-on-ink-muted mb-9 leading-relaxed">
            Get people together, do things on purpose. Three ways in: build a Circle, start a practice
            today, or bring one person. Pick yours and we&apos;ll point you at the first move.
          </p>
          <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button href="/start" size="lg">
              Find your way in <ArrowRight className="w-5 h-5" aria-hidden />
            </Button>
            <Link
              href={BETA_CTA_HREF}
              className="text-sm font-semibold text-on-ink-muted underline-offset-4 hover:text-on-ink hover:underline"
            >
              {BETA_CTA_LABEL}
            </Link>
          </div>
        </div>
      </section>
      </main>

      <MarketingFooter menu={footerMenu} />
    </>
  )
}

// ── Building blocks ─────────────────────────────────────────────────────────

// The live-proof band — counts, upcoming events, recent member posts. Self-fetching async
// server component so it streams in its own <Suspense> and never blocks the splash hero.
async function LiveProof() {
  const supabase = await createClient()
  const live = await getLiveData(supabase)
  const posts = live.posts as PostPreviewRow[]
  const postsCurated = live.postsCurated
  const memberCount = live.memberCount
  const circleCount = live.circleCount
  const upcomingEvents = live.upcomingEvents
  const hasProof = memberCount >= SOCIAL_PROOF_FLOOR

  return (
    <>
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
                Real people, real Circles, real gatherings, taking root in {FOUNDING_PLACE} right now.
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
                this becomes. Come be one of them.
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

    </>
  )
}

// Holds the live-proof band's vertical space (bg matches the proof section) while it streams.
function LiveProofSkeleton() {
  return <section aria-hidden className="bg-slat px-6 py-24 sm:py-28" />
}

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
            <RoleBadge role={a!.community_role as CommunityRole} className="text-3xs leading-tight" />
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
        <span className="text-3xs font-bold leading-none text-primary-strong">{month}</span>
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
