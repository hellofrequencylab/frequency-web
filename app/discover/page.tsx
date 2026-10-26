import type { Metadata } from 'next'
import {
  getTopicalChannels,
  getPublicCircles,
  getPublicEvents,
  getPublicPosts,
  getPublicCounts,
  getPublicCityClusters,
} from '@/lib/discover'
import { OG_SITE, ROOT_OG_IMAGES, SITE_NAME } from '@/lib/site'
import { JsonLd } from '@/components/json-ld'
import {
  breadcrumbSchema,
  topicListSchema,
  circleListSchema,
  eventListSchema,
  faqSchema,
} from '@/lib/jsonld'
import { dayInZone, HOME_TZ } from '@/lib/time/zone'
import { FrequencyDiscoverHub } from '@/components/frequency/site/pages/discover/frequency-discover-hub'

// Evergreen Q&A — drives the FAQ section below and its FAQPage schema.
const DISCOVER_FAQS = [
  {
    q: 'What is Frequency?',
    a: 'Frequency connects neighborhoods into real-world community. You join a local Circle of up to 50 people, show up for in-person events near you, and build lasting friendships with people who live close by.',
  },
  {
    q: 'Is Frequency free to join?',
    a: 'Yes. Creating an account, joining a Circle, and RSVPing to events is free.',
  },
  {
    q: 'What is a Circle?',
    a: 'A Circle is a small local group of up to 50 people built around a shared Channel, like Movement, Spirituality, or Creative. Small enough to know everyone, big enough to always have plans.',
  },
  {
    q: 'Do I need an account to browse?',
    a: 'No. You can browse Circles, Channels, and upcoming events without signing up. You only need a free account to join a Circle, RSVP to an event, see exact venue details, or post.',
  },
  {
    q: 'How is my location handled?',
    a: 'Public pages only ever show the city or area, never a precise address. The exact venue for an event is shared with members who RSVP.',
  },
]

export const metadata: Metadata = {
  title: 'Discover the community',
  description:
    'Browse local circles, real-world events, and channels across the Frequency community. Find your people and show up in person.',
  alternates: { canonical: '/discover' },
  openGraph: {
    ...OG_SITE,
    images: ROOT_OG_IMAGES,
    title: `Discover the community · ${SITE_NAME}`,
    description:
      'Browse local circles, real-world events, and channels across the Frequency community.',
    url: '/discover',
  },
  twitter: {
    card: 'summary_large_image',
    title: `Discover the community · ${SITE_NAME}`,
    description:
      'Browse local circles, real-world events, and channels across the Frequency community.',
  },
}

// Revalidate hourly — community content changes often enough to keep fresh,
// rarely enough that we don't need per-request rendering for crawlers.
export const revalidate = 3600

// 🔴 SIX READS FEED THIS PAGE AND FIVE OF THEM MOVE — only `getTopicalChannels()` is fixed, and
// even it feeds a tally counted off `getPublicCircles()`. So the boxes they feed declare themselves
// with `data-visual-mask` (ADR-1277; every site is registered with its reason in
// VISUAL_MASK_SITES, test/e2e/surfaces.ts). LIVE-301: `pr-compare` run 34539497155 failed all
// EIGHT `/discover` baselines — desktop and mobile x dawn-light/dawn-dark/midnight-light/
// midnight-dark — each reporting 991 differing pixels at IDENTICAL dimensions. A pixel count
// proves the sizes matched, and a failure in dark as well as light rules out a colour-token
// change; 991 pixels is content-sized, not layout-sized.
//
// The masked boxes are the hero tally line, the locator's city list, each Channel card's circle
// count, the events list, the circles grid and the posts list. Everything else stays in the
// picture: every SectionHeading and kicker, the body copy, the browse links, the dark Statement
// beat, the ZigZag, the FAQ and the closing CTA, plus BOTH fallbacks (the sub-floor hero line and
// the locator's "We're starting in ..." card) — an empty state is design surface, not a reading.
//
// ⚠️ WHERE THIS REMEDY STOPS. A mask paints a box and moves nothing, so it answers "different
// pixels, same size" and cannot answer "different size" — `toHaveScreenshot` fails a size mismatch
// before it counts a pixel. Every `.length > 0` guard below is exactly that failure waiting to
// happen: the Channels, events, circles and posts sections DROP ENTIRELY when their query returns
// empty, the hero swaps its whole block at SOCIAL_PROOF_FLOOR, the locator swaps map-plus-list for
// a single card when no city clusters plot, and a list that returns three rows instead of four is
// a shorter page. None of that is maskable. See the `/discover` note in test/e2e/surfaces.ts for
// what to read such a failure as.
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
  const liveChannels = channels.filter((ch) => (countByChannel.get(ch.slug) ?? 0) > 0)
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
      <FrequencyDiscoverHub
        counts={counts}
        events={events}
        circles={circles}
        channels={liveChannels.map((channel) => ({ channel, circles: countByChannel.get(channel.slug) ?? 0 }))}
        towns={cityClusters.map((c) => ({ city: c.city, circles: c.circles, events: c.events }))}
        posts={posts}
        faqs={DISCOVER_FAQS}
        today={dayInZone(new Date(), HOME_TZ)}
      />
    </>
  )
}
