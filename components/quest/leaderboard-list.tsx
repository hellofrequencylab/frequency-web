import Link from 'next/link'
import Image from 'next/image'
import { Zap, Flame } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { getRankDef, seasonRankStyle, type SeasonRank } from '@/lib/season-ranks'
import { getInitials } from '@/lib/utils'

// LeaderboardList — the responsive, mobile-first board that replaces the old fixed
// six-column grid (grid-cols-[2.5rem_1fr_5rem_4rem_4rem_5rem]) that broke on phones.
//
// Cooperative-first rules baked in:
//  - This board is SECONDARY to the collective goal, and scoped LOCAL by default
//    (your Circle), so a member is measured among people they actually know, not
//    buried under every veteran in the world (Festinger 1954, social comparison).
//  - One row = avatar + name + the ONE metric that matters for the active track +
//    the rank badge. No dense stat grid to truncate names into oblivion.
//  - Each row is a real list item, >= 44px tall (thumb target), name never clipped
//    to nothing (it wraps to two lines on the tightest screens).
//  - Zero dark patterns: no medals/podium theatrics, no shame styling for low
//    ranks. The position number is quiet. "You" is highlighted warmly, never to
//    say you are behind.

export type LeaderboardTrack = 'zaps' | 'consistency'

export interface LeaderboardListEntry {
  id: string
  displayName: string
  handle: string
  avatarUrl: string | null
  seasonRank: SeasonRank
  /** Season Zaps — the metric for the 'zaps' track. */
  seasonZaps: number
  /** Current daily practice streak — the metric for the 'consistency' track. */
  streak: number
}

const TRACK: Record<
  LeaderboardTrack,
  { icon: LucideIcon; iconCls: string; metric: (e: LeaderboardListEntry) => number; unit: (n: number) => string }
> = {
  zaps: {
    icon: Zap,
    iconCls: 'text-primary',
    metric: (e) => e.seasonZaps,
    unit: () => 'Zaps',
  },
  consistency: {
    icon: Flame,
    iconCls: 'text-primary-strong',
    metric: (e) => e.streak,
    unit: (n) => (n === 1 ? 'day' : 'days'),
  },
}

export function LeaderboardList({
  entries,
  track,
  selfId,
}: {
  entries: LeaderboardListEntry[]
  /** Which single metric each row leads with. */
  track: LeaderboardTrack
  /** The viewer, highlighted in place (warmly, never as "behind"). */
  selfId: string
}) {
  const t = TRACK[track]
  const Icon = t.icon

  return (
    <ol className="space-y-1.5">
      {entries.map((entry, i) => {
        const isSelf = entry.id === selfId
        const rankDef = getRankDef(entry.seasonRank)
        const value = t.metric(entry)
        const position = i + 1

        return (
          <li key={entry.id}>
            <Link
              href={`/people/${entry.handle}`}
              className={`flex min-h-[3.25rem] items-center gap-3 rounded-2xl px-3 py-2 transition-colors motion-reduce:transition-none ${
                isSelf
                  ? 'bg-primary-bg/60 dark:bg-primary-bg'
                  : 'bg-surface-elevated/40 hover:bg-surface-elevated'
              }`}
            >
              {/* Position — quiet by design. Not a podium; just where the row sits. */}
              <span className="w-6 shrink-0 text-center text-sm font-semibold tabular-nums text-subtle">
                {position}
              </span>

              {/* Avatar */}
              {entry.avatarUrl ? (
                <Image
                  src={entry.avatarUrl}
                  alt=""
                  width={36}
                  height={36}
                  className="h-9 w-9 shrink-0 rounded-full object-cover"
                />
              ) : (
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-bg text-xs font-bold text-primary-strong"
                  aria-hidden
                >
                  {getInitials(entry.displayName)}
                </span>
              )}

              {/* Name — wraps rather than truncating into oblivion; the rank badge
                  rides beneath it so identity reads on one stacked block. */}
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className={`text-sm leading-tight ${isSelf ? 'font-bold text-primary-strong' : 'font-semibold text-text'}`}>
                  {entry.displayName}
                  {isSelf && <span className="ml-1.5 text-xs font-medium text-primary-strong">you</span>}
                </span>
                <span className="rank-badge w-fit text-2xs" style={seasonRankStyle(rankDef.rank)}>
                  {rankDef.label}
                </span>
              </span>

              {/* The ONE metric for the active track — the only number per row. */}
              <span className="flex shrink-0 items-center gap-1.5 text-right">
                <Icon className={`h-4 w-4 shrink-0 ${t.iconCls}`} aria-hidden />
                <span className="text-sm font-bold tabular-nums text-text">
                  {value.toLocaleString()}
                </span>
                <span className="hidden text-xs font-medium text-muted sm:inline">{t.unit(value)}</span>
              </span>
            </Link>
          </li>
        )
      })}
    </ol>
  )
}
