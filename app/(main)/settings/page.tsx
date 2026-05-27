'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Moon, Sun, Monitor, Check, User } from 'lucide-react'

type Theme = 'light' | 'dark' | 'system'

const THEME_OPTIONS: { value: Theme; label: string; description: string; Icon: typeof Moon }[] = [
  {
    value: 'light',
    label: 'Light',
    description: 'Always use the light theme',
    Icon: Sun,
  },
  {
    value: 'dark',
    label: 'Dark',
    description: 'Always use the dark theme',
    Icon: Moon,
  },
  {
    value: 'system',
    label: 'System',
    description: 'Follow your device setting',
    Icon: Monitor,
  },
]

export default function SettingsPage() {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window === 'undefined') return 'system'
    const saved = localStorage.getItem('theme') as Theme | null
    return saved === 'dark' || saved === 'light' ? saved : 'system'
  })

  function applyTheme(next: Theme) {
    setThemeState(next)
    const html = document.documentElement
    if (next === 'dark') {
      html.classList.add('dark')
      localStorage.setItem('theme', 'dark')
    } else if (next === 'light') {
      html.classList.remove('dark')
      localStorage.setItem('theme', 'light')
    } else {
      localStorage.removeItem('theme')
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      html.classList.toggle('dark', prefersDark)
    }
  }

  return (
    <div>
      <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-50 mb-1">Settings</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-8">
        Manage your preferences.
      </p>

      {/* Profile link */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
          Account
        </h2>
        <Link
          href="/settings/profile"
          className="flex items-center gap-3 rounded-2xl border border-gray-200/60 dark:border-gray-800/60 bg-white dark:bg-gray-900 shadow-sm px-4 py-3 hover:border-indigo-200 dark:hover:border-indigo-800 hover:bg-indigo-50/30 dark:hover:bg-indigo-950/30 transition-colors"
        >
          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-gray-50 dark:bg-gray-800 shrink-0">
            <User className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 dark:text-gray-50">Edit profile</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Display name, handle, bio, and photo
            </p>
          </div>
          <span className="text-gray-400 dark:text-gray-600 text-sm">→</span>
        </Link>
      </section>

      {/* Appearance */}
      <section>
        <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
          Appearance
        </h2>
        <div className="rounded-2xl border border-gray-200/60 dark:border-gray-800/60 bg-white dark:bg-gray-900 shadow-sm divide-y divide-gray-100/80 dark:divide-gray-800/50 overflow-hidden">
          {THEME_OPTIONS.map(({ value, label, description, Icon }) => {
            const active = theme === value
            return (
              <button
                key={value}
                onClick={() => applyTheme(value)}
                className={`w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors ${
                  active
                    ? 'bg-indigo-50/60 dark:bg-indigo-950/40'
                    : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
              >
                <div className={`flex items-center justify-center w-9 h-9 rounded-lg shrink-0 ${
                  active
                    ? 'bg-indigo-100 dark:bg-indigo-900'
                    : 'bg-gray-100 dark:bg-gray-800'
                }`}>
                  <Icon className={`w-4 h-4 ${active ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-500 dark:text-gray-400'}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${active ? 'text-indigo-700 dark:text-indigo-300' : 'text-gray-900 dark:text-gray-50'}`}>
                    {label}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{description}</p>
                </div>
                {active && (
                  <Check className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                )}
              </button>
            )
          })}
        </div>
      </section>
    </div>
  )
}
