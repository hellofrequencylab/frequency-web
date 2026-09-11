'use client'

import { useState } from 'react'
import { Moon, Sun, Monitor, Check } from 'lucide-react'
import { type ThemeMode } from '@/lib/theme/mode'
import { readStoredMode, syncMode, writeStoredMode } from '@/lib/theme/apply-mode'

// The light/dark MODE switcher, composed into the unified one-page Settings surface (page.tsx, a
// Server Component) inside the Appearance section.
//
// It used to carry its OWN copy of the storage read, the dark resolution and the theme-color
// literals — a third copy beside the app shell's and the pre-paint script's, kept in step by a
// comment asking the reader to check. All three now read lib/theme/mode.ts, whose two statements of
// the law (the TypeScript one and the ES5 bootstrap) are held together by mode.test.ts.
//
// Settings is behind the auth wall, so everyone who can reach this control has an account and may
// choose any of the three. A signed-out browser cannot honour 'dark' at all — see resolveDarkMode.

const THEME_OPTIONS: { value: ThemeMode; label: string; description: string; Icon: typeof Moon }[] = [
  {
    value: 'light',
    label: 'Light',
    // Named as the default, because it now is one (owner, 2026-09-11).
    description: 'The default. Always use the light theme',
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
  const [theme, setThemeState] = useState<ThemeMode>(() => readStoredMode())

  // Persist the choice, then let the shared applier decide what it RESOLVES to. Not the same thing:
  // on a surface the public-community lock covers, the stored choice is kept and the shown mode is
  // light, and syncMode is the only thing that knows the difference.
  function applyTheme(next: ThemeMode) {
    setThemeState(next)
    writeStoredMode(next)
    syncMode()
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
