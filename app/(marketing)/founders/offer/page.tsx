import type { Metadata } from 'next'
import { Check } from 'lucide-react'
import {
  PhotoHero,
  Section,
  SectionHeading,
} from '@/components/marketing/marketing-ui'
import { FounderCheckoutCta } from '@/components/marketing/founder-cta'
import { JsonLd } from '@/components/json-ld'
import { breadcrumbSchema } from '@/lib/jsonld'

export const metadata: Metadata = {
  title: 'The Founders Offer',
  description:
    'Be one of the first 150. Founding pricing, locked for life. Reserve now, free, no card. Founders are charged first when checkout opens, at the locked founder rate.',
  alternates: { canonical: '/founders/offer' },
  openGraph: {
    title: 'The Founders Offer · Frequency',
    description:
      'Founding pricing, locked for life. Open for a limited window, then it is gone.',
    url: '/founders/offer',
  },
}

// The three tiers (Page 2). `prices` are display only, reserving never charges.
const TIERS = [
  {
    name: 'Supporter',
    price: '$25',
    cadence: 'one-time',
    cap: null as string | null,
    blurb: 'For people who believe in it and want in early.',
    benefits: [
      'Founding Supporter badge',
      'Early access to the platform and updates',
      'The founding cohort space',
    ],
    featured: false,
  },
  {
    name: 'Founding Member',
    price: '$250',
    cadence: 'one-time',
    cap: 'Founder price, locked for life. Capped at 150.',
    blurb: 'The core founding offer.',
    benefits: [
      'Everything in Supporter',
      'Permanent Founder role and badge (recognized forever)',
      'Locked-in founder pricing (you never pay more)',
      'Early access to the platform, the Quest, and first gatherings',
      'Roadmap input (a real vote on what we build)',
      'A seat in the founding cohort that shapes the culture',
    ],
    featured: true,
  },
  {
    name: 'Founding Patron',
    price: '$1,000',
    cadence: '10 to 20 only',
    cap: null,
    blurb: 'For the people who want to go all in.',
    benefits: [
      'Everything in Founding Member',
      'Direct access (a personal line to the founders)',
      'Named founding recognition',
      'First invitations to founding gatherings and a hand in the launch',
    ],
    featured: false,
  },
]

const WHY_NOW = [
  {
    title: 'The price never comes back',
    body: '$250 is the founder rate, locked for life. After the round, membership resets to standard pricing.',
  },
  {
    title: '150 seats, then closed',
    body: 'The founding cohort is capped on purpose, small enough to matter.',
  },
  {
    title: 'Time-boxed',
    body: 'The window runs with our launch sprint. When it closes, it closes.',
  },
]

export default function FoundersOfferPage() {
  return (
    <>
      <JsonLd
        data={breadcrumbSchema([
          { name: 'The Founders Round', path: '/founders' },
          { name: 'The Offer', path: '/founders/offer' },
        ])}
      />

      <PhotoHero
        image="/images/site/22a51611-07f6-4c39-8a26-1c996295b6d3.jpg"
        alt="A Frequency founding gathering outdoors"
        focal="object-center"
        eyebrow="The Offer"
        title="Be one of the first 150."
        subtitle="Founding pricing, locked for life. Open for a limited window, then it's gone."
        footer={
          <p className="mt-8 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-sm text-white/60">
            <span className="font-semibold text-white/80">Free to reserve.</span>
            <span aria-hidden className="text-white/30">·</span>
            <span>No card · A membership, not an investment</span>
          </p>
        }
      />

      {/* ── The three tiers ──────────────────────────────────────────────────── */}
      <Section tone="surface" pad="py-20 sm:py-24">
        <div className="max-w-5xl mx-auto -mx-0">
          <div className="grid gap-5 lg:grid-cols-3 items-start">
            {TIERS.map((t) => (
              <div
                key={t.name}
                className={`flex h-full flex-col rounded-2xl border bg-surface p-7 ${
                  t.featured ? 'border-primary shadow-pop lg:-mt-4 lg:mb-4' : 'border-border shadow-sm'
                }`}
              >
                {t.featured && (
                  <span className="self-start rounded-full bg-primary-bg px-3 py-1 text-xs font-bold uppercase tracking-widest text-primary-strong mb-4">
                    Most chosen
                  </span>
                )}
                <h3 className="font-display uppercase text-text text-3xl leading-none">{t.name}</h3>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="font-display text-4xl text-text">{t.price}</span>
                  <span className="text-sm font-semibold text-subtle">{t.cadence}</span>
                </div>
                {t.cap && <p className="mt-2 text-xs font-bold uppercase tracking-wide text-primary-strong">{t.cap}</p>}
                <p className="mt-3 text-base text-muted leading-relaxed">{t.blurb}</p>
                <ul className="mt-5 space-y-2.5 flex-1">
                  {t.benefits.map((b) => (
                    <li key={b} className="flex items-start gap-2.5">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary-strong" aria-hidden />
                      <span className="text-sm text-text leading-snug">{b}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="mt-6 text-center text-sm text-subtle">
            Reserving is free. No card, no charge. You pick your tier, we hold your spot.
          </p>
        </div>
      </Section>

      {/* ── Why now ──────────────────────────────────────────────────────────── */}
      <Section tone="canvas" pad="py-20 sm:py-24">
        <SectionHeading eyebrow="Why now" title="Why the round is small, and why it closes." />
        <div className="grid gap-5 sm:grid-cols-3">
          {WHY_NOW.map((w) => (
            <div key={w.title} className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
              <p className="font-display uppercase text-text text-2xl leading-none">{w.title}</p>
              <p className="mt-3 text-sm text-muted leading-relaxed">{w.body}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* ── The ask + the flag-gated CTA (waitlist form today) ───────────────── */}
      <Section tone="surface" pad="py-20 sm:py-24" className="scroll-mt-20">
        <div id="reserve" />
        <div className="grid lg:grid-cols-2 gap-10 lg:gap-14 items-start">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.25em] text-primary-strong mb-4">
              The ask
            </p>
            <h2 className="font-display uppercase text-text text-4xl sm:text-5xl mb-7">
              Help build it. Take a founding seat.
            </h2>
            <p className="text-lg text-muted leading-relaxed">
              If you&apos;ve ever wished for a real community where you live, somewhere
              to grow, play, and belong off-screen, this is the moment to help build
              it and take a founding seat.
            </p>
          </div>
          <div className="lg:pt-1">
            {/* billingLive() === false today -> the reservation form (no charge).
                When the flag flips true -> the "Become a Founder, $250" live CTA
                pointing at the stub checkout. Only the flag changes behavior. */}
            <FounderCheckoutCta defaultTier="member" />
          </div>
        </div>
      </Section>

      {/* ── Fine print ───────────────────────────────────────────────────────── */}
      <Section tone="canvas" pad="py-16 sm:py-20">
        <div className="rounded-2xl border border-border bg-surface p-7 sm:p-8 shadow-sm">
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-subtle mb-4">Fine print</p>
          <p className="text-sm text-muted leading-relaxed">
            Founding memberships are a one-time founder rate granting the benefits
            above, a membership, not an investment or security. Reserving now is free,
            no card, no charge. When founding checkout opens, your Founder rate is
            locked in. If we don&apos;t launch the founding cohort, every reservation
            is refunded in full. Once the cohort launches, founding memberships are
            non-refundable.
          </p>
        </div>
      </Section>
    </>
  )
}
