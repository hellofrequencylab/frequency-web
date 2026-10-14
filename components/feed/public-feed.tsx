// THE FEED PREVIEW (owner, 2026-10-14): what a signed-out visitor reads at /feed. The header's first item
// is Feed for everyone; a visitor gets the community's public posts and the next public events (the same
// public reads /discover already shows, lib/discover.ts), and after 30 seconds the free-membership
// prompt (FeedJoinGate). Served at app/(public)/feed-preview, which proxy.ts rewrites /feed to for a
// signed-out request, so the address stays /feed. Reads no request data: the page stays static.

import { EventRow, PostPreview, SignInCta } from '@/components/discover/cards'
import { StreamTemplate } from '@/components/templates/stream-template'
import { EmptyState } from '@/components/ui/empty-state'
import { FeedJoinGate } from '@/components/feed/feed-join-gate'
import type { PublicEvent, PublicPost } from '@/lib/discover'
import { BETA_CTA_HREF } from '@/lib/site'

export function PublicFeed({ posts, events }: { posts: PublicPost[]; events: PublicEvent[] }) {
  return (
    <>
      <StreamTemplate
        title="The Feed"
        description="What people near you are sharing and where they are meeting next. Join free to post, RSVP and find your Circle."
      >
        {events.length > 0 && (
          <section aria-label="Coming up" className="mb-8 space-y-3">
            {events.map((e) => (
              <EventRow key={e.id} event={e} />
            ))}
          </section>
        )}
        <section aria-label="From the community" className="space-y-3">
          {posts.length > 0 ? (
            posts.map((p) => <PostPreview key={p.id} post={p} />)
          ) : (
            <EmptyState
              title="The Feed is warming up"
              description="Join free to be one of the first voices here."
            />
          )}
        </section>
        <div className="mt-8">
          <SignInCta
            title="See the whole Feed"
            body="Members see every post from their Circles, the people near them, and what is happening this week."
            action="Join free"
            href={BETA_CTA_HREF}
          />
        </div>
      </StreamTemplate>
      <FeedJoinGate />
    </>
  )
}
