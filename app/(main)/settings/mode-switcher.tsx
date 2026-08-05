'use client'

import { useState } from 'react'
import { Moon, Sun, Monitor, Check } from 'lucide-react'

// The light/dark MODE switcher, extracted from the old Settings home so the unified
// one-page Settings surface (page.tsx, a Server Component) can compose it inside the
// Appearance section. Storage + apply logic mirror the in-app account-menu toggle in
// components/layout/app-shell.tsx (key `freq-theme`, values 'light' | 'dark' |
// 'system'), so the two toggles and the pre-paint script in app/layout.tsx stay
// in agreement. Initial state falls back to the legacy `theme` key (the same
// one-time migration the layout script does) so existing members aren't reset.

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

export function ModeSwitcher() {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window === 'undefined') return 'system'
    const saved = (localStorage.getItem('freq-theme') ?? localStorage.getItem('theme')) as Theme | null
    return saved === 'dark' || saved === 'light' || saved === 'system' ? saved : 'system'
  })

  // Apply (mode → .dark class + meta theme-color) and persist to `freq-theme`.
  function applyTheme(next: Theme) {
    setThemeState(next)
    localStorage.setItem('freq-theme', next)
    const sysDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const isDark = next === 'dark' || (next === 'system' && sysDark)
    document.documentElement.classList.toggle('dark', isDark)
    const meta = document.querySelector('meta[name="theme-color"]')
    // token-ok: browser theme-color literal (mirrors --color-ink/--color-canvas; set on <meta>, no CSS var)
    if (meta) meta.setAttribute('content', isDark ? '#16130E' : '#FBFAF6')
  }

  return (
    <div>
      <p className="text-meta font-medium text-muted uppercase tracking-wide mb-2">Mode</p>
      <div className="rounded-card border border-border bg-surface lift-1 divide-y divide-border/80 dark:divide-border/50 overflow-hidden">
        {THEME_OPTIONS.map(({ value, label, description, Icon }) => {
          const active = theme === value
          return (
            <button
              key={value}
              onClick={() => applyTheme(value)}
              className={`w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors ${
                active
                  ? 'bg-primary-bg/60 dark:bg-primary-bg/40'
                  : 'hover:bg-surface-elevated'
              }`}
            >
              <div className={`flex items-center justify-center w-9 h-9 rounded-lg shrink-0 ${
                active
                  ? 'bg-primary-bg'
                  : 'bg-surface-elevated'
              }`}>
                <Icon className={`w-4 h-4 ${active ? 'text-primary-strong' : 'text-muted'}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-body-sm font-medium ${active ? 'text-primary-strong' : 'text-text'}`}>
                  {label}
                </p>
                <p className="text-meta text-muted mt-0.5">{description}</p>
              </div>
              {active && (
                <Check className="w-4 h-4 text-primary-strong shrink-0" />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
