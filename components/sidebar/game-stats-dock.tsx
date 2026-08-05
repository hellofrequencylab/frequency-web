'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  Zap, Gem, Flame, Target, Sparkles, CheckCircle2, ArrowRight, Lock, ChevronUp,
} from 'lucide-react'
import { RANK_LABELS, seasonRankStyle, type SeasonRank } from '@/lib/season-ranks'
import { ProgressTrack } from '@/components/ui/progress-track'
import { StreakMeter } from '@/components/ui/streak-meter'
import { Counter } from '@/components/ui/counter'
import { StandingTiles } from '@/components/gamification/standing-tiles'

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
// A tab head flush to the edge carries the numbers at rest and is no longer a floating object
// competing with another floating object.
//
// AMENDED 2026-08-05: the head is ~240px, not 288, and carries zaps, gems and streak — NOT rank.
// The Vault is now the left SEGMENT of the anchored bar in components/layout/dock-bar.tsx, which
// gives the right ~48px to the chat button. The rank chip moved into the panel below rather than
// squeeze the three numbers you actually read at rest.
//
// THE BOTTOM-RIGHT CONTRACT, from the edge up. Every number is stated, because the last
// version of this comment asserted a lane the arithmetic did not support.
//
//   >= 768 (the bar renders):
//     SLOT 0 - the anchored bar: bottom-0 right-3, z-40, w-72, split into the Vault segment
//              (flex-1) and the chat segment (~48px). Occupies [0, 69] vertically: 1px border-t
//              + 4px pt-1 + 64px head (h-10 crest + py-3).
//     SLOT 1 - toasts: right-4, z-50, md:bottom-24 = 96px. NOT bottom-20: 80px would sit 1px
//              INSIDE a 69px tab. 96 clears it by 27.
//     SLOT 2 - RETIRED. The chat used to be an edge pill at top-1/2 of the right edge, off the
//              corner, because it and the Vault were two floating objects fighting for it. They
//              are one bar now, so there is no second object to keep away.
//     The chat PANEL stays at md:bottom-[4.75rem] = 76px (69 + 7 gap) so it does not cover the
//     bar. That line is load-bearing, not cosmetic.
//
//   < 768 (the tab does NOT render):
//     The bottom edge belongs to the tab bar: [0, 56 + env(safe-area-inset-bottom)], up to 90px
//     on a home-indicator phone, plus the raised Zap catch whose top reaches 112px. Toasts sit
//     at bottom-32 = 128px, clearing the catch by 16. A 288px tab cannot coexist with a 7-slot
//     tab bar and a centred raised action, so the score's < 768 home stays the drawer cluster.
//
// SCORE ONCE PER VIEWPORT: < 768 the drawer cluster; >= 768 this tab. Nothing else renders it.
export function GameStatsDockClient({ data }: { data: DockData }) {
  const { zaps, gems, streak } = data
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


  return (
    <div
      ref={rootRef}
      // Positioning belongs to DockBar now, not here. This is a SEGMENT of the anchored bar
      // (components/layout/dock-bar.tsx) rather than its own floating object, so it carries
      // only its surface: the top-rounded crest, the border and the blur.
      className="w-full rounded-t-2xl border-x border-t border-border/70 bg-[var(--color-canvas)]/95 px-2 pt-1 backdrop-blur-sm"
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
            {/* No showSummary: the collapsed head above already carries zaps/gems/streak. */}
            <GameStatsPanel data={data} />
          </div>
        </div>
      </div>

      {/* Tab head — zaps, gems and streak at rest. Still the readability the chip could not
          give (it managed 2 of 5); rank moved into the panel when the chat segment landed. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="The Vault. Your Zaps, Gems and streak"
        className="flex h-10 w-full items-center gap-2 rounded-lg px-1.5 transition-colors hover:bg-surface-elevated"
      >
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-pill bg-primary">
          <Zap className="h-3.5 w-3.5 fill-current text-on-primary" />
        </span>
        {/* THROUGH THE KIT. Every number a member sees goes through Counter (mono, tabular) or
            StreakMeter — and this strip is the most-read number cluster in the app, so it was the
            worst place to be hand-rolled: the three numerals were tabular but NOT mono, which is
            the half of the contract that actually holds a changing count still.
            `labelHidden` because the head is ~240px once the chat segment takes its ~48px: the
            glyphs carry the kind here (the amber bolt, the teal Gem, the amber flame) and the
            words would cost the numbers their room. The labels still reach assistive tech.
            Gems are TEAL. DAWN's counter tone law is by kind, not by chrome: Zaps and streaks
            amber, Gems and trophies teal, Airtime and movement the Move blue. */}
        <Counter value={zaps} label="Zaps" labelHidden />
        <span aria-hidden className="h-4 w-px bg-border" />
        <Counter value={gems} label="Gems" glyph={Gem} tone="signal" labelHidden />
        <span aria-hidden className="h-4 w-px bg-border" />
        <Counter value={streak} label="day streak" glyph={Flame} tone="primary-strong" labelHidden />
        {/* The rank chip used to sit here. It does not fit once the chat segment takes ~48px off
            this head, and squeezing it would have come out of the three numbers, which are the
            thing you actually read at rest. Rank lives in the panel below (and in the summary),
            one click away, rather than truncated to nothing up here. */}
        <ChevronUp
          className={`ml-auto h-4 w-4 shrink-0 text-subtle transition-transform ${open ? 'rotate-180' : ''}`}
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
      {/* The three counts, via the KIT rather than a hand-rolled row. StandingTiles calls itself
          "the single way a member's standing renders anywhere it appears" (MEMBER-DESIGN-SYSTEM
          §2), and its `compact` variant was written for exactly this three-up — it went unused
          when the rail's Quest card was deleted by ADR-932. The dock is where the score lives
          now, so the dock should use the canonical renderer.
          `showSummary` is FALSE in the dock: the collapsed head already carries these numbers and
          the docks law is that nothing is offered twice. It is true in the mobile drawer, which
          has no head. */}
      {showSummary && (
        <StandingTiles
          zaps={zaps}
          gems={gems}
          streak={streak}
          rank={rank ?? 'initiate'}
          variant="compact"
          links={{ zaps: '/crew/leaderboard', gems: '/crew/store', streak: '/crew' }}
        />
      )}

      {/* Rank leads the panel. It is the one part of the score the collapsed head CANNOT show —
          the chip was dropped from the head when the chat segment took ~48px, so this is where a
          member reads their standing. */}
      {rank && (
        <div className="flex items-center justify-between gap-2 border-b border-border pb-3">
          <SectionLabel>Season standing</SectionLabel>
          <span className="rank-badge text-3xs leading-tight" style={seasonRankStyle(rank)}>
            {RANK_LABELS[rank] ?? rank}
          </span>
        </div>
      )}

      {/* Today's move — North-Star action, no box */}
      {todaysMove.kind === 'done' ? (
        <p className="flex items-center gap-2 text-body-sm font-medium text-success">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          Practiced today, streak safe
        </p>
      ) : (
        <Link
          href="/practices"
          className="group/move flex items-center gap-2 text-body-sm font-semibold text-primary-strong hover:text-primary-hover transition-colors"
        >
          <Flame className="w-4 h-4 shrink-0" />
          <span className="flex-1">{todaysMove.kind === 'adopt' ? 'Adopt a practice to start' : 'Log today’s practice'}</span>
          <ArrowRight className="w-3.5 h-3.5 shrink-0 transition-transform group-hover/move:translate-x-0.5" />
        </Link>
      )}

      {/* Streak — the kit's StreakMeter, not seven hand-rolled bars. StreakMeter was built for
          this exact run (DAWN 2026-08-03 §5) with the emotional contract that matters: a missed
          day is a HOLLOW dot, never red, because an absence is not a failure state. It shipped
          with a test and then sat at ZERO importers while this file drew flat bars that cannot
          express the difference between missed and frozen.
          `last7` is boolean[], so it maps to done/missed only — a freeze reads as 'done' here
          because DockData carries no freeze flags. That is a data gap, not a rendering choice:
          feeding the third state needs the tri-state out of lib/practice-streak.ts. */}
      <div className="space-y-1.5">
        <SectionLabel>Streak</SectionLabel>
        <StreakMeter days={last7.map((on) => (on ? 'done' : 'missed'))} count={streak} />
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
              <span className="truncate text-meta font-semibold text-text">{arc.chain}</span>
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
          <span className="text-meta font-bold uppercase tracking-wider text-primary-strong">The Vault</span>
        </div>
        {/* The spendable balance is a READING, so it goes through Counter too — same teal Gem,
            same mono numeral as the head above, rather than a third hand-rolled spelling of it. */}
        <p className="mt-1">
          <Counter value={vaultGems} label="gems to spend" glyph={Gem} tone="signal" />
        </p>
        <p className="mt-0.5 text-2xs text-muted">Titles, cosmetics &amp; membership credits →</p>
      </Link>

      {/* Full dashboard */}
      <Link
        href="/crew"
        className="flex items-center justify-center gap-1.5 rounded-control py-2 text-meta font-semibold text-primary-strong hover:bg-surface-elevated transition-colors"
      >
        <Sparkles className="w-3.5 h-3.5" />
        Open full dashboard
      </Link>
    </div>
  )
}
