'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  Zap, Gem, Flame, X, Target, Sparkles, CheckCircle2, ArrowRight, Lock,
} from 'lucide-react'
import { RANK_LABELS, seasonRankStyle, type SeasonRank } from '@/lib/season-ranks'

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
    <p className="text-3xs font-semibold uppercase tracking-widest text-subtle">{children}</p>
  )
}

// ── The Vault dock (three-docks law, DAWN 2026-08-03) ─────────────────────────
// Bottom right is the member's score: Zaps, Gems, the streak and the season. The
// dock is a collapsed floating chip (Zaps · streak) that expands upward into the
// full progress panel — the SAME GameStatsPanel as before, relocated from the
// right rail's foot. The streak chip that used to sit in the top bar lives here
// now (the top bar is the system, and the system does not keep score). Rendered
// from the right rail's slot, so its visibility follows the page-chrome map
// (rail 'none' surfaces get no Vault dock) with no path-sniffing.
export function GameStatsDockClient({ data }: { data: DockData }) {
  const { zaps, streak } = data
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
    <div ref={rootRef} className="fixed bottom-4 right-4 z-30 flex flex-col items-end print:hidden">
      {/* Expanded panel — grows from the chip toward the interior, scrolls inside. */}
      {open && (
        <div
          role="dialog"
          aria-label="The Vault"
          className="mb-2.5 flex max-h-[72vh] w-80 flex-col overflow-hidden rounded-card border border-border bg-surface lift-2"
        >
          {/* Head — the chrome band: the dock's frame, not its content. */}
          <div className="flex items-center gap-2 border-b border-chrome-border bg-chrome px-4 py-2.5">
            <Gem className="h-4 w-4 shrink-0 text-primary-strong" />
            <p className="flex-1 text-2xs font-semibold uppercase tracking-widest text-muted">The Vault</p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close the Vault"
              className="flex h-6 w-6 items-center justify-center rounded-md text-subtle transition-colors hover:bg-surface-elevated hover:text-text"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="overflow-y-auto px-4 py-3.5">
            <GameStatsPanel data={data} showSummary />
          </div>
        </div>
      )}

      {/* Collapsed chip — Zaps and the streak at a glance, one tap to open. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="The Vault. Your Zaps, Gems and streak"
        title="The Vault"
        className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-elevated py-1.5 pl-1.5 pr-3 lift-2"
      >
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary">
          <Zap className="h-3.5 w-3.5 fill-current text-on-primary" />
        </span>
        <span className="text-sm font-semibold tabular-nums text-text">{zaps.toLocaleString()}</span>
        <span aria-hidden className="h-4 w-px bg-border" />
        <span className="inline-flex items-center gap-1 text-sm tabular-nums text-muted">
          <Flame className="h-3.5 w-3.5 text-primary-strong" />
          {streak}
        </span>
      </button>
    </div>
  )
}

// ── Shared stats panel body ───────────────────────────────────────────────────
// The actual stats content (today's move · streak · rank · journey · vault ·
// dashboard), factored out so it can render BOTH inside the desktop dock above and
// inside the mobile right-side stats menu (app-shell.tsx). `showSummary` prepends a
// zaps/gems/streak + rank header — the desktop dock already shows that in its bar,
// so it passes false; the mobile menu passes true.

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
            <div key={i} className={`h-1.5 flex-1 rounded-full ${on ? 'bg-primary' : 'bg-surface-elevated'}`} />
          ))}
        </div>
      </div>

      {/* Rank progress */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <SectionLabel>Rank</SectionLabel>
          <span className="text-2xs text-subtle">
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
            <Link href="/crew" className="text-2xs font-semibold text-primary-strong hover:text-primary-hover">View →</Link>
          </div>
          <div className="rounded-xl bg-surface-elevated px-3 py-2.5">
            <div className="flex items-center gap-1.5">
              <Target className="w-3.5 h-3.5 text-signal-strong shrink-0" />
              <span className="truncate text-xs font-semibold text-text">{arc.chain}</span>
            </div>
            <p className="mt-0.5 mb-1.5 truncate text-2xs text-subtle">{arc.step}</p>
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
        <p className="mt-0.5 text-2xs text-subtle">Titles, cosmetics &amp; membership credits →</p>
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
  )
}
