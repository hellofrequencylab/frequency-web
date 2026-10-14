import Link from 'next/link'
import '@/app/themes/active/members-a'
import '@/app/themes/active/members-b'
import { Composer } from '@/components/feed/composer'
import { getCircleContext } from '@/lib/circles/active-circle'
import { ARRIVAL_NAMES_SHOWN, ARRIVAL_WINDOW_DAYS, arrivalNames, newArrivals } from '@/lib/circles/arrivals'
import { getMyDispatchScopes } from '@/lib/feed/my-dispatch-scopes'
import { loadFeedPage } from '@/lib/feed/feed-page'
import { viewerHidesDemo } from '@/lib/demo-preference'
import { isoDaysAgo } from '@/lib/utils'
import { PostItem } from '@/components/frequency/members/feed/posts'
import { FqAvatar } from '@/components/frequency/members/shared/avatar'

// THE CIRCLE'S POSTS TAB IN THE KIT (templates/members/Circle.html, the Posts pane: rows between
// hairlines, avatar, name and time, the body, photos, then High five and replies). It is the DAWN
// `circle-feed` module's behaviour exactly, read from the same request-scoped circle context:
//   · the newcomer's welcome naming who else is new, or the greeting strip for everyone else
//     (lib/circles/arrivals.ts, arithmetic on the roster the shell loaded);
//   · the real Composer for members, Announce and Dispatch for a manager;
//   · the posts from `scoped_feed_for_viewer` on this Circle (loadFeedPage's scopeId, the same RPC
//     FeedList calls with showPublicLayer off), so a visitor sees only the public posts;
//   · each row drawn by the Member Feed's PostItem, whose reactions, replies, polls and post menu are
//     the live components.
// The empty state says something different to a host, a member and a visitor, as the module does.

export async function FqCircleFeed() {
  const ctx = getCircleContext()
  if (!ctx) return null
  const { circle, members, isMember, isCrew, canManage, myProfileId, justJoined } = ctx

  const since = isoDaysAgo(ARRIVAL_WINDOW_DAYS)
  const arrivals = isMember ? newArrivals(members, since, { excludeProfileId: myProfileId }) : []
  const arrivalTotal = isMember
    ? newArrivals(members, since, { excludeProfileId: myProfileId, limit: Number.MAX_SAFE_INTEGER }).length
    : 0
  const names = arrivalNames(arrivals, Math.max(0, arrivalTotal - ARRIVAL_NAMES_SHOWN))
  const viewerRole = canManage ? 'host' : isCrew ? 'crew' : 'member'

  const [dispatchScopes, loaded, hideDemo] = await Promise.all([
    isMember && canManage ? getMyDispatchScopes() : Promise.resolve([]),
    myProfileId ? loadFeedPage({ profileId: myProfileId, sort: 'recent', scopeId: circle.id }) : Promise.resolve(null),
    viewerHidesDemo(),
  ])
  const rows = loaded && loaded.kind === 'ok' ? loaded.items.filter((p) => !(hideDemo && p.is_demo)) : []
  const pinned = rows.filter((p) => p.is_pinned)
  const rest = rows
    .filter((p) => !p.is_pinned)
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))

  return (
    <section aria-label="Posts">
      {isMember && justJoined && !canManage && (
        <div className="soft stack fqm-gap-sm">
          <span className="h3">Welcome to {circle.name}</span>
          <span className="t2">
            You are in. Say hello below so the Circle knows who just arrived. A quick intro is the easiest way to start
            showing up here.
          </span>
          {names && (
            <span className="t2">
              {names} {arrivalTotal === 1 ? 'is' : 'are'} new here too.
            </span>
          )}
        </div>
      )}
      {isMember && !justJoined && arrivals.length > 0 && (
        <div className="panel row">
          <span className="faces">
            {arrivals.map((a) => (
              <FqAvatar key={a.id} url={a.avatarUrl} name={a.displayName} size="s" />
            ))}
          </span>
          <span className="grow">
            <span className="t1 fqm-block">{names} just joined</span>
            <span className="t2">Say hello below. A new member who gets a reply in their first week usually comes back.</span>
          </span>
        </div>
      )}

      {isMember ? (
        <div className="fa-capture fqm-cl-compose">
          <Composer
            scopeId={circle.id}
            visibility="group"
            placeholder={
              justJoined
                ? `Introduce yourself to ${circle.name}`
                : arrivals.length > 0
                  ? `Welcome ${arrivals[0].displayName} to ${circle.name}`
                  : `Share something with ${circle.name}`
            }
            canAnnounce={canManage}
            dispatchScopes={dispatchScopes}
          />
        </div>
      ) : (
        myProfileId && <p className="why fqm-cl-compose">Join this Circle to post and follow it from your feed.</p>
      )}

      {loaded && loaded.kind === 'error' ? (
        <div className="empty stack">
          <span className="h3">The posts could not load.</span>
          <Link className="btn sm fqm-tag-start" href={`/circles/${circle.slug}`}>
            Try again
          </Link>
        </div>
      ) : rows.length === 0 ? (
        <p className="why fqm-cl-empty">
          {canManage
            ? 'Nothing here yet. A first post from you gives everyone else something to reply to.'
            : isMember
              ? 'No posts yet. Be the first to share something.'
              : myProfileId
                ? 'No posts yet.'
                : 'Sign in to see what this Circle is talking about.'}
        </p>
      ) : (
        <div>
          {[...pinned, ...rest].map((p) => (
            <PostItem
              key={p.id}
              post={p}
              scope={undefined}
              why={null}
              myProfileId={myProfileId!}
              viewerRole={viewerRole}
            />
          ))}
        </div>
      )}
    </section>
  )
}
