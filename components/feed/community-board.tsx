import Link from 'next/link'
import { CalendarDays, MapPin, Users, ArrowRight } from 'lucide-react'
import { ModuleCard } from '@/components/modules/module-card'
import { EmptyState } from '@/components/ui/empty-state'
import { eventDateBadge, formatEventDate, relativeTime } from '@/lib/utils'
import { getCommunityBoard, type CommunityBoard as Board } from '@/lib/feed/community-board'

// THE COMMUNITY BOARD (ADR-1294), IN THE RIGHT RAIL (ADR-1362). The two nouns a member actually
// belongs to: the next gathering in their Circles, and what has been posted in their Spaces.
//
// It led /feed for a day under LIVE-248, with the practice board moved to the rail to make room.
// The owner reversed that: the rail is `hidden lg:flex`, so the practice board — which carries the
// one-tap Start Practice button — was not demoted by the move, it was deleted from every phone.
// This board takes the rail slot instead, which is the panel a desktop-only column can afford.
// The body is unchanged; only its host is. The rail spaces its panels with `space-y-6`, so the
// root sets no bottom margin of its own (components/sidebar/community-panel.tsx is the host).
//
// Composed, not authored: ModuleCard for the group chrome, EmptyState for the nothing-yet case,
// semantic tokens throughout (PAGE-FRAMEWORK §3). The BODY is a pure function of the board so a
// test can render every state without a database; the async wrapper is the only part that reads.

/** One post line: who, where, and the first thing they said. */
function ActivityRow({ post }: { post: Board['activity'][number] }) {
  return (
    <Link
      href={post.spaceSlug ? `/spaces/${post.spaceSlug}` : '/spaces/directory'}
      className="flex items-start gap-3 rounded-lg px-1 py-2 transition-colors hover:bg-surface-elevated"
    >
      <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-pill bg-surface-elevated text-subtle">
        <Users className="h-3.5 w-3.5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-body-sm font-semibold text-text">{post.spaceName}</p>
        <p className="mt-0.5 line-clamp-2 text-body-sm text-muted">{post.body}</p>
        <p className="mt-0.5 text-meta text-subtle">
          {post.authorName ? `${post.authorName} · ` : ''}
          {relativeTime(post.createdAt)}
        </p>
      </div>
    </Link>
  )
}

/** The gathering line: the date chip, the title, and where it is. */
function GatheringRow({ gathering }: { gathering: NonNullable<Board['gathering']> }) {
  const { month, day } = eventDateBadge(gathering.startsAt)
  return (
    <Link
      href={`/events/${gathering.slug}`}
      className="group flex items-center gap-3 rounded-lg px-1 py-2 transition-colors hover:bg-surface-elevated"
    >
      <span className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-lg bg-success-bg text-success">
        <span className="text-3xs font-bold uppercase leading-none">{month}</span>
        <span className="text-body-sm font-bold leading-tight">{day}</span>
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-body-sm font-bold text-text transition-colors group-hover:text-primary-strong">
          {gathering.title}
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-meta text-subtle">
          <span className="tabular-nums">{formatEventDate(gathering.startsAt)}</span>
          {gathering.circleName && (
            <span className="inline-flex items-center gap-0.5">
              <Users className="h-2.5 w-2.5" aria-hidden /> {gathering.circleName}
            </span>
          )}
          {gathering.location && (
            <span className="inline-flex items-center gap-0.5">
              <MapPin className="h-2.5 w-2.5" aria-hidden /> {gathering.location}
            </span>
          )}
        </p>
      </div>
      <ArrowRight className="h-4 w-4 shrink-0 text-subtle transition-transform group-hover:translate-x-0.5" aria-hidden />
    </Link>
  )
}

/**
 * The board's render, pure. `data-community-board` is the handle the source-shape guard and the
 * backlog probe use to say "the first module above the composer is this one"; the populated
 * branch also carries the visual suite's mask, because everything in it is a database reading.
 */
export function CommunityBoardBody({ board }: { board: Board }) {
  const { gathering, activity, circleCount, spaceCount } = board

  // Nothing to show yet: one calm empty state that names the next step rather than two
  // half-empty groups. A member with no Circles is told where to find one; a member who has
  // Circles but a quiet week is told that, and pointed at what is on across the community.
  if (!gathering && activity.length === 0) {
    const belongs = circleCount > 0 || spaceCount > 0
    return (
      // NOT masked, deliberately: an empty state is design surface, not a reading. Same rule
      // the feed stream's empty pane follows (VISUAL_MASK_SITES, `feed-stream`).
      <div data-community-board>
        <EmptyState
          icon={Users}
          title={belongs ? 'Quiet week' : 'Find your people'}
          description={
            belongs
              ? 'Nothing is on in your Circles and your Spaces have been quiet. See what the rest of the community has coming up.'
              : 'Join a Circle and its next gathering shows up right here, with whatever your Spaces are talking about.'
          }
          action={
            <Link
              href={belongs ? '/events' : '/circles'}
              className="inline-flex items-center gap-1.5 rounded-control bg-primary px-4 py-2 text-body-sm font-semibold text-on-primary transition-colors hover:bg-primary-strong"
            >
              {belongs ? 'See what’s on' : 'Find a Circle'}
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          }
        />
      </div>
    )
  }

  return (
    <div data-community-board data-visual-mask="feed-community-board" className="space-y-5">
      {gathering && (
        <ModuleCard title="Next in your Circles">
          <GatheringRow gathering={gathering} />
        </ModuleCard>
      )}
      {activity.length > 0 && (
        <ModuleCard title="In your Spaces">
          <div className="space-y-0.5">
            {activity.map((post) => (
              <ActivityRow key={post.id} post={post} />
            ))}
          </div>
        </ModuleCard>
      )}
      {!gathering && (
        // The gathering half is the one with a next step worth naming, so when it is the empty
        // one the board still says so, in a line rather than a second panel.
        <p className="px-1 text-meta text-subtle">
          <CalendarDays className="mr-1 inline h-3 w-3" aria-hidden />
          Nothing on in your Circles yet. <Link href="/events" className="underline hover:text-text">See what’s on</Link>.
        </p>
      )}
    </div>
  )
}

/**
 * The community board. Its own async Server Component so its host can stream it behind a
 * <Suspense> and nothing waits on these reads (PAGE-FRAMEWORK §5). The rail's own boundary and
 * PanelSkeleton do that today, which is why this file no longer ships a bespoke skeleton.
 */
export async function CommunityBoard({ profileId }: { profileId: string }) {
  return <CommunityBoardBody board={await getCommunityBoard(profileId)} />
}
