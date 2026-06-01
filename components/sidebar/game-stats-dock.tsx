'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  Zap, Gem, Flame, ChevronUp, Target, Award, Sparkles,
  CheckCircle2, ArrowRight, Lock,
} from 'lucide-react'
import { RANK_LABELS, seasonRankStyle, type SeasonRank } from '@/lib/season-ranks'
import { useFeedAtBottom } from './use-feed-at-bottom'

// ── Data shape (assembled server-side in right-sidebar.tsx) ───────────────────

export type DockChallenge = {
  name: string
  current: number
  target: number
  difficulty: string
  pct: number
}

export type DockData = {
  zaps: number
  gems: number
  streak: number
  rank: SeasonRank | null
  todaysMove: { kind: 'log' | 'adopt' | 'done'; practiceTitle?: string }
  last7: boolean[]
  rankProgress: { nextLabel: string | null; toGo: number; pct: number }
  challenges: DockChallenge[]
  quest: { chain: string; step: string; pct: number } | null
  badge: { count: number; latestName: string | null }
  vaultGems: number
}

const DIFFICULTY: Record<string, { label: string; dot: string }> = {
  easy:      { label: 'Easy',      dot: 'bg-success' },
  normal:    { label: 'Normal',    dot: 'bg-primary' },
  hard:      { label: 'Hard',      dot: 'bg-signal-strong' },
  legendary: { label: 'Legendary', dot: 'bg-rank-plum' },
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-1 text-[10px] font-semibold uppercase tracking-widest text-subtle">
      {children}
    </p>
  )
}

function Bar({ pct, className = 'bg-primary' }: { pct: number; className?: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-elevated">
      <div className={`h-full rounded-full ${className}`} style={{ width: `${Math.min(100, Math.max(2, pct))}%` }} />
    </div>
  )
}

export function GameStatsDockClient({ data }: { data: DockData }) {
  const { zaps, gems, streak, rank, todaysMove, last7, rankProgress, challenges, quest, badge, vaultGems } = data
  const [manualOpen, setManualOpen] = useState(false)
  const atBottom = useFeedAtBottom()
  const open = manualOpen || atBottom

  return (
    <div className="sticky bottom-0 z-10 border-t border-border bg-canvas">
      {/* Compact bar — tap to open/close. Stays on top; panel fills underneath. */}
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

      {/* Expandable panel — grows upward, caps at ~3/4 screen, scrolls inside. */}
      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-out ${
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        }`}
      >
        <div className="overflow-hidden">
          <div className="max-h-[72vh] overflow-y-auto px-3 pb-4 pt-1 space-y-4">

            {/* Today's move — the North-Star daily action */}
            {todaysMove.kind === 'done' ? (
              <div className="flex items-center gap-2.5 rounded-xl bg-success-bg/50 px-3 py-2.5">
                <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
                <span className="text-sm font-medium text-text">Practiced today — streak safe 🔥</span>
              </div>
            ) : (
              <Link
                href="/practices"
                className="flex items-center gap-2.5 rounded-xl bg-primary px-3 py-2.5 text-on-primary hover:bg-primary-hover transition-colors"
              >
                <Flame className="w-4 h-4 shrink-0" />
                <span className="flex-1 text-sm font-semibold">
                  {todaysMove.kind === 'adopt' ? 'Adopt a practice to start' : 'Log today’s practice'}
                </span>
                <ArrowRight className="w-4 h-4 shrink-0" />
              </Link>
            )}

            {/* Streak strip */}
            <div className="space-y-1.5">
              <SectionLabel>Last 7 days</SectionLabel>
              <div className="flex gap-1.5 px-1">
                {last7.map((on, i) => (
                  <div
                    key={i}
                    className={`h-6 flex-1 rounded ${on ? 'bg-primary' : 'border border-border bg-surface'}`}
                  />
                ))}
              </div>
            </div>

            {/* Rank progress */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between px-1">
                <SectionLabel>Rank</SectionLabel>
                <span className="text-[11px] text-subtle">
                  {rankProgress.nextLabel
                    ? `${rankProgress.toGo.toLocaleString()} zaps to ${rankProgress.nextLabel}`
                    : 'Top rank reached'}
                </span>
              </div>
              <Bar pct={rankProgress.nextLabel ? rankProgress.pct : 100} />
            </div>

            {/* Active challenges */}
            <div className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <SectionLabel>Challenges</SectionLabel>
                <Link href="/crew/challenges" className="text-[11px] font-semibold text-primary-strong hover:text-primary-hover">All →</Link>
              </div>
              {challenges.length === 0 ? (
                <p className="px-1 text-xs text-subtle">No challenges in progress. <Link href="/crew/challenges" className="text-primary-strong hover:underline">Start one →</Link></p>
              ) : (
                <div className="space-y-2.5">
                  {challenges.map((c, i) => (
                    <div key={i} className="space-y-1">
                      <div className="flex items-center justify-between gap-2 px-1">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${DIFFICULTY[c.difficulty]?.dot ?? 'bg-primary'}`} />
                          <span className="truncate text-xs font-medium text-text">{c.name}</span>
                        </span>
                        <span className="shrink-0 text-[11px] tabular-nums text-subtle">{c.current}/{c.target}</span>
                      </div>
                      <Bar pct={c.pct} />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Current quest */}
            {quest && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between px-1">
                  <SectionLabel>Quest</SectionLabel>
                  <Link href="/crew/quests" className="text-[11px] font-semibold text-primary-strong hover:text-primary-hover">View →</Link>
                </div>
                <div className="rounded-xl bg-surface-elevated px-3 py-2.5">
                  <div className="flex items-center gap-1.5">
                    <Target className="w-3.5 h-3.5 text-signal-strong shrink-0" />
                    <span className="truncate text-xs font-semibold text-text">{quest.chain}</span>
                  </div>
                  <p className="mt-0.5 mb-1.5 truncate text-[11px] text-subtle">{quest.step}</p>
                  <Bar pct={quest.pct} className="bg-signal-strong" />
                </div>
              </div>
            )}

            {/* Nearest badge / achievements */}
            <Link
              href="/crew/achievements"
              className="flex items-center gap-2.5 rounded-xl bg-surface-elevated px-3 py-2.5 hover:bg-surface-elevated/70 transition-colors"
            >
              <Award className="w-4 h-4 text-signal shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-text">{badge.count} badge{badge.count === 1 ? '' : 's'} earned</p>
                {badge.latestName && <p className="truncate text-[11px] text-subtle">Latest: {badge.latestName}</p>}
              </div>
              <ArrowRight className="w-3.5 h-3.5 text-muted shrink-0" />
            </Link>

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
              <p className="mt-0.5 text-[11px] text-subtle">Titles, cosmetics &amp; membership credits — unlock yours →</p>
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
