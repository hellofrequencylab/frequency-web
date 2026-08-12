import Link from 'next/link'
import Image from 'next/image'
import { Zap, Flame, Activity } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { getRankDef, type SeasonRank } from '@/lib/season-ranks'
import { getInitials } from '@/lib/utils'
import { avatarSrc, avatarFocusStyle } from '@/lib/images/avatar-focus'
import { Counter, type CounterTone } from '@/components/ui/counter'
import { RankBadge } from '@/components/ui/rank-badge'
import { Badge, type BadgeTone } from '@/components/ui/badge'
import type { EffortBand } from '@/lib/quest/effort'

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
//  - SELF-RELATIVE MODE (the Circle board, lib/quest/effort.ts). Pass `effort` on an
//    entry and `showPosition={false}`: the row then reads that member against their
//    OWN recent baseline, the season-rank chip gives way to their band, and the
//    position number disappears because the entries are alphabetical and their
//    numbers have different denominators. The ranked crew board is untouched by
//    the defaults.

export type LeaderboardTrack = 'zaps' | 'consistency' | 'effort'

/** How each band is labelled on a row, and how loudly. Only `climbing` and `returning` spend an
 *  accent: nothing here may read as a tier over anybody, so "usual" and "lighter" stay neutral and
 *  the two warmest moments (a better week than usual, and coming back) get the colour. */
export const EFFORT_BAND_CHIP: Record<EffortBand, { label: string; tone: BadgeTone }> = {
  climbing: { label: 'Above usual', tone: 'primary' },
  steady: { label: 'Usual week', tone: 'neutral' },
  easing: { label: 'Lighter week', tone: 'neutral' },
  returning: { label: 'Back this week', tone: 'success' },
  new: { label: 'No usual week yet', tone: 'neutral' },
}

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
  /** Self-relative scoring (lib/quest/effort.ts), on the surfaces that have it. When present it
   *  replaces the season-rank chip with this member's OWN band, because a cross-member status
   *  ladder is exactly what a self-relative board is designed not to be. */
  effort?: {
    band: EffortBand
    /** Percent of their own usual week, or null when they have no usual week yet. */
    index: number | null
    /** Distinct days they showed up in the last 7 — what a row with no baseline shows instead. */
    daysThisWeek: number
  } | null
}

// Tone follows the KIND, in the kit's shared tone vocabulary (DAWN's counter tone law: Zaps and
// streaks both amber, the streak on the deeper step it already used).
const TRACK: Record<
  LeaderboardTrack,
  {
    icon: LucideIcon
    tone: CounterTone
    metric: (e: LeaderboardListEntry) => number
    unit: (n: number, e: LeaderboardListEntry) => string
  }
> = {
  zaps: {
    icon: Zap,
    tone: 'primary',
    metric: (e) => e.seasonZaps,
    unit: () => 'Zaps',
  },
  consistency: {
    icon: Flame,
    tone: 'primary-strong',
    metric: (e) => e.streak,
    unit: (n) => (n === 1 ? 'day' : 'days'),
  },
  // A member with no usual week yet shows the DAYS they showed up instead of a percentage. That is
  // a fact about them that needs no history, so a first-week member gets a real row rather than a
  // blank or a fabricated comparison (lib/quest/effort.ts, "the cold start").
  effort: {
    icon: Activity,
    tone: 'primary',
    metric: (e) => e.effort?.index ?? e.effort?.daysThisWeek ?? 0,
    unit: (n, e) => (e.effort?.index == null ? (n === 1 ? 'day this week' : 'days this week') : '% of usual'),
  },
}

export function LeaderboardList({
  entries,
  track,
  selfId,
  showPosition = true,
}: {
  entries: LeaderboardListEntry[]
  /** Which single metric each row leads with. */
  track: LeaderboardTrack
  /** The viewer, highlighted in place (warmly, never as "behind"). */
  selfId: string
  /** Whether rows carry their position number. FALSE on a self-relative board, where the entries
   *  are alphabetical and their numbers have different denominators, so a position would invent a
   *  ranking out of an order that means nothing. Defaults true, which is the ranked crew board. */
  showPosition?: boolean
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
              className={`flex min-h-[3.25rem] items-center gap-3 rounded-control px-3 py-2 transition-colors motion-reduce:transition-none ${
                isSelf
                  ? 'bg-primary-bg/60 dark:bg-primary-bg'
                  : 'bg-surface-elevated/40 hover:bg-surface-elevated'
              }`}
            >
              {/* Position — quiet by design. Not a podium; just where the row sits. Absent entirely
                  on a self-relative board (showPosition=false), where there is no order to report. */}
              {showPosition && (
                <span className="w-6 shrink-0 text-center text-body-sm font-semibold tabular-nums text-subtle">
                  {position}
                </span>
              )}

              {/* Avatar */}
              {entry.avatarUrl ? (
                <Image
                  src={avatarSrc(entry.avatarUrl)}
                  alt=""
                  width={36}
                  height={36}
                  className="h-9 w-9 shrink-0 rounded-pill object-cover"
                  style={avatarFocusStyle(entry.avatarUrl)}
                />
              ) : (
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-pill bg-primary-bg text-meta font-bold text-primary-strong"
                  aria-hidden
                >
                  {getInitials(entry.displayName)}
                </span>
              )}

              {/* Name — wraps rather than truncating into oblivion; the rank badge
                  rides beneath it so identity reads on one stacked block. */}
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className={`text-body-sm leading-tight ${isSelf ? 'font-bold text-primary-strong' : 'font-semibold text-text'}`}>
                  {entry.displayName}
                  {isSelf && <span className="ml-1.5 text-meta font-medium text-primary-strong">you</span>}
                </span>
                {/* `w-fit` stays: the chip is a child of a `flex-col` block, so without it
                    the pill would stretch the full column width. */}
                {entry.effort ? (
                  <Badge tone={EFFORT_BAND_CHIP[entry.effort.band].tone} className="w-fit">
                    {EFFORT_BAND_CHIP[entry.effort.band].label}
                  </Badge>
                ) : (
                  <RankBadge rank={rankDef.rank} className="w-fit">{rankDef.label}</RankBadge>
                )}
              </span>

              {/* The ONE metric for the active track — the only number per row, and now the kit's
                  Counter rather than three hand-rolled spans. The numeral was tabular but not MONO,
                  which is what stops a column of five scores from shuffling as they change.
                  NOTE: the unit word used to be `hidden sm:inline`. Counter carries its label at
                  every width (at text-2xs, smaller than the text-meta desktop used to get), so a
                  phone now reads "Zaps"/"days" too instead of a bare number. */}
              <span className="shrink-0">
                <Counter value={value} label={t.unit(value, entry)} glyph={Icon} tone={t.tone} />
              </span>
            </Link>
          </li>
        )
      })}
    </ol>
  )
}
