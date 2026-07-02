import { Globe2 } from 'lucide-react'
import { AdminSection } from '@/components/templates'
import { feedOpenFlag } from '@/lib/platform-flags'
import { FeedReachToggle } from '@/app/(main)/admin/community/feed-reach-toggle'

// Community layout module (LP7): "Feed reach" — the open-feed switch (platform_flags.feed_open).
// Early in a community's life the reach gate (a member sees public posts plus their own circles'
// and nearby posts) makes the feed look empty; this switch opens it so everyone sees everyone's
// posts. Flip it back once there are enough members. The change is audited. Self-fetching + fail-safe
// (defaults to the reach gate on if the flag read fails); the page owns the gate, so it never re-gates.
export async function CommunityFeedReach() {
  let open = false
  try {
    open = await feedOpenFlag()
  } catch {
    open = false
  }

  return (
    <AdminSection
      title="Feed reach"
      description="Who sees whose posts in the main feed. Open it for a young community so the feed feels alive; turn the reach gate back on once there are enough members for it to feel local."
    >
      <div className="rounded-2xl border border-border bg-surface p-4">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-bg text-primary-strong">
            <Globe2 className="h-4 w-4" aria-hidden />
          </span>
          <div className="min-w-0 space-y-3">
            <div>
              <p className="text-sm font-semibold text-text">Open feed</p>
              <p className="mt-0.5 text-xs leading-snug text-muted">
                On: every member sees every member&rsquo;s posts. Off: a member sees public posts plus their
                own circles&rsquo; and nearby posts (the reach gate). Private posts don&rsquo;t exist, so this never
                exposes anything members didn&rsquo;t share with the community.
              </p>
            </div>
            <FeedReachToggle open={open} />
          </div>
        </div>
      </div>
    </AdminSection>
  )
}
