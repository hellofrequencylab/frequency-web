'use client'

import Link from 'next/link'
import { Zap, Gem, Flame } from 'lucide-react'
import { RANK_LABELS, seasonRankStyle, type SeasonRank } from '@/lib/season-ranks'
import { useFeedAtBottom } from './use-feed-at-bottom'

// The player's gamification HUD, docked to the bottom of the right rail.
//
//  - Resting: a compact summary bar pinned to the bottom (same height as the
//    left-nav profile card). The scrolling rail content reserves space for it,
//    so it never overlaps.
//  - When the feed scroll reaches the bottom, the detailed stat tiles rise up
//    from the bottom (in sync with the left profile box).

export function GameStatsDockClient({
  zaps,
  gems,
  streak,
  rank,
}: {
  zaps: number
  gems: number
  streak: number
  rank: SeasonRank | null
}) {
  const expanded = useFeedAtBottom()

  return (
    <div className="sticky bottom-0 z-10 border-t border-border bg-canvas">
      {/* Extra stats — rise up from the bottom when the feed hits the end. */}
      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-out ${
          expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        }`}
      >
        <div className="overflow-hidden">
          <div className="grid grid-cols-3 gap-2 px-3 pt-3">
            <div className="rounded-xl bg-surface-elevated px-2 py-2.5 text-center">
              <Zap className="w-4 h-4 text-primary fill-current mx-auto mb-1" />
              <div className="text-sm font-bold text-text tabular-nums leading-none">{zaps.toLocaleString()}</div>
              <div className="text-[11px] text-subtle mt-1">Zaps</div>
            </div>
            <div className="rounded-xl bg-surface-elevated px-2 py-2.5 text-center">
              <Gem className="w-4 h-4 text-signal mx-auto mb-1" />
              <div className="text-sm font-bold text-text tabular-nums leading-none">{gems.toLocaleString()}</div>
              <div className="text-[11px] text-subtle mt-1">Gems</div>
            </div>
            <div className="rounded-xl bg-surface-elevated px-2 py-2.5 text-center">
              <Flame className={`w-4 h-4 mx-auto mb-1 ${streak > 0 ? 'text-primary' : 'text-subtle'}`} />
              <div className="text-sm font-bold text-text tabular-nums leading-none">{streak}w</div>
              <div className="text-[11px] text-subtle mt-1">Streak</div>
            </div>
          </div>
        </div>
      </div>

      {/* Compact summary bar — matched in height to the left-nav profile card. */}
      <Link
        href="/crew"
        className="group flex items-center gap-2.5 px-3 py-3.5 hover:bg-surface-elevated transition-colors"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary-bg">
          <Zap className="w-5 h-5 text-primary fill-current" />
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-semibold text-text leading-tight">Your stats</p>
            {rank && (
              <span className="rank-badge text-[10px] leading-tight" style={seasonRankStyle(rank)}>
                {RANK_LABELS[rank] ?? rank}
              </span>
            )}
          </div>
          <p className="mt-1 flex items-center gap-2.5 text-xs text-subtle tabular-nums">
            <span className="inline-flex items-center gap-0.5"><Zap className="w-3 h-3 text-primary" />{zaps.toLocaleString()}</span>
            <span className="inline-flex items-center gap-0.5"><Gem className="w-3 h-3 text-signal" />{gems.toLocaleString()}</span>
            <span className="inline-flex items-center gap-0.5"><Flame className="w-3 h-3 text-primary" />{streak}w</span>
          </p>
        </div>
        <span className="text-xs font-semibold text-primary-strong opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          Open →
        </span>
      </Link>
    </div>
  )
}
