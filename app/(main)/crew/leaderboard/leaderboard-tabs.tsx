'use client'

import Link from 'next/link'

const SCOPES = [
  { key: 'circle', label: 'Circle' },
  { key: 'hub',    label: 'Hub' },
  { key: 'nexus',  label: 'Nexus' },
  { key: 'global', label: 'Global' },
  { key: 'gems',   label: 'Gems (All-Time)' },
] as const

export function LeaderboardTabs({ activeScope }: { activeScope: string }) {
  return (
    <div className="flex gap-1 mb-6 p-1 rounded-xl bg-surface-elevated/60 w-fit">
      {SCOPES.map(({ key, label }) => (
        <Link
          key={key}
          href={`/crew/leaderboard?scope=${key}`}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            activeScope === key
              ? 'bg-surface text-text shadow-sm'
              : 'text-muted hover:text-text'
          }`}
        >
          {label}
        </Link>
      ))}
    </div>
  )
}
