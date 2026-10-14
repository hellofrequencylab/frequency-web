import type { Metadata } from 'next'
import { getPublicEvents, getPublicPosts } from '@/lib/discover'
import { PublicFeed } from '@/components/feed/public-feed'

// The signed-out Feed (owner, 2026-10-14). proxy.ts rewrites a signed-out /feed here, so the address the
// visitor sees stays /feed. Public reads only (the same ones /discover shows), cached like /discover.
// Not for search engines: robots.ts already disallows /feed, and this path is noindex.

export const revalidate = 300

export const metadata: Metadata = {
  title: 'The Feed',
  description: 'What people near you are sharing and where they are meeting next.',
  robots: { index: false, follow: true },
}

export default async function FeedPreviewPage() {
  const [posts, events] = await Promise.all([getPublicPosts(12), getPublicEvents(3)])
  return <PublicFeed posts={posts} events={events} />
}
