'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import {
  Zap, Gem, Flame, ChevronUp, Target, Sparkles, CheckCircle2, ArrowRight, Lock,
} from 'lucide-react'
import { RANK_LABELS, seasonRankStyle, type SeasonRank } from '@/lib/season-ranks'
import { useDockRevealed, useHoverScrollReveal } from './dock-reveal'

// ── Data shape (assembled server-side in right-sidebar.tsx) ───────────────────

export type DockData = {
  zaps: number
  gems: number
  streak: number
  rank: SeasonRank | null
  todaysMove: { kind: 'log' | 'adopt' | 'done' }
  last7: boolean[]
  rankProgress: { nextLabel: string | null; toGo: number; pct: number }
  arc: { chain: string; step: string; pct: number } | null
  vaultGems: number
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-widest text-subtle">{children}</p>
  )
}

export function GameStatsDockClient({ data }: { data: DockData }) {
  const { zaps, gems, streak, rank, todaysMove, last7, rankProgress, arc, vaultGems } = data
  // Mirrors the left profile dock. The bar is sticky-pinned to the bottom of the
  // shared scroll viewport, so at REST it sits at the same height as the left
  // profile dock (not buried at the end of a tall rail). The panel rises on
  // reaching the feed end (shared reveal), on a hover-scroll over the bar, or on tap.
  const [manualOpen, setManualOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const revealed = useDockRevealed()
  const hoverOpen = useHoverScrollReveal(rootRef)
  const open = manualOpen || revealed || hoverOpen

  return (
    <div ref={rootRef} className="sticky bottom-0 z-10 border-t border-border bg-canvas">
      {/* Compact bar — stuck to the bottom; tap to open/close. */}
      <button
        type="button"
        onClick={() => setManualOpen((v) => !v)}
        aria-expanded={open}
        className="group flex w-full items-center gap-2.5 px-3 py-3.5 text-left hover:bg-surface-elevated transition-colors"
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
        <ChevronUp className={`w-4 h-4 text-muted shrink-0 transition-transform duration-300 ${open ? '' : 'rotate-180'}`} />
      </button>

      {/* Expandable panel — grows upward, capped at ~1/3 screen, scrolls inside. */}
      <div
        className={`grid transition-[grid-template-rows] duration-500 ease-out motion-reduce:transition-none ${
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        }`}
      >
        <div className="overflow-hidden">
          <div className="max-h-[50vh] overflow-y-auto px-3 pb-4 pt-1 space-y-4">

            {/* Today's move — North-Star action, no box */}
            {todaysMove.kind === 'done' ? (
              <p className="flex items-center gap-2 text-sm font-medium text-success">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                Practiced today — streak safe
              </p>
            ) : (
              <Link
                href="/practices"
                className="group/move flex items-center gap-2 text-sm font-semibold text-primary-strong hover:text-primary-hover transition-colors"
              >
                <Flame className="w-4 h-4 shrink-0" />
                <span className="flex-1">{todaysMove.kind === 'adopt' ? 'Adopt a practice to start' : 'Log today’s practice'}</span>
                <ArrowRight className="w-3.5 h-3.5 shrink-0 transition-transform group-hover/move:translate-x-0.5" />
              </Link>
            )}

            {/* Streak — subtle 7-day strip */}
            <div className="flex items-center gap-2">
              <SectionLabel>Streak</SectionLabel>
              <div className="flex flex-1 gap-1">
                {last7.map((on, i) => (
                  <div key={i} className={`h-1.5 flex-1 rounded-full ${on ? 'bg-primary' : 'bg-surface-elevated'}`} />
                ))}
              </div>
            </div>

            {/* Rank progress */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <SectionLabel>Rank</SectionLabel>
                <span className="text-[11px] text-subtle">
                  {rankProgress.nextLabel
                    ? `${rankProgress.toGo.toLocaleString()} zaps to ${rankProgress.nextLabel}`
                    : 'Top rank reached'}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-elevated">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${rankProgress.nextLabel ? Math.min(100, Math.max(2, rankProgress.pct)) : 100}%` }}
                />
              </div>
            </div>

            {/* Current arc */}
            {arc && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <SectionLabel>Journey</SectionLabel>
                  <Link href="/journeys" className="text-[11px] font-semibold text-primary-strong hover:text-primary-hover">View →</Link>
                </div>
                <div className="rounded-xl bg-surface-elevated px-3 py-2.5">
                  <div className="flex items-center gap-1.5">
                    <Target className="w-3.5 h-3.5 text-signal-strong shrink-0" />
                    <span className="truncate text-xs font-semibold text-text">{arc.chain}</span>
                  </div>
                  <p className="mt-0.5 mb-1.5 truncate text-[11px] text-subtle">{arc.step}</p>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface">
                    <div className="h-full rounded-full bg-signal-strong" style={{ width: `${Math.min(100, Math.max(2, arc.pct))}%` }} />
                  </div>
                </div>
              </div>
            )}

            {/* The Vault — at the very bottom */}
            <Link
              href="/crew/store"
              className="block rounded-xl border border-primary-bg bg-primary-bg/40 px-3 py-3 hover:bg-primary-bg/60 transition-colors"
            >
              <div className="flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-primary-strong shrink-0" />
                <span className="text-xs font-bold uppercase tracking-wider text-primary-strong">The Vault</span>
              </div>
              <p className="mt-1 flex items-center gap-1 text-sm font-semibold text-text">
                <Gem className="w-3.5 h-3.5 text-signal" />
                {vaultGems.toLocaleString()} gems to spend
              </p>
              <p className="mt-0.5 text-[11px] text-subtle">Titles, cosmetics &amp; membership credits →</p>
            </Link>

            {/* Full dashboard */}
            <Link
              href="/crew"
              className="flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-semibold text-primary-strong hover:bg-surface-elevated transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Open full dashboard
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
