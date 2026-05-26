'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect, useRef } from 'react'
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
  Zap,
  Search,
  ChevronDown,
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

// ── Theme hook ────────────────────────────────────────────────────────────────

type Theme = 'light' | 'dark' | 'system'

function useTheme() {
  const [theme, setThemeState] = useState<Theme>('system')

  useEffect(() => {
    const saved = localStorage.getItem('theme') as Theme | null
    if (saved === 'dark' || saved === 'light') setThemeState(saved)
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
      html.classList.toggle('dark', window.matchMedia('(prefers-color-scheme: dark)').matches)
    }
  }

  return { theme, setTheme }
}

// ── User dropdown ─────────────────────────────────────────────────────────────

function UserDropdown({
  profile,
  badge,
  profileHref,
  themeLabel,
  ThemeIcon,
  cycleTheme,
}: {
  profile: Profile
  badge: { label: string; cls: string }
  profileHref: string
  themeLabel: string
  ThemeIcon: React.ElementType
  cycleTheme: () => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        aria-label="User menu"
      >
        {profile.avatar_url ? (
          <img
            src={profile.avatar_url}
            alt={profile.display_name}
            className="w-7 h-7 rounded-full object-cover"
          />
        ) : (
          <div className="w-7 h-7 rounded-full bg-indigo-100 dark:bg-indigo-900 text-indigo-600 dark:text-indigo-400 text-xs font-semibold flex items-center justify-center select-none">
            {getInitials(profile.display_name)}
          </div>
        )}
        <ChevronDown
          className={`w-3.5 h-3.5 text-gray-400 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-56 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-xl shadow-black/5 py-1 z-50">
          {/* Identity */}
          <div className="px-3 py-2.5 border-b border-gray-100 dark:border-gray-800">
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-50 truncate">
              {profile.display_name}
            </p>
            <span className={`inline-block mt-0.5 text-[11px] px-1.5 py-px rounded-full font-medium leading-tight ${badge.cls}`}>
              {badge.label}
            </span>
          </div>

          {/* Links */}
          <div className="py-1">
            <Link
              href={profileHref}
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              <User className="w-4 h-4 text-gray-400" />
              Profile
            </Link>
            <Link
              href="/settings"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              <Settings className="w-4 h-4 text-gray-400" />
              Settings
            </Link>
            <button
              onClick={() => { cycleTheme(); setOpen(false) }}
              className="flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 w-full text-left transition-colors"
            >
              <ThemeIcon className="w-4 h-4 text-gray-400" />
              {themeLabel}
            </button>
          </div>

          {/* Sign out */}
          <div className="border-t border-gray-100 dark:border-gray-800 py-1">
            <form action="/auth/signout" method="POST">
              <button
                type="submit"
                className="flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 w-full text-left transition-colors"
              >
                <LogOut className="w-4 h-4 text-gray-400" />
                Sign out
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

// ── App shell ─────────────────────────────────────────────────────────────────

export default function AppShell({
  profile,
  children,
}: {
  profile: Profile
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  const role = (profile.community_role ?? 'member') as CommunityRole
  const badge = ROLE_BADGE[role] ?? ROLE_BADGE.member
  const profileHref = `/people/${profile.handle}`
  const { theme, setTheme } = useTheme()

  // ⌘K / Ctrl+K → search
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        router.push('/search')
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [router])

  function isActive(href: string) {
    if (href === '/feed')     return pathname === '/feed'
    if (href === '/circles')  return pathname === '/circles' || pathname.startsWith('/circles/') || pathname.startsWith('/hubs/') || pathname.startsWith('/nexuses/')
    if (href === '/channels') return pathname === '/channels' || pathname.startsWith('/channels/')
    if (href === '/messages') return pathname === '/messages' || pathname.startsWith('/messages/')
    if (href === '/settings') return pathname === '/settings' || pathname.startsWith('/settings/')
    if (href === '/crew')     return pathname === '/crew'
    if (href === '/search')   return pathname === '/search'
    return pathname === href || pathname.startsWith(href + '/')
  }

  const profileActive = pathname === profileHref || pathname.startsWith('/people/')

  function cycleTheme() {
    if (theme === 'system') setTheme('dark')
    else if (theme === 'dark') setTheme('light')
    else setTheme('system')
  }

  const ThemeIcon = theme === 'dark' ? Moon : Sun
  const themeLabel = theme === 'dark' ? 'Dark mode' : theme === 'light' ? 'Light mode' : 'System theme'

  return (
    <div className="flex flex-col h-screen bg-gray-50 dark:bg-gray-950 overflow-hidden">

      {/* ── Top bar (all screens) ─────────────────────── */}
      <header className="h-14 shrink-0 flex items-center gap-2 px-4 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 z-30">

        {/* Logo */}
        <Link href="/feed" className="shrink-0 mr-1">
          <img
            src="/frequency-logo.png"
            alt="Frequency"
            className="h-6 w-auto dark:invert"
          />
        </Link>

        <div className="flex-1" />

        {/* Search pill — desktop */}
        <Link
          href="/search"
          className="hidden sm:flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-1.5 text-sm text-gray-400 hover:border-gray-300 dark:hover:border-gray-600 transition-colors"
        >
          <Search className="w-3.5 h-3.5" />
          <span>Search</span>
          <kbd className="text-[10px] rounded px-1 border border-gray-200 dark:border-gray-700 text-gray-300 dark:text-gray-600">
            ⌘K
          </kbd>
        </Link>

        {/* Search icon — mobile */}
        <Link
          href="/search"
          aria-label="Search"
          className="sm:hidden p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          <Search className="w-5 h-5" />
        </Link>

        {/* Notifications placeholder */}
        <button
          aria-label="Notifications"
          className="p-2 rounded-lg text-gray-400 dark:text-gray-600 hover:text-gray-600 dark:hover:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          <Bell className="w-4 h-4" />
        </button>

        {/* User dropdown */}
        <UserDropdown
          profile={profile}
          badge={badge}
          profileHref={profileHref}
          themeLabel={themeLabel}
          ThemeIcon={ThemeIcon}
          cycleTheme={cycleTheme}
        />
      </header>

      {/* ── Body ─────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* Desktop sidebar */}
        <aside className="hidden md:flex w-52 flex-col shrink-0 border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">

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
                      active ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-400 dark:text-gray-600'
                    }`}
                    strokeWidth={active ? 2.5 : 2}
                  />
                  {label}
                </Link>
              )
            })}

            {/* Crew — crew+ */}
            {(role === 'crew' || role === 'host' || role === 'guide' || role === 'mentor') && (
              <Link
                href="/crew"
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  pathname === '/crew'
                    ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-50'
                }`}
              >
                <Zap
                  className={`w-[18px] h-[18px] shrink-0 ${pathname === '/crew' ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-400 dark:text-gray-600'}`}
                  strokeWidth={pathname === '/crew' ? 2.5 : 2}
                />
                Crew
              </Link>
            )}

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
                  className={`w-[18px] h-[18px] shrink-0 ${pathname.startsWith('/admin') ? 'text-amber-600 dark:text-amber-400' : 'text-gray-400 dark:text-gray-600'}`}
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
        </aside>

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
          const active = href === profileHref ? profileActive : isActive(href)
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
