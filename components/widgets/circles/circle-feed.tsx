import { Suspense } from 'react'
import { Sparkles } from 'lucide-react'
import { TeaserGate } from '@/components/teaser-gate'
import { teaserAllowed, TEASER_PREVIEW_SECONDS } from '@/lib/teaser'
import { Composer } from '@/components/feed/composer'
import { FeedList } from '@/components/feed/feed-list'
import { getCircleContext } from '@/lib/circles/active-circle'

export const CircleFeed = async () => {
  const ctx = getCircleContext()
  if (!ctx) return null
  const { circle, isMember, isCrew, canManage, myProfileId, justJoined } = ctx

  return (
    <TeaserGate
      allowed={teaserAllowed({ role: isCrew ? 'crew' : 'member', hasAccess: isMember })}
      resourceKey={`circle:${circle.id}`}
      previewSeconds={TEASER_PREVIEW_SECONDS}
      title="Crew unlocks the full circle"
      body="Take a look around. Crew members can post, join the conversation, and connect with everyone here."
    >
      <section>
        <div className="mb-4">
          <h2 className="text-sm font-bold text-text">Circle feed</h2>
          <p className="mt-0.5 text-xs leading-relaxed text-muted">
            {canManage
              ? 'Post to your circle. Toggle Announce to broadcast to the wider hub.'
              : 'Conversation and event announcements for everyone in this circle.'}
          </p>
        </div>
        {isMember && justJoined && !canManage && (
          <div className="mb-4 flex items-start gap-3 rounded-2xl border border-primary/30 bg-primary/5 px-4 py-3">
            <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div>
              <p className="text-sm font-semibold text-text">Welcome to {circle.name}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted">
                You&rsquo;re in. Say hello below so the circle knows who just arrived. A quick intro is
                the easiest way to start showing up here.
              </p>
            </div>
          </div>
        )}
        {isMember ? (
          <Composer scopeId={circle.id} visibility="group" placeholder={justJoined ? `Introduce yourself to ${circle.name}…` : `Share something with ${circle.name}…`} canAnnounce={canManage} />
        ) : (
          myProfileId && (
            <div className="mb-4 rounded-2xl border border-dashed border-border bg-surface/60 px-4 py-3">
              <p className="text-xs leading-relaxed text-muted">Join this circle to post and follow it from your feed.</p>
            </div>
          )
        )}
        <Suspense fallback={null}>
          <FeedList circleIds={[circle.id]} showPublicLayer={false} myProfileId={myProfileId} viewerRole={canManage ? 'host' : isCrew ? 'crew' : 'member'} emptyMessage="No posts yet. Be the first to share something." />
        </Suspense>
      </section>
    </TeaserGate>
  )
}
