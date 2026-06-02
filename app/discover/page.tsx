import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import {
  getTopicalChannels,
  getPublicCircles,
  getPublicEvents,
  getPublicPosts,
  getPublicCounts,
  getPublicCityClusters,
} from '@/lib/discover'
import {
  ChannelCard,
  CircleCard,
  EventRow,
  PostPreview,
  SectionHeading,
  DiscoverHero,
} from '@/components/discover/cards'
import { Statement, ZigZag, BetaCTA } from '@/components/marketing/marketing-ui'
import { DiscoverLocator } from '@/components/discover/discover-locator'
import { InlineBetaCapture } from '@/components/discover/inline-beta-capture'
import { SITE_NAME, SOCIAL_PROOF_FLOOR, FOUNDING_PLACE, BETA_CTA_HREF, BETA_CTA_LABEL } from '@/lib/site'
import { JsonLd } from '@/components/json-ld'
import {
  breadcrumbSchema,
  topicListSchema,
  circleListSchema,
  eventListSchema,
  faqSchema,
} from '@/lib/jsonld'

// Evergreen Q&A — drives the FAQ section below and its FAQPage schema.
const DISCOVER_FAQS = [
  {
    q: 'What is Frequency?',
    a: 'Frequency is a community platform that connects neighborhoods into real-world community. You join a local circle of up to 50 people, show up for in-person events near you, and build lasting friendships with people who live close by.',
  },
  {
    q: 'Is Frequency free to join?',
    a: 'Yes. Creating an account, joining a circle, and RSVPing to events is free.',
  },
  {
    q: 'What is a circle?',
    a: 'A circle is a small local group of up to 50 people centered on a shared topic — like Movement, Spirituality, or Creative practice. Small enough to know everyone, big enough to always have plans.',
  },
  {
    q: 'Do I need an account to browse?',
    a: 'No. You can browse circles, topics, and upcoming events without signing up. You only need a free account to join a circle, RSVP to an event, see exact venue details, or post.',
  },
  {
    q: 'How is my location handled?',
    a: 'Public pages only ever show the city or area, never a precise address. The exact venue for an event is shared with members who RSVP.',
  },
]

export const metadata: Metadata = {
  title: 'Discover the community',
  description:
    'Browse local circles, upcoming real-world events, and topics across the Frequency community. Find your people and show up in person.',
  alternates: { canonical: '/discover' },
  openGraph: {
    title: `Discover the community — ${SITE_NAME}`,
    description:
      'Browse local circles, upcoming real-world events, and topics across the Frequency community.',
    url: '/discover',
  },
}

// Revalidate hourly — community content changes often enough to keep fresh,
// rarely enough that we don't need per-request rendering for crawlers.
export const revalidate = 3600

export default async function DiscoverHubPage() {
  const [channels, circles, events, posts, counts, cityClusters] = await Promise.all([
    getTopicalChannels(),
    getPublicCircles(6),
    getPublicEvents(4),
    getPublicPosts(3),
    getPublicCounts(),
    getPublicCityClusters(),
  ])

  // Circle counts per channel for the topic grid.
  const allCircles = await getPublicCircles(200)
  const countByChannel = new Map<string, number>()
  for (const c of allCircles) {
    if (c.channel_slug) countByChannel.set(c.channel_slug, (countByChannel.get(c.channel_slug) ?? 0) + 1)
  }

  return (
    <>
      <JsonLd
        data={[
          breadcrumbSchema([{ name: 'Discover', path: '/discover' }]),
          topicListSchema(channels, 'Topics on Frequency'),
          eventListSchema(events, 'Upcoming events'),
          circleListSchema(circles, 'Circles forming now'),
          faqSchema(DISCOVER_FAQS),
        ]}
      />

      {/* ── Hero ──────────────────────────────────────────────── */}
      <DiscoverHero
        image="/images/site/PHOTO-2020-09-09-16-38-27.jpeg"
        alt="A large Frequency yoga gathering on a lawn at golden hour in North County San Diego"
        eyebrow="Discover Frequency"
        title="Real community, near you"
        subtitle="Explore the circles, events, and topics bringing neighbors together in person. Browse freely — sign up free to join a circle, RSVP to an event, or post."
      >
        {counts.members >= SOCIAL_PROOF_FLOOR ? (
          <div className="flex items-center justify-center gap-6 text-sm text-white/80">
            <span><strong className="text-white">{counts.members}</strong> members</span>
            <span className="text-white/30">|</span>
            <span><strong className="text-white">{counts.circles}</strong> circles</span>
            <span className="text-white/30">|</span>
            <span><strong className="text-white">{events.length}</strong> upcoming events</span>
          </div>
        ) : (
          <p className="text-sm text-white/80">
            Forming now in {FOUNDING_PLACE} — explore the first circles, topics, and events below.
          </p>
        )}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <Link
            href={BETA_CTA_HREF}
            className="inline-flex items-center gap-2 rounded-2xl bg-primary text-on-primary px-7 py-3 text-base font-bold hover:bg-primary-hover transition-colors shadow-pop"
          >
            {BETA_CTA_LABEL} <ArrowRight className="w-4 h-4" />
          </Link>
          <Link href="/sign-in" className="text-sm font-semibold text-white/80 hover:text-white transition-colors">
            or browse free →
          </Link>
        </div>
      </DiscoverHero>

      {/* ── Locator map (privacy-safe: city centroids only) ──────── */}
      <section className="bg-surface px-6 py-16 border-b border-border/60">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-8">
            <SectionHeading eyebrow="Where it's happening" title="Find your area" />
          </div>
          {cityClusters.length > 0 ? (
            <DiscoverLocator cities={cityClusters} />
          ) : (
            <div className="mx-auto max-w-2xl rounded-2xl border border-border bg-marketing-canvas p-8 text-center">
              <p className="mb-1 text-lg font-semibold text-text">We&apos;re starting in {FOUNDING_PLACE}.</p>
              <p className="mb-5 text-sm text-muted leading-relaxed">
                The first circles are forming now. Be one of the first in your neighborhood.
              </p>
              <Link
                href={BETA_CTA_HREF}
                className="inline-flex items-center gap-2 rounded-2xl bg-primary text-on-primary px-7 py-3 text-base font-bold hover:bg-primary-hover transition-colors"
              >
                {BETA_CTA_LABEL} <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* ── Topics ────────────────────────────────────────────── */}
      {channels.length > 0 && (
        <section className="bg-marketing-canvas px-6 py-16">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-10">
              <SectionHeading eyebrow="Explore by topic" title="Topics" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {channels.map((ch) => (
                <ChannelCard key={ch.id} channel={ch} circleCount={countByChannel.get(ch.slug) ?? 0} />
              ))}
            </div>
            <div className="text-center mt-8">
              <Link href="/discover/topics" className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-strong hover:underline">
                Browse all topics <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* ── Dark beat ─────────────────────────────────────────── */}
      <Statement tone="ink">
        Not a someday idea.{' '}
        <span className="text-primary">It&apos;s already happening.</span>
      </Statement>

      {/* ── Upcoming events ───────────────────────────────────── */}
      {events.length > 0 && (
        <section className="bg-surface px-6 py-16">
          <div className="max-w-2xl mx-auto">
            <div className="text-center mb-10">
              <SectionHeading eyebrow="Coming up" title="Upcoming events" tone="success" />
            </div>
            <div className="space-y-3">
              {events.map((e) => (
                <EventRow key={e.id} event={e} />
              ))}
            </div>
            <div className="text-center mt-8">
              <Link href="/discover/events" className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-strong hover:underline">
                Browse all events <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* ── Featured circles ──────────────────────────────────── */}
      {circles.length > 0 && (
        <section className="bg-marketing-canvas px-6 py-16">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-10">
              <SectionHeading eyebrow="Find your people" title="Circles forming now" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {circles.map((c) => (
                <CircleCard key={c.id} circle={c} />
              ))}
            </div>
            <div className="text-center mt-8">
              <Link href="/discover/circles" className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-strong hover:underline">
                Browse all circles <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* ── Tender accent ─────────────────────────────────────── */}
      <ZigZag
        tone="surface"
        img="/images/site/fd40d12c-7667-4d4e-b4c0-3b828170d9b1.jpg"
        alt="A Frequency member resting in savasana beside a hand-lettered “you are beautiful” sign"
        imgAspect="landscape"
        eyebrow="Why we show up"
        title="You are beautiful"
        kicker="And you were never meant to do this alone."
      >
        <p>
          Frequency is built on a simple belief: people are happier, healthier, and more
          themselves when they belong to a community that knows them.
        </p>
        <p>
          Every circle and every event is an invitation to be seen — to trade the scroll for a
          real morning on the grass with neighbors who show up for you.
        </p>
      </ZigZag>

      {/* ── Feed preview ──────────────────────────────────────── */}
      {posts.length > 0 && (
        <section className="bg-marketing-canvas px-6 py-16">
          <div className="max-w-2xl mx-auto">
            <div className="text-center mb-10">
              <SectionHeading eyebrow="What people are saying" title="From the community" />
            </div>
            <div className="space-y-3 mb-3">
              {posts.map((p) => (
                <PostPreview key={p.id} post={p} />
              ))}
            </div>
            <InlineBetaCapture
              source="discover_posts"
              heading="Join to see more"
              body="Get an invite to the beta — the full feed, events, and your local circle. No spam, just an invite when a spot opens."
            />
          </div>
        </section>
      )}

      {/* ── FAQ ───────────────────────────────────────────────── */}
      <section className="bg-surface px-6 py-16 border-t border-border/60">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-10">
            <SectionHeading eyebrow="Good to know" title="Frequently asked" />
          </div>
          <dl className="space-y-6">
            {DISCOVER_FAQS.map((item) => (
              <div key={item.q} className="rounded-2xl border border-border bg-marketing-canvas p-5 transition-shadow hover:shadow-pop">
                <dt className="text-base font-semibold text-text mb-1.5">{item.q}</dt>
                <dd className="text-sm text-muted leading-relaxed">{item.a}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ── Final CTA ─────────────────────────────────────────── */}
      <BetaCTA
        heading="Ready to find your people?"
        body="Frequency is free to join. Sign up, find a circle near you, and start showing up this week."
      />
    </>
  )
}
