import type { Metadata } from 'next'
import Link from 'next/link'
import {
  ArrowRight,
  Sunrise,
  MessageCircle,
  CalendarCheck,
  MapPin,
  Waves,
  Dumbbell,
  Coffee,
  Sparkles,
} from 'lucide-react'
import {
  PageHero,
  Section,
  SectionHeading,
  Statement,
  ZigZag,
  BetaCTA,
} from '@/components/marketing/marketing-ui'
import { BETA_CTA_LABEL, BETA_CTA_HREF, FOUNDING_PLACE } from '@/lib/site'
import { ProductTour } from './tour'

export const revalidate = 3600

export const metadata: Metadata = {
  title: 'Demo — See inside Frequency',
  description:
    'Take the tour. A real look at the Frequency app — feed, circles, events, and zaps — and inside The Lab, the physical third space taking root in North County San Diego.',
  alternates: { canonical: '/demo' },
  openGraph: {
    title: 'See inside Frequency',
    description:
      'A guided tour of the app and the physical space. Free during the beta, founding cohort forming now.',
    url: '/demo',
  },
}

export default function DemoPage() {
  return (
    <>
      <PageHero
        eyebrow="Take the tour"
        title="See inside Frequency."
        subtitle="A real look at both halves of it — the app your people live in day to day, and The Lab, the space you walk into. No vapor, no someday. This is what's being built right now."
      />

      {/* ── The interactive product tour ─────────────────────────────────── */}
      <Section tone="canvas" pad="pt-4 pb-20 sm:pb-24">
        <div className="max-w-3xl mx-auto text-center mb-10">
          <p className="text-sm font-bold uppercase tracking-[0.25em] text-primary-strong mb-4">
            The app
          </p>
          <h2 className="font-display uppercase text-text text-4xl sm:text-5xl">
            Your people, in your pocket.
          </h2>
          <p className="mt-4 text-xl italic text-muted">
            Tap through the four things you&apos;ll actually use.
          </p>
        </div>
        <ProductTour />
      </Section>

      {/* Benefit reframe between digital + the day */}
      <Statement tone="surface">
        The app is the thread. <span className="text-primary">The room</span> is the
        point.
      </Statement>

      {/* ── A day in Frequency: digital ⇄ physical narrative ─────────────── */}
      <Section tone="surface" pad="pt-4 pb-20 sm:pb-24">
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
            body="Someone posts a photo from the morning. Three zaps, a couple of replies. The thread keeps the warmth alive between meetings."
          />
          <DayBeat
            icon={CalendarCheck}
            time="1:00p"
            title="One tap to RSVP"
            body="An event drops for Saturday's thermal circuit. You tap RSVP. Now you're expected — and you'll be missed if you don't show."
          />
          <DayBeat
            icon={MapPin}
            time="6:30p"
            title="Meet at The Lab"
            body="After work you walk into the connection bar. Faces you know from the feed are already there. The app brought you here; the room takes over."
          />
        </ol>
      </Section>

      {/* ── Tour of the physical space: The Lab ──────────────────────────── */}
      <Statement tone="canvas">
        Now step <span className="text-primary">inside</span> The Lab.
      </Statement>

      <ZigZag
        img="/images/site/lab-storefront.jpg"
        alt="The Lab storefront in North County San Diego"
        eyebrow="The space"
        title="A third space with a front door."
        imgAspect="landscape"
        tone="canvas"
      >
        <p>
          Not home, not work. A real place you can walk into. Part regulation studio,
          part social hub, part venue. The first one is taking root in{' '}
          <strong className="text-text">{FOUNDING_PLACE}</strong>.
        </p>
        <p>
          Everything in the app points here. The environment does the work the feed
          never could.
        </p>
      </ZigZag>

      <ZigZag
        img="/images/site/lab-concept.jpg"
        alt="Inside The Lab's movement studio"
        eyebrow="Movement studios"
        title="Rooms built to move you."
        imgAspect="landscape"
        reverse
        tone="canvas"
      >
        <p>
          Breathwork at sunrise, ecstatic dance at night, strength in between. Studios
          designed for your nervous system, not for a mirror.
        </p>
      </ZigZag>

      <ZigZag
        img="/images/site/lab-thermal.jpg"
        alt="The thermal circuit at The Lab"
        eyebrow="The thermal circuit"
        title="Heat, cold, repeat."
        imgAspect="landscape"
        tone="canvas"
      >
        <p>
          Sauna and cold plunge in a loop that resets you to baseline. Do it alone and
          it&apos;s a habit. Do it with your circle and it&apos;s a ritual.
        </p>
      </ZigZag>

      <ZigZag
        img="/images/site/lab-lounge.jpg"
        alt="The connection bar lounge at The Lab"
        eyebrow="The connection bar"
        title="Where the talking happens."
        imgAspect="landscape"
        reverse
        tone="canvas"
      >
        <p>
          A bar with no alcohol agenda — adaptogens, coffee, conversation. The third
          place between the studio and the door, where strangers turn into the people
          you came for.
        </p>
      </ZigZag>

      <ZigZag
        img="/images/site/lab-pool.jpg"
        alt="The events floor at The Lab"
        eyebrow="The events floor"
        title="Room to gather."
        imgAspect="landscape"
        tone="canvas"
      >
        <p>
          Sound baths, workshops, sunset socials. The same events you RSVP&apos;d to in
          the app, happening in a room built to hold a crowd that actually knows each
          other.
        </p>
      </ZigZag>

      {/* What's in there — quick scan of the physical features */}
      <Section tone="surface" pad="pt-4 pb-20 sm:pb-24">
        <div className="grid sm:grid-cols-2 gap-4">
          <SpaceCard
            icon={Dumbbell}
            title="Movement studios"
            body="Breathwork, dance, strength — programmed by the community, not a chain."
          />
          <SpaceCard
            icon={Waves}
            title="Thermal circuit"
            body="Sauna and cold plunge to drop you back into your body."
          />
          <SpaceCard
            icon={Coffee}
            title="Connection bar"
            body="Adaptogens and coffee, built for lingering and meeting people."
          />
          <SpaceCard
            icon={Sparkles}
            title="Events floor"
            body="A flexible room for the gatherings that grow from the circles."
          />
        </div>
      </Section>

      {/* ── Honest framing ───────────────────────────────────────────────── */}
      <Section tone="canvas" pad="pt-4 pb-20 sm:pb-24">
        <div className="rounded-3xl border border-border bg-surface p-8 sm:p-10 shadow-sm">
          <p className="text-sm font-bold uppercase tracking-[0.25em] text-primary-strong mb-4">
            Straight with you
          </p>
          <h2 className="font-display uppercase text-text text-3xl sm:text-4xl">
            It&apos;s a beta. That&apos;s the good part.
          </h2>
          <div className="mt-6 space-y-4 text-lg text-muted leading-relaxed">
            <p>
              We&apos;re starting in one place — {FOUNDING_PLACE} — with a small founding
              cohort. The circles are still forming. The first members are shaping what
              this becomes, which means you&apos;d be early enough to leave a mark on it.
            </p>
            <p>
              It&apos;s <strong className="text-text">free during the beta</strong> — no
              card today. Founders lock in founder pricing when paid memberships launch,
              and you can leave anytime. We open spots a few at a time so the rooms stay
              the right size.
            </p>
          </div>
        </div>
      </Section>

      {/* ── Dual CTA ─────────────────────────────────────────────────────── */}
      <Section tone="surface" pad="pt-4 pb-16 sm:pb-20">
        <div className="text-center">
          <h2 className="font-display uppercase text-text text-4xl sm:text-5xl mb-7">
            Seen enough? Come be one of the first.
          </h2>
          <div className="flex items-center gap-3 flex-wrap justify-center">
            <Link
              href={BETA_CTA_HREF}
              className="inline-flex items-center gap-2 rounded-2xl bg-primary text-on-primary px-8 py-3.5 text-base font-bold hover:bg-primary-hover transition-colors"
            >
              {BETA_CTA_LABEL} <ArrowRight className="w-5 h-5" />
            </Link>
            <Link
              href="/pricing"
              className="rounded-2xl border border-border-strong px-8 py-3.5 text-base font-medium text-text hover:bg-surface-elevated transition-colors"
            >
              See pricing
            </Link>
          </div>
        </div>
      </Section>

      <BetaCTA
        heading="The first circles are forming."
        body="Add your name and we'll reach out when a spot opens in the founding cohort."
      />
    </>
  )
}

// ── Local presentational components ───────────────────────────────────────────

function DayBeat({
  icon: Icon,
  time,
  title,
  body,
}: {
  icon: typeof Sunrise
  time: string
  title: string
  body: string
}) {
  return (
    <li className="flex items-start gap-4 rounded-3xl border border-border bg-surface p-5 sm:p-6 shadow-sm">
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

function SpaceCard({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof Dumbbell
  title: string
  body: string
}) {
  return (
    <div className="rounded-3xl border border-border bg-surface p-6 shadow-sm">
      <div className="w-11 h-11 rounded-2xl bg-primary-bg flex items-center justify-center mb-4">
        <Icon className="w-5 h-5 text-primary-strong" aria-hidden />
      </div>
      <h3 className="font-display uppercase text-text text-2xl leading-none">{title}</h3>
      <p className="mt-3 text-base text-muted leading-relaxed">{body}</p>
    </div>
  )
}
