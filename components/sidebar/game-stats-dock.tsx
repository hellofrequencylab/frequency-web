'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  Zap, Gem, Flame, Target, Sparkles, CheckCircle2, ArrowRight, Lock, ChevronUp,
} from 'lucide-react'
import { RANK_LABELS, seasonRankStyle, type SeasonRank } from '@/lib/season-ranks'
import { ProgressTrack } from '@/components/ui/progress-track'

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
    <p className="text-3xs font-semibold uppercase tracking-widest text-muted">{children}</p>
  )
}

// ── The Vault: the bottom-right dock (three-docks law) ────────────────────────
//
// Bottom right is the member's score. It returns as a CANVAS CORNER TAB flush to the bottom
// edge -- deliberately the same object, at the same coordinates, as the operator page dock
// (app/(main)/admin/layout.tsx:85). DAWN's docks card states the law as "Bottom right | The
// Vault (member) OR this page (operator)", and mounting both at `bottom-0 right-3 w-72` makes
// that OR true in geometry rather than in z-index arbitration: `showSidebar` is false on
// /admin (railFor -> 'none'), so exactly one of them can ever render.
//
// WHY A TAB AND NOT THE FLOATING CHIP THAT WAS ROLLED BACK. The chip and the chat pill never
// actually overlapped -- there was 12px of clearance at lg. Three other things were true:
//   1. The chat PANEL (24rem x 600px at md:bottom-6 md:right-6) wholly contained the chip, so
//      opening chat erased the score. A bigger gap in the same lane would not have helped.
//   2. Two floating, right-aligned, click-to-open pills 12px apart read as ONE cluster. That is
//      what "competed with the chat launcher for the same corner" meant.
//   3. A 146px chip could only carry 2 of 5 numbers, which is the owner's other complaint:
//      "a score you have to click to see is a score you stop reading."
// A 288px tab head carries zaps, gems, streak AND rank at rest, and being flush to the edge it
// is no longer a floating object competing with another floating object.
//
// THE BOTTOM-RIGHT CONTRACT, from the edge up. Every number is stated, because the last
// version of this comment asserted a lane the arithmetic did not support.
//
//   >= 768 (the tab renders):
//     SLOT 0 - the Vault tab: bottom-0 right-3, z-40, w-72. Occupies [0, 69] vertically:
//              1px border-t + 4px pt-1 + 64px head (h-10 crest + py-3).
//     SLOT 1 - toasts: right-4, z-50, md:bottom-24 = 96px. NOT bottom-20: 80px would sit 1px
//              INSIDE a 69px tab. 96 clears it by 27.
//     SLOT 2 - the chat edge pill: moved off the corner entirely to top-1/2 of the right edge.
//              It is a tab tucked into the margin by its own definition, not a corner object.
//     The chat PANEL moves to md:bottom-[4.75rem] = 76px (69 + 7 gap) so it stops covering the
//     tab. That line is load-bearing, not cosmetic.
//
//   < 768 (the tab does NOT render):
//     The bottom edge belongs to the tab bar: [0, 56 + env(safe-area-inset-bottom)], up to 90px
//     on a home-indicator phone, plus the raised Zap catch whose top reaches 112px. Toasts sit
//     at bottom-32 = 128px, clearing the catch by 16. A 288px tab cannot coexist with a 7-slot
//     tab bar and a centred raised action, so the score's < 768 home stays the drawer cluster.
//
// SCORE ONCE PER VIEWPORT: < 768 the drawer cluster; >= 768 this tab. Nothing else renders it.
export function GameStatsDockClient({ data }: { data: DockData }) {
  const { zaps, gems, streak, rank } = data
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  // Esc or an outside click dismisses, like the other dock popovers.
  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const rankStyle = rank ? seasonRankStyle(rank) : null

  return (
    <div
      ref={rootRef}
      className="pointer-events-auto fixed bottom-0 right-3 z-40 hidden w-72 rounded-t-2xl border-x border-t border-border/70 bg-[var(--color-canvas)]/95 px-2 pt-1 backdrop-blur-sm md:block print:hidden"
    >
      {/* The panel reveals INSIDE the tab (grid-rows 0fr -> 1fr) rather than as a sibling above
          it, so the tab's bottom edge stays pinned to 0 and the corner never lifts off. */}
      <div
        className={`grid overflow-hidden transition-[grid-template-rows] duration-200 ease-out ${
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        }`}
      >
        <div className="min-h-0">
          <div
            role="region"
            aria-label="The Vault"
            className="max-h-[70dvh] overflow-y-auto px-2 pb-2 pt-2"
          >
            <GameStatsPanel data={data} showSummary />
          </div>
        </div>
      </div>

      {/* Tab head — all five numbers at rest. This is the readability the chip could not give. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="The Vault. Your Zaps, Gems, streak and rank"
        className="flex h-10 w-full items-center gap-2 rounded-lg px-1.5 transition-colors hover:bg-surface-elevated"
      >
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-pill bg-primary">
          <Zap className="h-3.5 w-3.5 fill-current text-on-primary" />
        </span>
        <span className="text-sm font-semibold tabular-nums text-text">{zaps.toLocaleString()}</span>
        <span aria-hidden className="h-4 w-px bg-border" />
        <span className="inline-flex items-center gap-1 text-sm tabular-nums text-muted">
          <Gem className="h-3.5 w-3.5 text-primary-strong" />
          {gems.toLocaleString()}
        </span>
        <span aria-hidden className="h-4 w-px bg-border" />
        <span className="inline-flex items-center gap-1 text-sm tabular-nums text-muted">
          <Flame className="h-3.5 w-3.5 text-primary-strong" />
          {streak}
        </span>
        {rankStyle && (
          <span className={`ml-auto rounded-pill px-2 py-0.5 text-3xs font-bold uppercase tracking-widest ${rankStyle}`}>
            {rank ? RANK_LABELS[rank] : ''}
          </span>
        )}
        <ChevronUp
          className={`h-4 w-4 shrink-0 text-subtle transition-transform ${open ? 'rotate-180' : ''} ${rankStyle ? '' : 'ml-auto'}`}
        />
      </button>
    </div>
  )
}

// ── Shared stats panel body ───────────────────────────────────────────────────
// The actual stats content (today's move · streak · rank · journey · vault ·
// dashboard), factored out so it can render BOTH inside the desktop dock above and
// inside the mobile LEFT drawer's bottom cluster (MobileGameStats in
// right-sidebar.tsx → AppShell's `mobileStats` slot — the < lg home of the game
// counts). `showSummary` prepends a zaps/gems/streak + rank header; both current
// mounts pass true (the collapsed chip shows only zaps + streak, so the expanded
// panel leads with the full line).

export function GameStatsPanel({ data, showSummary = false }: { data: DockData; showSummary?: boolean }) {
  const { zaps, gems, streak, rank, todaysMove, last7, rankProgress, arc, vaultGems } = data
  return (
    <div className="space-y-4">
      {showSummary && (
        <div className="flex items-center justify-between gap-2 border-b border-border pb-3">
          <div className="flex items-center gap-3 text-sm font-bold text-text tabular-nums">
            <span className="inline-flex items-center gap-1"><Zap className="w-4 h-4 text-primary fill-current" />{zaps.toLocaleString()}</span>
            <span className="inline-flex items-center gap-1"><Gem className="w-4 h-4 text-signal" />{gems.toLocaleString()}</span>
            <span className="inline-flex items-center gap-1"><Flame className="w-4 h-4 text-primary" />{streak}d</span>
          </div>
          {rank && (
            <span className="rank-badge text-3xs leading-tight" style={seasonRankStyle(rank)}>
              {RANK_LABELS[rank] ?? rank}
            </span>
          )}
        </div>
      )}

      {/* Today's move — North-Star action, no box */}
      {todaysMove.kind === 'done' ? (
        <p className="flex items-center gap-2 text-sm font-medium text-success">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          Practiced today, streak safe
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
            <div key={i} className={`h-1.5 flex-1 rounded-pill ${on ? 'bg-primary' : 'bg-surface-elevated'}`} />
          ))}
        </div>
      </div>

      {/* Rank progress */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <SectionLabel>Rank</SectionLabel>
          <span className="text-2xs text-muted">
            {rankProgress.nextLabel
              ? `${rankProgress.toGo.toLocaleString()} zaps to ${rankProgress.nextLabel}`
              : 'Top rank reached'}
          </span>
        </div>
        <ProgressTrack
          value={rankProgress.nextLabel ? rankProgress.pct : 100}
          minVisible={2}
          label="Progress to the next rank"
          className="w-full"
        />
      </div>

      {/* Current arc */}
      {arc && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <SectionLabel>Journey</SectionLabel>
            <Link href="/crew" className="text-2xs font-semibold text-primary-strong hover:text-primary-hover">View →</Link>
          </div>
          <div className="rounded-card bg-surface-elevated px-3 py-2.5">
            <div className="flex items-center gap-1.5">
              <Target className="w-3.5 h-3.5 text-signal-strong shrink-0" />
              <span className="truncate text-xs font-semibold text-text">{arc.chain}</span>
            </div>
            <p className="mt-0.5 mb-1.5 truncate text-2xs text-muted">{arc.step}</p>
            <ProgressTrack value={arc.pct} minVisible={2} label={`${arc.chain} progress`} tone="signal" track="surface" className="w-full" />
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
        <p className="mt-0.5 text-2xs text-muted">Titles, cosmetics &amp; membership credits →</p>
      </Link>

      {/* Full dashboard */}
      <Link
        href="/crew"
        className="flex items-center justify-center gap-1.5 rounded-control py-2 text-xs font-semibold text-primary-strong hover:bg-surface-elevated transition-colors"
      >
        <Sparkles className="w-3.5 h-3.5" />
        Open full dashboard
      </Link>
    </div>
  )
}
