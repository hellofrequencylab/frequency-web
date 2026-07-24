'use client'

import { useState } from 'react'
import { Moon, Sun, Monitor, User, Shield, Bell, CreditCard, MapPin, Palette } from 'lucide-react'
import { FocusTemplate } from '@/components/templates'
import { SectionHeader } from '@/components/ui/section-header'
import { SettingsGroup, SettingsRow } from '@/components/ui/settings-row'

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
  // Storage + apply logic mirror the in-app account-menu toggle in
  // components/layout/app-shell.tsx (key `freq-theme`, values 'light' | 'dark' |
  // 'system'), so the two toggles and the pre-paint script in app/layout.tsx stay
  // in agreement. Initial state falls back to the legacy `theme` key (the same
  // one-time migration the layout script does) so existing members aren't reset.
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
    <FocusTemplate title="Settings" description="Manage your preferences.">
      {/* Account — all of a member's settings reachable from one place. */}
      <section className="mb-8">
        <SectionHeader title="Account" />
        <SettingsGroup>
          <SettingsRow href="/settings/profile" icon={User} title="Edit profile" description="Display name, handle, bio, and photo" />
          <SettingsRow href="/settings/account" icon={Shield} title="Account & privacy" description="Blocked members, delete account" />
          <SettingsRow href="/settings/connections" icon={MapPin} title="Connections & Location" description="Discovery, location precision, ghost mode" />
          <SettingsRow href="/settings/notifications" icon={Bell} title="Notifications" description="Email and push preferences" />
          <SettingsRow href="/settings/billing" icon={CreditCard} title="Billing" description="Membership and payment" />
        </SettingsGroup>
      </section>

      {/* Appearance — light/dark mode. */}
      <section>
        <SectionHeader title="Appearance" />
        <p className="text-xs font-medium text-muted uppercase tracking-wide mb-2">Mode</p>
        <SettingsGroup>
          {THEME_OPTIONS.map(({ value, label, description, Icon }) => (
            <SettingsRow
              key={value}
              icon={Icon}
              title={label}
              description={description}
              selected={theme === value}
              onClick={() => applyTheme(value)}
            />
          ))}
        </SettingsGroup>

        {/* Theme — the palette, feel, and seasonal accent (the server-resolved fxtheme axes),
            on their own surface so the Mode card stays the quick light/dark switch. */}
        <div className="mt-3">
          <SettingsGroup>
            <SettingsRow
              href="/settings/appearance"
              icon={Palette}
              title="Theme"
              description="Palette, feel, and seasonal accent"
            />
          </SettingsGroup>
        </div>
      </section>
    </FocusTemplate>
  )
}
