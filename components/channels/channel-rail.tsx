import { Suspense } from 'react'
import Link from 'next/link'
import { Users, Circle as CircleIcon, MessageSquare, Hash } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { ModuleCard } from '@/components/modules/module-card'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'
import { StatCard } from '@/components/ui/stat-card'
import { Skeleton } from '@/components/ui/skeleton'
import { UpcomingEventsWidget } from '@/components/events/upcoming-widget'
import { loadChannelHomeStats } from '@/app/(main)/channels/[id]/manage/load'
import { GroupCard, type GroupCardData } from './group-card'
import {
  channelPulseTiles,
  channelRailModules,
  isChannelPulseQuiet,
  type ChannelTab,
} from './rail-plan'

// ─────────────────────────────────────────────────────────────────────────────
// THE CHANNEL SCOPE RAIL (owner request, 2026-07-28: "Give it a right column for activity,
// upcoming event, associated circles").
//
// This is an IN-BODY column, not the shell rail, and it renders BESIDE the global community
// rail, not instead of it. (For a few hours on 2026-07-28 the route was 'scoped' and the member
// rail was suppressed here; the owner reversed that the same night: "You dropped the right rail
// of the website." The 2026-06-20 rule that the right rail shows on every page is universal
// again.) What this column fixes is unchanged: the old page left the Channel's own facts
// nowhere. See docs/PAGE-FRAMEWORK.md §3 Template C ("rail: program, circles-in-topic, events")
// and §6, which already specified this shape.
//
// THREE MODULES, in order:
//   1. Activity  — the Channel's pulse (tuned in · Circles · forum posts · open-room traffic),
//                  read through the SAME loader the /manage console uses (loadChannelHomeStats).
//   2. Upcoming  — Events across the Circles practicing this Channel, via the shared
//                  UpcomingEventsWidget (public + published only, hardened separately).
//   3. Circles   — the Circles (or Chapters) practicing here, with the start CTA.
//
// EMPTY IS THE NORMAL STATE. A brand-new Channel has one member, one Circle, no posts, and
// nothing on any calendar. Every module is designed for that first: the pulse shows real zeros
// plus one orienting line, Upcoming says what will appear here, and the directory offers the one
// next step. Nothing spins forever and nothing vanishes into a hole.
//
// SPEED IS STRUCTURAL (PAGE-FRAMEWORK §5.2/§5.3): the two modules that read the database sit
// behind their OWN <Suspense> with dimension-matched skeletons, so the rail paints with the
// shell. The directory module needs no boundary: it renders the Circles the page already loaded.
// ─────────────────────────────────────────────────────────────────────────────

const PULSE_ICON: Record<'users' | 'circle' | 'message' | 'hash', LucideIcon> = {
  users: Users,
  circle: CircleIcon,
  message: MessageSquare,
  hash: Hash,
}

export interface ChannelRailProps {
  /** Which tab the body is showing; the rail drops the directory module on the directory tab. */
  tab: ChannelTab
  channelId: string
  channelName: string
  /** 'Circle' / 'Circles', or 'Chapter' / 'Chapters' on a Program Channel. */
  groupNoun: string
  groupNounPlural: string
  /** The Circles/Chapters practicing here, already loaded by the page (no second read). */
  groups: GroupCardData[]
  /** The exact total, which can exceed `groups.length` (the page caps the list it loads). */
  groupCount: number
  /** The directory tab, for the module's drill-down. */
  groupsHref: string
  /** The "Start a Circle" / "Start a Chapter" control, when the viewer can be offered one. */
  startGroupCta?: React.ReactNode
}

export function ChannelRail(props: ChannelRailProps) {
  const modules = channelRailModules(props.tab)
  return (
    <div className="space-y-8">
      {modules.map((id) =>
        id === 'activity' ? (
          <ChannelActivityModule key={id} {...props} />
        ) : id === 'upcoming' ? (
          <ChannelUpcomingModule key={id} {...props} />
        ) : (
          <ChannelGroupsModule key={id} {...props} />
        ),
      )}
    </div>
  )
}

// ── 1. Activity ──────────────────────────────────────────────────────────────

function ChannelActivityModule({ channelId, groupNounPlural }: ChannelRailProps) {
  return (
    <ModuleCard title="Activity">
      <Suspense fallback={<PulseSkeleton />}>
        <ChannelPulse channelId={channelId} groupNounPlural={groupNounPlural} />
      </Suspense>
    </ModuleCard>
  )
}

async function ChannelPulse({
  channelId,
  groupNounPlural,
}: {
  channelId: string
  groupNounPlural: string
}) {
  // The SAME read the Channel Manage console's stat strip uses (ADR-870), so the member-facing
  // pulse and the operator console can never disagree about this Channel's numbers.
  const stats = await loadChannelHomeStats(channelId)
  const tiles = channelPulseTiles(stats, groupNounPlural)

  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        {tiles.map((t) => (
          <StatCard key={t.key} size="xs" label={t.label} value={t.value} icon={PULSE_ICON[t.icon]} />
        ))}
      </div>
      {isChannelPulseQuiet(stats) && (
        <p className="mt-2 px-1 text-xs leading-relaxed text-subtle">
          No forum posts or room messages yet. Both show up in these numbers.
        </p>
      )}
    </>
  )
}

/** Dimension-matched placeholder for the pulse grid (PAGE-FRAMEWORK §5.4): the same two-column
 *  rhythm and tile height, so the rail does not shift when the counts arrive. */
function PulseSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-2" aria-hidden>
      {Array.from({ length: 4 }, (_, i) => (
        <Skeleton key={i} className="h-12 rounded-xl" />
      ))}
    </div>
  )
}

// ── 2. Upcoming ──────────────────────────────────────────────────────────────

function ChannelUpcomingModule({ channelName, groups, groupNounPlural }: ChannelRailProps) {
  return (
    <Suspense fallback={<UpcomingSkeleton />}>
      <ChannelUpcoming
        scopeIds={groups.map((g) => g.id)}
        channelName={channelName}
        groupNounPlural={groupNounPlural}
      />
    </Suspense>
  )
}

function ChannelUpcoming({
  scopeIds,
  channelName,
  groupNounPlural,
}: {
  scopeIds: string[]
  channelName: string
  groupNounPlural: string
}) {
  // UpcomingEventsWidget is built to be droppable anywhere, so it renders NOTHING when there is
  // nothing coming up. In a rail a module that vanishes reads as a hole, so a quiet fallback sits
  // beside it and is revealed by CSS only when the widget produced no element at all
  // (`:not(:only-child)` hides the fallback the moment the widget's <section> is there). Same
  // idiom as components/entity-blocks/owner-block-frame.tsx. Both branches live inside this one
  // component, which is itself behind the module's <Suspense>, so the widget resolves before
  // either paints and the fallback can never flash.
  return (
    <div>
      <div className="[&:not(:only-child)]:hidden">
        {/* Matches the widget's own heading exactly (the house SectionHeader, drill-down and
            all), so the empty and populated states of this module read as the same module. */}
        <SectionHeader title="Upcoming" href="/events" />
        <p className="px-1 text-sm leading-relaxed text-muted">
          {scopeIds.length === 0
            ? `Nothing scheduled. Once a Circle practices ${channelName}, its Events show up here.`
            : `Nothing scheduled. Events from the ${groupNounPlural} practicing ${channelName} show up here.`}
        </p>
      </div>
      <UpcomingEventsWidget scopeIds={scopeIds} />
    </div>
  )
}

/** Dimension-matched placeholder: the widget's SectionHeader row (text-sm heading, mb-3)
 *  plus one event row. */
function UpcomingSkeleton() {
  return (
    <div aria-hidden>
      <Skeleton className="mb-3 h-5 w-24" />
      <Skeleton className="h-16 rounded-xl" />
    </div>
  )
}

// ── 3. Circles / Chapters practicing this Channel ────────────────────────────

function ChannelGroupsModule({
  channelName,
  groupNoun,
  groupNounPlural,
  groups,
  groupCount,
  groupsHref,
  startGroupCta,
}: ChannelRailProps) {
  // `groupNoun` distinguishes a Program's Chapters from ordinary Circles in the empty copy.
  const shown = groups.slice(0, 5)
  return (
    <section>
      <SectionHeader title={groupNounPlural} count={groupCount} href={groupsHref} />
      {shown.length === 0 ? (
        <EmptyState
          icon={CircleIcon}
          title={`No ${groupNounPlural} yet`}
          description={
            groupNoun === 'Chapter'
              ? `Start the first Chapter of ${channelName} where you live.`
              : `Start the first ${channelName} Circle where you live. You are its Host.`
          }
          action={startGroupCta}
        />
      ) : (
        <>
          <div className="space-y-2">
            {shown.map((g) => (
              <GroupCard key={g.id} group={g} />
            ))}
          </div>
          {/* No start CTA here: the header already carries "Start a {groupNoun}" two inches
              above. The CTA appears in this module only when the directory is empty, where it
              is the one next step and nothing else on screen offers it. */}
          {groupCount > shown.length && (
            <Link
              href={groupsHref}
              className="mt-2 inline-block px-1 text-xs font-medium text-primary-strong hover:underline"
            >
              See all {groupCount} {groupNounPlural} →
            </Link>
          )}
        </>
      )}
    </section>
  )
}
