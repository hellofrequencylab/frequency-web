'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Zap, Gem, Flame } from 'lucide-react'
import { RANK_LABELS, seasonRankStyle, type SeasonRank } from '@/lib/season-ranks'

// The player's gamification HUD, docked to the bottom of the right rail.
//
// Two states:
//  - Resting: a compact summary bar pinned to the bottom (same height/feel as
//    the left-nav profile card). The scrolling rail content reserves space for
//    it, so it never overlaps.
//  - Expanded: once the rail's top content has scrolled past (the top menu
//    "finishes"), the detailed stat tiles rise up from the bottom. Scrolling
//    back collapses them again.
//
// The expand trigger is a 1px sentinel placed at the end of the scrolling rail
// content; when it leaves the top of the scroll viewport, we expand.

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
  const [expanded, setExpanded] = useState(false)
  const sentinelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => {
        // Expanded only once the sentinel has scrolled ABOVE the top (the top
        // menu is done), not while it's still below the fold.
        setExpanded(!entry.isIntersecting && entry.boundingClientRect.top < 0)
      },
      // Offset by the fixed header height so it triggers at the rail's top edge.
      { rootMargin: '-56px 0px 0px 0px', threshold: 0 },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  return (
    <>
      {/* Sentinel: end of the scrolling rail content. */}
      <div ref={sentinelRef} aria-hidden className="h-px w-full" />

      <div className="sticky bottom-0 z-10 border-t border-border bg-canvas">
        {/* Extra stats — collapsed by default; rise up from the bottom when the
            top menu finishes scrolling (grid-rows 0fr -> 1fr animates height). */}
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

        {/* Compact summary bar — same height/feel as the left-nav profile card. */}
        <Link
          href="/crew"
          className="group flex items-center gap-2.5 px-3 py-3 hover:bg-surface-elevated transition-colors"
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
    </>
  )
}
