import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import {
  getTopicalChannels,
  getPublicCircles,
  getPublicEvents,
  getPublicPosts,
  getPublicCounts,
} from '@/lib/discover'
import {
  ChannelCard,
  CircleCard,
  EventRow,
  PostPreview,
  SignInCta,
  SectionHeading,
} from '@/components/discover/cards'
import { SITE_NAME } from '@/lib/site'

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
  const [channels, circles, events, posts, counts] = await Promise.all([
    getTopicalChannels(),
    getPublicCircles(6),
    getPublicEvents(4),
    getPublicPosts(3),
    getPublicCounts(),
  ])

  // Circle counts per channel for the topic grid.
  const allCircles = await getPublicCircles(200)
  const countByChannel = new Map<string, number>()
  for (const c of allCircles) {
    if (c.channel_slug) countByChannel.set(c.channel_slug, (countByChannel.get(c.channel_slug) ?? 0) + 1)
  }

  return (
    <>
      {/* ── Intro ─────────────────────────────────────────────── */}
      <section className="bg-marketing-canvas px-6 py-16 border-b border-border/60">
        <div className="max-w-5xl mx-auto text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary-strong mb-3">
            Discover Frequency
          </p>
          <h1 className="text-3xl sm:text-5xl font-bold text-text mb-4">
            Real community, near you
          </h1>
          <p className="text-muted leading-relaxed max-w-2xl mx-auto mb-8">
            Explore the circles, events, and topics bringing neighbors together in person.
            Browse freely — sign up free to join a circle, RSVP to an event, or post.
          </p>
          <div className="flex items-center justify-center gap-6 text-sm text-muted">
            <span><strong className="text-text">{counts.members}</strong> members</span>
            <span className="text-border">|</span>
            <span><strong className="text-text">{counts.circles}</strong> circles</span>
            <span className="text-border">|</span>
            <span><strong className="text-text">{events.length}</strong> upcoming events</span>
          </div>
        </div>
      </section>

      {/* ── Topics ────────────────────────────────────────────── */}
      {channels.length > 0 && (
        <section className="bg-surface px-6 py-16">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-10">
              <SectionHeading eyebrow="Explore by topic" title="Topics" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {channels.map((ch) => (
                <ChannelCard key={ch.id} channel={ch} circleCount={countByChannel.get(ch.slug) ?? 0} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Upcoming events ───────────────────────────────────── */}
      {events.length > 0 && (
        <section className="bg-marketing-canvas px-6 py-16">
          <div className="max-w-2xl mx-auto">
            <div className="text-center mb-10">
              <SectionHeading eyebrow="Coming up" title="Upcoming events" tone="success" />
            </div>
            <div className="space-y-3">
              {events.map((e) => (
                <EventRow key={e.id} event={e} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Featured circles ──────────────────────────────────── */}
      {circles.length > 0 && (
        <section className="bg-surface px-6 py-16">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-10">
              <SectionHeading eyebrow="Find your people" title="Circles forming now" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {circles.map((c) => (
                <CircleCard key={c.id} circle={c} />
              ))}
            </div>
          </div>
        </section>
      )}

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
            <SignInCta
              title="Join to see more"
              body="Create a free account to access the full feed, events, and your local circle."
            />
          </div>
        </section>
      )}

      {/* ── Final CTA ─────────────────────────────────────────── */}
      <section className="relative bg-surface px-6 py-20 text-center overflow-hidden">
        <div
          className="absolute inset-0 opacity-20 pointer-events-none"
          style={{
            background:
              'radial-gradient(ellipse 60% 50% at 50% 50%, var(--color-primary-bg) 0%, transparent 70%)',
          }}
        />
        <div className="relative max-w-xl mx-auto">
          <h2 className="text-2xl sm:text-4xl font-bold text-text mb-4">
            Ready to find your people?
          </h2>
          <p className="text-muted mb-8 leading-relaxed text-lg">
            Frequency is free to join. Sign up, find a circle near you, and start showing up
            this week.
          </p>
          <Link
            href="/sign-in"
            className="inline-flex items-center gap-2 rounded-2xl bg-primary text-on-primary px-10 py-4 text-base font-bold hover:bg-primary-hover transition-colors"
          >
            Join Frequency <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>
    </>
  )
}
