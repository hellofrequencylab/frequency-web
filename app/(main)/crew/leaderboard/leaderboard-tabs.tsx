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
    <div className="flex gap-1 mb-6 p-1 rounded-xl bg-gray-100 dark:bg-gray-800/60 w-fit">
      {SCOPES.map(({ key, label }) => (
        <Link
          key={key}
          href={`/crew/leaderboard?scope=${key}`}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            activeScope === key
              ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-50 shadow-sm'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          {label}
        </Link>
      ))}
    </div>
  )
}
