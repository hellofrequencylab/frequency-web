import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import {
  getTopicalChannels,
  getPublicCircles,
  getPublicEvents,
  getPublicPosts,
  getPublicCounts,
  getPublicCityClusters,
} from '@/lib/discover'
import { ChannelCard, CircleCard, EventRow, PostPreview } from '@/components/discover/cards'
import {
  Statement,
  ZigZag,
  BetaCTA,
  PhotoHero,
  SectionHeading,
  Button,
  FaqList,
} from '@/components/marketing/marketing-ui'
import { DiscoverLocator } from '@/components/discover/discover-locator'
import { InlineBetaCapture } from '@/components/discover/inline-beta-capture'
import {
  FrequencyArcs,
  RippleRings,
  CircleConstellation,
  OrganicBlob,
} from '@/components/marketing/vector-art'
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
    a: 'A circle is a small local group of up to 50 people centered on a shared topic, like Movement, Spirituality, or Creative practice. Small enough to know everyone, big enough to always have plans.',
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
    title: `Discover the community · ${SITE_NAME}`,
    description:
      'Browse local circles, upcoming real-world events, and topics across the Frequency community.',
    url: '/discover',
  },
}

// Revalidate hourly — community content changes often enough to keep fresh,
// rarely enough that we don't need per-request rendering for crawlers.
export const revalidate = 3600

export default async function DiscoverHubPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const isAuthed = !!user

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
      <PhotoHero
        image="/images/site/PHOTO-2020-09-09-16-38-27.jpeg"
        alt="A large Frequency yoga gathering on a lawn at golden hour in North County San Diego"
        eyebrow="Discover Frequency"
        title="Real community, near you"
        subtitle="Somewhere close to you, your people are already meeting this week. A standing time, a handful of regulars, a seat that gets noticed when it's empty. Browse the circles, events, and topics freely; sign up free to join a circle, RSVP, or post."
      >
        {counts.members >= SOCIAL_PROOF_FLOOR ? (
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-white/80">
            <span><strong className="text-white">{counts.members}</strong> members</span>
            <span className="text-white/30">|</span>
            <span><strong className="text-white">{counts.circles}</strong> circles</span>
            <span className="text-white/30">|</span>
            <span><strong className="text-white">{events.length}</strong> upcoming events</span>
          </div>
        ) : (
          <p className="text-sm text-white/80">
            Forming now in {FOUNDING_PLACE}: explore the first circles, topics, and events below.
          </p>
        )}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <Button href={BETA_CTA_HREF}>
            {BETA_CTA_LABEL} <ArrowRight className="w-4 h-4" />
          </Button>
          <Link href="/sign-in" className="text-sm font-semibold text-white/80 hover:text-white transition-colors">
            or browse free →
          </Link>
        </div>
      </PhotoHero>

      {/* ── Locator map (privacy-safe: city centroids only) ──────── */}
      <section className="relative overflow-hidden bg-surface px-6 py-20 sm:py-24 border-b border-border/60">
        {/* Frequency motif radiating up from the map, tying the discover hero to place. */}
        <FrequencyArcs
          aria-hidden
          className="pointer-events-none absolute -top-10 left-1/2 -translate-x-1/2 w-[40rem] max-w-none text-primary opacity-[0.05]"
        />
        <div className="relative max-w-4xl mx-auto">
          <div className="text-center max-w-2xl mx-auto">
            <SectionHeading
              eyebrow="Where it's happening"
              title="Find your area"
              kicker="Every dot is neighbors already gathering."
            />
            <p className="mt-5 text-lg text-muted leading-relaxed">
              Start with the map. Each marker is a real circle taking root nearby, close
              enough to walk to, small enough to be missed in if you don&apos;t come.
            </p>
          </div>
          {cityClusters.length > 0 ? (
            <DiscoverLocator
              cities={cityClusters}
              circles={allCircles.map((c) => ({
                slug: c.slug,
                name: c.name,
                city: c.city,
                interest: c.channel_name,
                memberCount: c.member_count,
              }))}
              isAuthed={isAuthed}
            />
          ) : (
            <div className="mx-auto max-w-2xl rounded-2xl border border-border bg-marketing-canvas p-8 text-center">
              <p className="mb-1 text-lg font-semibold text-text">We&apos;re starting in {FOUNDING_PLACE}.</p>
              <p className="mb-5 text-sm text-muted leading-relaxed">
                The first circles are forming now. Be one of the first in your neighborhood.
              </p>
              <Button href={BETA_CTA_HREF}>
                {BETA_CTA_LABEL} <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>
      </section>

      {/* ── Topics ────────────────────────────────────────────── */}
      {channels.length > 0 && (
        <section className="relative overflow-hidden bg-marketing-canvas px-6 py-20 sm:py-24">
          {/* A loose constellation of people, the network a topic opens onto. */}
          <CircleConstellation
            aria-hidden
            className="pointer-events-none absolute top-12 right-0 w-72 max-w-none text-primary opacity-[0.06]"
          />
          <div className="relative max-w-4xl mx-auto">
            <div className="text-center max-w-2xl mx-auto">
              <SectionHeading
                eyebrow="Explore by topic"
                title={<>Find what you <span className="text-primary">practice</span></>}
                kicker="The thing you already love is a doorway to a room of people."
              />
              <p className="mt-5 text-lg text-muted leading-relaxed">
                Movement, spirituality, creative practice. Pick the one that&apos;s calling you,
                and on the other side of it is a circle living it near you this week.
              </p>
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
        <section className="bg-surface px-6 py-20 sm:py-24">
          <div className="max-w-3xl mx-auto">
            <div className="text-center max-w-2xl mx-auto">
              <SectionHeading
                eyebrow="Coming up"
                title={<>Show up <span className="text-primary">this week</span></>}
                kicker="These are real plans, on real days, with room for you."
              />
              <p className="mt-5 text-lg text-muted leading-relaxed">
                A sunrise on the bluff, a thermal circuit, a supper table. Pick one, RSVP, and
                you&apos;re expected. The kind of plan that pulls you off the couch and into a room.
              </p>
            </div>
            <div className="mt-9 space-y-3">
              {events.map((e) => (
                <EventRow key={e.id} event={e} isAuthed={isAuthed} />
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
        <section className="relative overflow-hidden bg-marketing-canvas px-6 py-20 sm:py-24">
          {/* Ripple rings: a circle widening out, the core motif for this beat. */}
          <RippleRings
            aria-hidden
            className="pointer-events-none absolute -bottom-16 -left-16 w-96 max-w-none text-primary opacity-[0.06]"
          />
          <div className="relative max-w-4xl mx-auto">
            <div className="text-center max-w-2xl mx-auto">
              <SectionHeading
                eyebrow="Find your people"
                title={<>Circles forming <span className="text-primary">now</span></>}
                kicker="Up to fifty neighbors, small enough to know everyone."
              />
              <p className="mt-5 text-lg text-muted leading-relaxed">
                Each one started with a few people, a standing time, and someone willing to say
                see you next week. Find one that sounds like your people, or a reason to start your own.
              </p>
            </div>
            <div className="mt-9 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {circles.map((c) => (
                <CircleCard key={c.id} circle={c} isAuthed={isAuthed} />
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
          themselves when they belong to a community that knows them. Not an audience. A few
          faces that light up when you walk in.
        </p>
        <p>
          Every circle and every event here is an invitation to be seen. To trade the scroll
          for a real morning on the grass, beside neighbors who notice the week you go quiet
          and text to ask if you&apos;re alright.
        </p>
        <p>
          That is the relief waiting on the other side of a browse: somewhere physical to
          belong, close enough to walk to, with people who keep a seat warm for you.
        </p>
      </ZigZag>

      {/* ── Feed preview ──────────────────────────────────────── */}
      {posts.length > 0 && (
        <section className="bg-marketing-canvas px-6 py-20 sm:py-24">
          <div className="max-w-3xl mx-auto">
            <div className="text-center">
              <SectionHeading eyebrow="What people are saying" title="From the community" />
            </div>
            <div className="space-y-3 mb-3">
              {posts.map((p) => (
                <PostPreview key={p.id} post={p} isAuthed={isAuthed} />
              ))}
            </div>
            <InlineBetaCapture
              source="discover_posts"
              heading="Join to see more"
              body="Get an invite to the beta: the full feed, events, and your local circle. No spam, just an invite when a spot opens."
            />
          </div>
        </section>
      )}

      {/* ── FAQ ───────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-surface px-6 py-20 sm:py-24 border-t border-border/60">
        {/* A soft warm blob behind the FAQ, easing the page toward the closing CTA. */}
        <OrganicBlob
          aria-hidden
          className="pointer-events-none absolute -bottom-28 -right-20 w-[34rem] max-w-none text-primary opacity-[0.04]"
        />
        <div className="relative max-w-3xl mx-auto">
          <div className="text-center">
            <SectionHeading eyebrow="Good to know" title="Frequently asked" />
          </div>
          <FaqList items={DISCOVER_FAQS.map((f) => ({ q: f.q, a: f.a }))} />
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
