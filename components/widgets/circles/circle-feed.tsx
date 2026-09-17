import { Suspense } from 'react'
import { Sparkles, HandHeart } from 'lucide-react'
import { TeaserGate } from '@/components/teaser-gate'
import { teaserAllowed, TEASER_PREVIEW_SECONDS } from '@/lib/teaser'
import { Composer } from '@/components/feed/composer'
import { FeedList } from '@/components/feed/feed-list'
import { Avatar } from '@/components/ui/avatar'
import { getCircleContext } from '@/lib/circles/active-circle'
import { isoDaysAgo } from '@/lib/utils'
import {
  ARRIVAL_NAMES_SHOWN,
  ARRIVAL_WINDOW_DAYS,
  arrivalNames,
  newArrivals,
} from '@/lib/circles/arrivals'

// The circle's conversation: the composer (members) and the post stream.
//
// ── THE GREETING STRIP (ADR-1393) ───────────────────────────────────────────────────────────────
//
// A Circle already asked a NEW member to introduce themselves. Nothing asked anyone ELSE to notice,
// so an introduction landed in a room where nobody had been given a reason to look, and the most
// common outcome of a first post was no reply. That is the failure mode the retention research
// names: the lift comes from the welcome being received, not from the newcomer being told to post.
//
// So the same fact renders two ways, and never both at once:
//   • TO A NEWCOMER (`justJoined`, their first 7 days) — the welcome panel, now naming who else is
//     new, so their first post has an obvious audience instead of a silent room.
//   • TO EVERYONE ELSE ON THE ROSTER — a quiet strip naming who to greet. Saying hello is the
//     lowest-friction contribution a member can make, and asking for it by name is what turns a
//     roster number into a person.
//
// IT COSTS NO READ. Every field comes off the `members` rows the shell already loaded for the
// roster, so this is arithmetic on data the page had (lib/circles/arrivals.ts, pure + unit-tested).
//
// IT HIDES WHEN IT HAS NOTHING, which on a quiet Circle is most weeks. A strip that renders "nobody
// new" every week teaches the eye to skip the place the real greeting will eventually appear.
//
// 🔴 A MANAGER GETS THE GREETING STRIP TOO, and that is the one arm worth stating: the old welcome
// panel was gated `!canManage` because a host does not need to be told to introduce themselves. But
// greeting a newcomer is the host's job more than anyone's, so the strip has no manager carve.

export const CircleFeed = async () => {
  const ctx = getCircleContext()
  if (!ctx) return null
  const { circle, members, isMember, isCrew, canManage, myProfileId, justJoined } = ctx

  // One clock, one window, one exclusion: never tell someone to greet themselves.
  const since = isoDaysAgo(ARRIVAL_WINDOW_DAYS)
  const arrivals = isMember
    ? newArrivals(members, since, { excludeProfileId: myProfileId })
    : []
  // How many more there are beyond the ones we name, for "and 4 others".
  const arrivalTotal = isMember
    ? newArrivals(members, since, { excludeProfileId: myProfileId, limit: Number.MAX_SAFE_INTEGER })
        .length
    : 0
  const extra = Math.max(0, arrivalTotal - ARRIVAL_NAMES_SHOWN)
  const names = arrivalNames(arrivals, extra)

  return (
    <TeaserGate
      allowed={teaserAllowed({ role: isCrew ? 'crew' : 'member', hasAccess: isMember })}
      resourceKey={`circle:${circle.id}`}
      previewSeconds={TEASER_PREVIEW_SECONDS}
      title="Crew gets the full circle"
      body="Take a look around. Crew members can post, join the conversation, and connect with everyone here."
    >
      <section>
        <div className="mb-4">
          <h2 className="text-body-sm font-bold text-text">Circle feed</h2>
          <p className="mt-0.5 text-meta leading-relaxed text-muted">
            {canManage
              ? 'Post to your circle. Toggle Announce to send it to the wider Hub.'
              : 'Conversation and event announcements for everyone in this circle.'}
          </p>
        </div>

        {/* A. THE NEWCOMER'S OWN WELCOME. Still `!canManage`: a host does not introduce themselves
               to a Circle they run. Now it names who else is new, so the intro has an audience. */}
        {isMember && justJoined && !canManage && (
          <div className="mb-4 flex items-start gap-3 rounded-2xl border border-primary/30 bg-primary/5 px-4 py-3">
            <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
            <div className="min-w-0">
              <p className="text-body-sm font-semibold text-text">Welcome to {circle.name}</p>
              <p className="mt-0.5 text-meta leading-relaxed text-muted">
                You&rsquo;re in. Say hello below so the circle knows who just arrived. A quick intro is
                the easiest way to start showing up here.
              </p>
              {names && (
                <p className="mt-1.5 text-meta leading-relaxed text-muted">
                  {names} {arrivalTotal === 1 ? 'is' : 'are'} new here too.
                </p>
              )}
            </div>
          </div>
        )}

        {/* B. THE GREETING STRIP, for members who are already settled. Never alongside A: a
               newcomer has just been handed the same names in their own panel. */}
        {isMember && !justJoined && arrivals.length > 0 && (
          <div className="mb-4 flex items-center gap-3 rounded-2xl border border-border bg-surface-elevated/60 px-4 py-3">
            <span className="flex shrink-0 -space-x-2">
              {arrivals.map((a) => (
                <Avatar
                  key={a.id}
                  src={a.avatarUrl}
                  name={a.displayName}
                  size="sm"
                  className="ring-2 ring-surface"
                />
              ))}
            </span>
            <div className="min-w-0">
              <p className="text-body-sm font-semibold text-text">
                <HandHeart className="mr-1.5 inline h-4 w-4 text-primary-strong" aria-hidden />
                {names} just joined
              </p>
              <p className="mt-0.5 text-meta leading-relaxed text-muted">
                Say hello below. A new member who gets a reply in their first week usually comes back.
              </p>
            </div>
          </div>
        )}

        {isMember ? (
          <Composer
            scopeId={circle.id}
            visibility="group"
            placeholder={
              justJoined
                ? `Introduce yourself to ${circle.name}…`
                : arrivals.length > 0
                  ? `Welcome ${arrivals[0].displayName} to ${circle.name}…`
                  : `Share something with ${circle.name}…`
            }
            canAnnounce={canManage}
          />
        ) : (
          myProfileId && (
            <div className="mb-4 rounded-2xl border border-dashed border-border bg-surface/60 px-4 py-3">
              <p className="text-meta leading-relaxed text-muted">
                Join this circle to post and follow it from your feed.
              </p>
            </div>
          )
        )}

        <Suspense fallback={null}>
          {/* The empty feed says something DIFFERENT to each viewer, because "no posts yet" is a
              to-do for a host, an invitation for a member, and a fact for everyone else. The old
              copy ("Be the first to share something") was addressed to a member and shown to all
              three, including visitors who cannot post at all. */}
          <FeedList
            circleIds={[circle.id]}
            showPublicLayer={false}
            myProfileId={myProfileId}
            viewerRole={canManage ? 'host' : isCrew ? 'crew' : 'member'}
            emptyMessage={
              canManage
                ? 'Nothing here yet. A first post from you gives everyone else something to reply to.'
                : isMember
                  ? 'No posts yet. Be the first to share something.'
                  : 'No posts yet.'
            }
            retryHref={`/circles/${circle.slug}`}
          />
        </Suspense>
      </section>
    </TeaserGate>
  )
}
