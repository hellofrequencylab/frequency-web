'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Moon, Sun, Monitor, Check, User, Shield, Bell, CreditCard } from 'lucide-react'
import { FocusTemplate } from '@/components/templates'
import { SectionHeader } from '@/components/ui/section-header'

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
    <FocusTemplate title="Settings" description="Manage your preferences.">
      {/* Account — all of a member's settings reachable from one place. */}
      <section className="mb-8">
        <SectionHeader title="Account" />
        <div className="space-y-3">
          <SettingLink href="/settings/profile" Icon={User} title="Edit profile" description="Display name, handle, bio, and photo" />
          <SettingLink href="/settings/account" Icon={Shield} title="Account & privacy" description="Blocked members, delete account" />
          <SettingLink href="/settings/notifications" Icon={Bell} title="Notifications" description="Email and push preferences" />
          <SettingLink href="/settings/billing" Icon={CreditCard} title="Billing" description="Membership and payment" />
        </div>
      </section>

      {/* Appearance */}
      <section>
        <SectionHeader title="Appearance" />
        <div className="rounded-2xl border border-border bg-surface shadow-sm divide-y divide-border/80 dark:divide-border/50 overflow-hidden">
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
                  <p className={`text-sm font-medium ${active ? 'text-primary-strong' : 'text-text'}`}>
                    {label}
                  </p>
                  <p className="text-xs text-muted mt-0.5">{description}</p>
                </div>
                {active && (
                  <Check className="w-4 h-4 text-primary-strong shrink-0" />
                )}
              </button>
            )
          })}
        </div>
      </section>
    </FocusTemplate>
  )
}

function SettingLink({
  href,
  Icon,
  title,
  description,
}: {
  href: string
  Icon: typeof Moon
  title: string
  description: string
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-2xl border border-border bg-surface shadow-sm px-4 py-3 hover:border-primary-bg dark:hover:border-primary hover:bg-primary-bg/30 dark:hover:bg-primary-bg transition-colors"
    >
      <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-surface-elevated shrink-0">
        <Icon className="w-4 h-4 text-muted" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text">{title}</p>
        <p className="text-xs text-muted mt-0.5">{description}</p>
      </div>
      <span className="text-subtle text-sm">→</span>
    </Link>
  )
}
