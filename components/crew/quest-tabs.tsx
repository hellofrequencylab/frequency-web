'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Target, Award, Swords, Trophy, Flame, ShoppingBag } from 'lucide-react'

// Shared sub-nav across the Quest area (build §10.1) — folds the scattered /crew/*
// routes into one tabbed dashboard instead of jumps reachable only from the rail.
const TABS = [
  { href: '/crew', label: 'Dashboard', Icon: LayoutDashboard, match: (p: string) => p === '/crew' },
  { href: '/crew/quests', label: 'Quests', Icon: Target, match: (p: string) => p.startsWith('/crew/quests') },
  { href: '/crew/achievements', label: 'Achievements', Icon: Award, match: (p: string) => p.startsWith('/crew/achievements') },
  { href: '/crew/challenges', label: 'Challenges', Icon: Swords, match: (p: string) => p.startsWith('/crew/challenges') },
  { href: '/crew/leaderboard', label: 'Leaderboard', Icon: Trophy, match: (p: string) => p.startsWith('/crew/leaderboard') },
  { href: '/crew/streaks', label: 'Streaks', Icon: Flame, match: (p: string) => p.startsWith('/crew/streaks') },
  { href: '/crew/store', label: 'Store', Icon: ShoppingBag, match: (p: string) => p.startsWith('/crew/store') },
] as const

export function QuestTabs() {
  const pathname = usePathname()
  return (
    <div className="mb-6 flex gap-1 overflow-x-auto border-b border-border [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {TABS.map((t) => {
        const active = t.match(pathname)
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`-mb-px inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-semibold transition-colors ${
              active ? 'border-primary text-text' : 'border-transparent text-muted hover:text-text'
            }`}
          >
            <t.Icon className="h-4 w-4" />
            {t.label}
          </Link>
        )
      })}
    </div>
  )
}
