import type { Metadata } from 'next'
import { Store, Percent, MapPin } from 'lucide-react'
import {
  PhotoHero,
  Section,
  SectionHeading,
} from '@/components/marketing/marketing-ui'
import { FoundingBusinessCta } from '@/components/marketing/founder-cta'
import { JsonLd } from '@/components/json-ld'
import { breadcrumbSchema, faqSchema } from '@/lib/jsonld'
import { getFoundingConfig } from '@/lib/pricing/settings'

export const metadata: Metadata = {
  title: 'Founding Businesses',
  description:
    'Be one of the first businesses in your city on Frequency. A locked founder rate, a marketplace fee bought down to 3 percent, and a permanent Founding badge. Reserve now, free, no card.',
  alternates: { canonical: '/founders/business' },
  openGraph: {
    title: 'Founding Businesses · Frequency',
    description:
      'A locked founder rate and a marketplace fee bought down to 3 percent. Capped per city. Reserve now, free, no card.',
    url: '/founders/business',
  },
}

function usd(cents: number): string {
  const dollars = cents / 100
  return Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`
}

const FAQS = [
  {
    q: 'When does it charge?',
    a: "Right now you're reserving your founding business spot, no charge yet. Founding businesses are charged first when checkout opens, at the locked founder rate.",
  },
  {
    q: 'What is the fee buydown?',
    a: 'A Founding Business locks the lowest marketplace take rate on the platform, 3 percent, instead of the standard 5 to 8 percent. That rate is grandfathered, so it stays yours.',
  },
  {
    q: 'Do I need a card to reserve?',
    a: 'No. Reserving is free and takes no card. A card is optional, and even if you add one, it is only charged when founding checkout opens.',
  },
  {
    q: 'Is my spot guaranteed?',
    a: 'Each city holds a limited number of founding businesses. Reserve early to hold your city spot before the cap fills.',
  },
]

export default async function FoundingBusinessPage() {
  const config = await getFoundingConfig()
  const monthly = usd(config.business_monthly_cents)
  const takePct = (config.business_take_bps / 100).toString()
  const cityCap = config.business_city_cap

  const OFFER = [
    {
      Icon: Percent,
      label: `A ${takePct}% marketplace fee`,
      body: `The lowest take rate on the platform, ${takePct} percent, bought down from the standard 5 to 8 percent. Locked and grandfathered, so it stays yours.`,
    },
    {
      Icon: Store,
      label: `${monthly} a month, locked`,
      body: `The founding business rate, locked for life. When the round closes, business membership resets to standard pricing.`,
    },
    {
      Icon: MapPin,
      label: `${cityCap} spots per city`,
      body: `Each city holds ${cityCap} founding businesses. Small on purpose, so being first in your city means something.`,
    },
  ]

  return (
    <>
      <JsonLd
        data={[
          breadcrumbSchema([
            { name: 'The Founders Round', path: '/founders' },
            { name: 'Founding Businesses', path: '/founders/business' },
          ]),
          faqSchema(FAQS.map((f) => ({ q: f.q, a: f.a }))),
        ]}
      />

      <PhotoHero
        image="/images/site/22a51611-07f6-4c39-8a26-1c996295b6d3.jpg"
        alt="A local business owner at a Frequency community gathering"
        focal="object-center"
        eyebrow="Founding Businesses"
        title="Be the first business in your city."
        subtitle="Frequency is a real-world community, built city by city. Founding businesses get the lowest fee on the platform, a locked rate, and a permanent place at the start."
        footer={
          <p className="mt-8 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-sm text-white/60">
            <span className="font-semibold text-white/80">Free to reserve.</span>
            <span aria-hidden className="text-white/30">·</span>
            <span>No card · Founder rate locked · {cityCap} spots per city</span>
          </p>
        }
      />

      {/* ── The offer ────────────────────────────────────────────────────────── */}
      <Section tone="surface" pad="py-20 sm:py-24">
        <SectionHeading
          eyebrow="The offer"
          title="Lower fees, a locked rate, a permanent badge."
          kicker="The founder deal for the businesses who help build the market."
        />
        <div className="grid gap-4 sm:grid-cols-3">
          {OFFER.map(({ Icon, label, body }) => (
            <div key={label} className="flex h-full flex-col rounded-2xl border border-border bg-surface p-7 shadow-sm">
              <div className="w-11 h-11 rounded-2xl bg-primary-bg flex items-center justify-center mb-4">
                <Icon className="w-5 h-5 text-primary-strong" aria-hidden />
              </div>
              <h3 className="font-display uppercase text-text text-2xl leading-none">{label}</h3>
              <p className="mt-3 text-base text-muted leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* ── The reserve (flag-gated waitlist form today) ─────────────────────── */}
      <Section tone="canvas" pad="py-20 sm:py-24" className="scroll-mt-20">
        <div id="reserve" />
        <div className="grid lg:grid-cols-2 gap-10 lg:gap-14 items-start">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.25em] text-primary-strong mb-4">
              The ask
            </p>
            <h2 className="font-display uppercase text-text text-4xl sm:text-5xl mb-7">
              Hold your city spot.
            </h2>
            <p className="text-lg text-muted leading-relaxed">
              If you run a business and want in early where you operate, this is the moment to hold your
              spot. Reserve now, free, no card. Your founder rate and the bought-down fee are locked when
              founding checkout opens.
            </p>
          </div>
          <div className="lg:pt-1">
            {/* billingLive() === false today -> the reservation form (no charge). When the flag flips
                true -> a "spot held" note. Only the flag changes behavior; nothing here charges. */}
            <FoundingBusinessCta />
          </div>
        </div>
      </Section>

      {/* ── FAQ ──────────────────────────────────────────────────────────────── */}
      <Section tone="surface" pad="py-20 sm:py-24">
        <SectionHeading eyebrow="Questions" title="The honest answers." />
        <dl className="mx-auto max-w-2xl divide-y divide-border">
          {FAQS.map((f) => (
            <div key={f.q} className="py-5">
              <dt className="text-base font-bold text-text">{f.q}</dt>
              <dd className="mt-2 text-base text-muted leading-relaxed">{f.a}</dd>
            </div>
          ))}
        </dl>
      </Section>

      {/* ── Fine print ───────────────────────────────────────────────────────── */}
      <Section tone="canvas" pad="py-16 sm:py-20">
        <div className="rounded-2xl border border-border bg-surface p-7 sm:p-8 shadow-sm">
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-subtle mb-4">Fine print</p>
          <p className="text-sm text-muted leading-relaxed">
            A founding business membership is a locked founder rate and a bought-down marketplace fee, a
            membership, not an investment or security. Reserving now is free, no card, no charge. When
            founding checkout opens, your founder rate is locked in. If we don&apos;t launch the founding
            cohort in your city, every reservation is released with nothing owed.
          </p>
        </div>
      </Section>
    </>
  )
}
