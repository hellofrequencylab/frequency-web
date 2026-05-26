'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
import {
  Radio,
  Home,
  Users,
  CalendarDays,
  Globe,
  User,
  Bell,
  LogOut,
  Shield,
  MessageSquare,
  Moon,
  Sun,
  Settings,
} from 'lucide-react'

type CommunityRole = 'member' | 'crew' | 'host' | 'guide' | 'mentor'

const ROLE_BADGE: Record<CommunityRole, { label: string; cls: string }> = {
  member: { label: 'Member', cls: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' },
  crew:   { label: 'Crew',   cls: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400' },
  host:   { label: 'Host',   cls: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400' },
  guide:  { label: 'Guide',  cls: 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-400' },
  mentor: { label: 'Mentor', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400' },
}

const SIDEBAR_NAV = [
  { href: '/feed',      label: 'Feed',      Icon: Home },
  { href: '/circles',   label: 'Circles',   Icon: Users },
  { href: '/channels',  label: 'Channels',  Icon: Radio },
  { href: '/events',    label: 'Events',    Icon: CalendarDays },
  { href: '/messages',  label: 'Messages',  Icon: MessageSquare },
  { href: '/people',    label: 'Directory', Icon: Globe },
  { href: '/settings',  label: 'Settings',  Icon: Settings },
]

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('')
}

interface Profile {
  display_name: string
  handle: string
  avatar_url: string | null
  community_role: CommunityRole
}

// ── Theme toggle ──────────────────────────────────────────────────────────────

type Theme = 'light' | 'dark' | 'system'

function useTheme() {
  const [theme, setThemeState] = useState<Theme>('system')

  useEffect(() => {
    const saved = localStorage.getItem('theme') as Theme | null
    if (saved === 'dark' || saved === 'light') {
      setThemeState(saved)
    }
  }, [])

  function setTheme(next: Theme) {
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

  return { theme, setTheme }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AppShell({
  profile,
  children,
}: {
  profile: Profile
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const role = (profile.community_role ?? 'member') as CommunityRole
  const badge = ROLE_BADGE[role] ?? ROLE_BADGE.member
  const profileHref = `/people/${profile.handle}`
  const { theme, setTheme } = useTheme()

  function isActive(href: string) {
    if (href === '/feed') return pathname === '/feed'
    if (href === '/circles') return pathname === '/circles' || pathname.startsWith('/circles/') || pathname.startsWith('/hubs/') || pathname.startsWith('/nexuses/')
    if (href === '/channels') return pathname === '/channels' || pathname.startsWith('/channels/')
    if (href === '/messages') return pathname === '/messages' || pathname.startsWith('/messages/')
    if (href === '/settings') return pathname === '/settings' || pathname.startsWith('/settings/')
    return pathname === href || pathname.startsWith(href + '/')
  }

  const profileActive = pathname === profileHref || pathname.startsWith('/people/')

  // Cycle: system → dark → light → system
  function cycleTheme() {
    if (theme === 'system') setTheme('dark')
    else if (theme === 'dark') setTheme('light')
    else setTheme('system')
  }

  const ThemeIcon = theme === 'dark' ? Moon : theme === 'light' ? Sun : Moon
  const themeLabel = theme === 'dark' ? 'Dark mode' : theme === 'light' ? 'Light mode' : 'System theme'

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-950 overflow-hidden">

      {/* ── Desktop sidebar ─────────────────────────── */}
      <aside className="hidden md:flex w-60 flex-col shrink-0 border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">

        {/* Logo */}
        <div className="flex items-center h-16 px-5 border-b border-gray-100 dark:border-gray-800 shrink-0">
          <img
            src="/frequency-logo.png"
            alt="Frequency"
            className="h-8 w-auto dark:invert"
          />
        </div>

        {/* Primary nav */}
        <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
          {SIDEBAR_NAV.map(({ href, label, Icon }) => {
            const active = isActive(href)
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-50'
                }`}
              >
                <Icon
                  className={`w-[18px] h-[18px] shrink-0 ${
                    active
                      ? 'text-indigo-600 dark:text-indigo-400'
                      : 'text-gray-400 dark:text-gray-600'
                  }`}
                  strokeWidth={active ? 2.5 : 2}
                />
                {label}
              </Link>
            )
          })}

          {/* Admin — host+ */}
          {(role === 'host' || role === 'guide' || role === 'mentor') && (
            <Link
              href="/admin"
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                pathname.startsWith('/admin')
                  ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-50'
              }`}
            >
              <Shield
                className={`w-[18px] h-[18px] shrink-0 ${
                  pathname.startsWith('/admin')
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-gray-400 dark:text-gray-600'
                }`}
                strokeWidth={pathname.startsWith('/admin') ? 2.5 : 2}
              />
              Admin
            </Link>
          )}
        </nav>

        {/* Upgrade to Crew CTA — member only */}
        {role === 'member' && (
          <div className="mx-3 mb-3 rounded-xl border border-indigo-100 dark:border-indigo-900 bg-gradient-to-br from-indigo-50 to-violet-50 dark:from-indigo-950 dark:to-violet-950 p-3.5">
            <p className="text-xs font-semibold text-indigo-900 dark:text-indigo-100 mb-1">Upgrade to Crew</p>
            <p className="text-xs text-indigo-600 dark:text-indigo-400 leading-snug mb-3">
              Get full access to the feed, events, and your group.
            </p>
            <a
              href="/upgrade"
              className="block text-center rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 transition-colors"
            >
              Upgrade →
            </a>
          </div>
        )}

        {/* User identity + actions */}
        <div className="shrink-0 border-t border-gray-100 dark:border-gray-800 p-3">
          <div className="flex items-center gap-1">
            <Link
              href={profileHref}
              className="flex items-center gap-2.5 flex-1 min-w-0 rounded-lg px-2 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              {profile.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt={profile.display_name}
                  className="w-8 h-8 rounded-full object-cover shrink-0"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900 text-indigo-600 dark:text-indigo-400 text-xs font-semibold flex items-center justify-center shrink-0 select-none">
                  {getInitials(profile.display_name)}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-50 truncate leading-tight">
                  {profile.display_name}
                </p>
                <span className={`inline-block mt-0.5 text-[11px] px-1.5 py-px rounded-full font-medium leading-tight ${badge.cls}`}>
                  {badge.label}
                </span>
              </div>
            </Link>

            <button
              aria-label={themeLabel}
              onClick={cycleTheme}
              title={themeLabel}
              className="p-1.5 rounded-md text-gray-400 dark:text-gray-600 hover:text-gray-600 dark:hover:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <ThemeIcon className="w-4 h-4" />
            </button>
            <button
              aria-label="Notifications"
              className="p-1.5 rounded-md text-gray-400 dark:text-gray-600 hover:text-gray-600 dark:hover:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <Bell className="w-4 h-4" />
            </button>
            <form action="/auth/signout" method="POST">
              <button
                type="submit"
                aria-label="Sign out"
                className="p-1.5 rounded-md text-gray-400 dark:text-gray-600 hover:text-gray-600 dark:hover:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      </aside>

      {/* ── Content column ──────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">

        {/* Mobile top bar */}
        <header className="md:hidden flex items-center justify-between h-14 px-4 shrink-0 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
          <div className="flex items-center">
            <img
              src="/frequency-logo.png"
              alt="Frequency"
              className="h-6 w-auto dark:invert"
            />
          </div>
          <div className="flex items-center gap-1">
            <button
              aria-label={themeLabel}
              onClick={cycleTheme}
              className="p-2 rounded-md text-gray-400 dark:text-gray-600 hover:text-gray-600 dark:hover:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <ThemeIcon className="w-4 h-4" />
            </button>
            <button
              aria-label="Notifications"
              className="p-2 -mr-1 rounded-md text-gray-400 dark:text-gray-600 hover:text-gray-600 dark:hover:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <Bell className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto pb-16 md:pb-0">
          {children}
        </main>
      </div>

      {/* ── Mobile bottom nav ────────────────────────── */}
      <nav className="md:hidden fixed inset-x-0 bottom-0 z-40 flex h-16 items-stretch bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800">
        {(
          [
            { href: '/feed',     label: 'Feed',     Icon: Home },
            { href: '/circles',  label: 'Circles',  Icon: Users },
            { href: '/events',   label: 'Events',   Icon: CalendarDays },
            { href: '/messages', label: 'Messages', Icon: MessageSquare },
            { href: profileHref, label: 'Profile',  Icon: User },
          ] as const
        ).map(({ href, label, Icon }) => {
          const active =
            href === profileHref ? profileActive : isActive(href)
          return (
            <Link
              key={label}
              href={href}
              className={`flex flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors ${
                active ? 'text-indigo-600' : 'text-gray-400 dark:text-gray-600'
              }`}
            >
              <Icon className="w-5 h-5" strokeWidth={active ? 2.5 : 2} />
              {label}
            </Link>
          )
        })}
      </nav>

    </div>
  )
}
