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
  LogOut,
  Shield,
  MessageSquare,
  Moon,
  Sun,
  Settings,
  Zap,
  Search,
  CreditCard,
  BellRing,
  SlidersHorizontal,
  Megaphone,
} from 'lucide-react'
import { getInitials } from '@/lib/utils'
import { NotificationBell } from '@/components/layout/notification-bell'

type CommunityRole = 'member' | 'crew' | 'host' | 'guide' | 'mentor' | 'janitor'

const ROLE_BADGE: Record<CommunityRole, { label: string; cls: string }> = {
  member:  { label: 'Member',  cls: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' },
  crew:    { label: 'Crew',    cls: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400' },
  host:    { label: 'Host',    cls: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400' },
  guide:   { label: 'Guide',   cls: 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-400' },
  mentor:  { label: 'Mentor',  cls: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400' },
  janitor: { label: 'Janitor', cls: 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-400' },
}

const SIDEBAR_NAV = [
  { href: '/feed',      label: 'Feed',      Icon: Home },
  { href: '/broadcast', label: 'Broadcast', Icon: Megaphone },
  { href: '/circles',   label: 'Circles',   Icon: Users },
  { href: '/channels',  label: 'Channels',  Icon: Radio },
  { href: '/events',    label: 'Events',    Icon: CalendarDays },
  { href: '/messages',  label: 'Messages',  Icon: MessageSquare },
  { href: '/people',    label: 'Directory', Icon: Globe },
]

interface Profile {
  display_name: string
  handle: string
  avatar_url: string | null
  community_role: CommunityRole
}

// ── Theme hook ────────────────────────────────────────────────────────────────

type Theme = 'light' | 'dark' | 'system'

function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window === 'undefined') return 'system'
    const saved = localStorage.getItem('theme') as Theme | null
    return saved === 'dark' || saved === 'light' ? saved : 'system'
  })

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

// ── Profile card (sidebar bottom) ─────────────────────────────────────────────
// Public-facing identity: avatar · name · role badge → profile + member settings
// This is the engagement anchor — badges, rank, etc. will live here as we grow.

function ProfileCard({
  profile,
  badge,
  profileHref,
}: {
  profile: Profile
  badge: { label: string; cls: string }
  profileHref: string
}) {
  return (
    <div className="flex items-center gap-2 rounded-xl p-2 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors group">
      <Link href={profileHref} className="flex items-center gap-2.5 flex-1 min-w-0">
        {profile.avatar_url ? (
          <img
            src={profile.avatar_url}
            alt={profile.display_name}
            className="w-12 h-12 rounded-full object-cover shrink-0"
          />
        ) : (
          <div className="w-12 h-12 rounded-full bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-sm font-bold flex items-center justify-center shrink-0 select-none">
            {getInitials(profile.display_name)}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-50 truncate leading-tight">
            {profile.display_name}
          </p>
          <span
            className={`inline-block mt-0.5 text-[10px] px-1.5 py-px rounded-full font-medium leading-tight ${badge.cls}`}
          >
            {badge.label}
          </span>
        </div>
      </Link>

      {/* Member settings — gear reveals on hover */}
      <Link
        href="/settings"
        aria-label="Member settings"
        className="shrink-0 p-1.5 rounded-lg text-gray-300 dark:text-gray-700 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 opacity-0 group-hover:opacity-100 transition-all"
      >
        <Settings className="w-4 h-4" />
      </Link>
    </div>
  )
}

// ── Account dropdown (top-right) ──────────────────────────────────────────────
// Admin layer: account settings, billing, notifications, theme, sign out.
// Always shows initials — keeps it feeling functional/admin vs. personal.

function AccountDropdown({
  profile,
  themeLabel,
  ThemeIcon,
  cycleTheme,
}: {
  profile: Profile
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
        aria-label="Account menu"
        className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-[11px] font-semibold hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors select-none shrink-0"
      >
        {getInitials(profile.display_name)}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-56 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-xl shadow-black/5 py-1 z-50">

          {/* Header */}
          <div className="px-3 py-2.5 border-b border-gray-100 dark:border-gray-800">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-0.5">
              Account
            </p>
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-50 truncate">
              {profile.display_name}
            </p>
          </div>

          {/* Account links */}
          <div className="py-1">
            <Link
              href="/settings"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              <SlidersHorizontal className="w-4 h-4 text-gray-400" />
              Account Settings
            </Link>
            <Link
              href="/settings/billing"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              <CreditCard className="w-4 h-4 text-gray-400" />
              Billing & Plans
            </Link>
            <Link
              href="/settings/notifications"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              <BellRing className="w-4 h-4 text-gray-400" />
              Notifications
            </Link>
          </div>

          {/* Theme */}
          <div className="border-t border-gray-100 dark:border-gray-800 py-1">
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
                className="flex items-center gap-2.5 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 w-full text-left transition-colors"
              >
                <LogOut className="w-4 h-4" />
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
  sidebar,
  unreadCount = 0,
}: {
  profile: Profile
  children: React.ReactNode
  sidebar?: React.ReactNode
  unreadCount?: number
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

  // Hide right sidebar only on pages where it would crowd or distract
  // /settings — narrow focused forms, sidebar adds noise
  // /messages — chat thread needs full width
  const showSidebar =
    !!sidebar &&
    !pathname.startsWith('/settings') &&
    !pathname.startsWith('/messages')

  function cycleTheme() {
    if (theme === 'system') setTheme('dark')
    else if (theme === 'dark') setTheme('light')
    else setTheme('system')
  }

  const ThemeIcon = theme === 'dark' ? Moon : Sun
  const themeLabel =
    theme === 'dark' ? 'Dark mode' : theme === 'light' ? 'Light mode' : 'System theme'

  return (
    <div className="flex flex-col h-screen bg-gray-50 dark:bg-gray-950 overflow-hidden">

      {/* ── Top bar ───────────────────────────────────────── */}
      <header className="h-14 shrink-0 flex items-stretch bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 z-30">

        {/* Logo — full-width header, no vertical divider */}
        <div className="flex items-center px-5">
          <Link href="/feed" className="flex items-center">
            <img
              src="/frequency-logo.png"
              alt="Frequency"
              className="h-7 md:h-8 w-auto dark:invert"
            />
          </Link>
        </div>

        {/* Right section: search · notifications · account */}
        <div className="flex flex-1 items-center justify-end gap-1 px-3">

          {/* Search pill — desktop */}
          <Link
            href="/search"
            className="hidden sm:flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-1.5 text-sm text-gray-400 hover:border-gray-300 dark:hover:border-gray-600 transition-colors mr-1"
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

          {/* Notifications */}
          <NotificationBell initialUnread={unreadCount} />

          {/* Account dropdown — initials, admin/account layer */}
          <AccountDropdown
            profile={profile}
            themeLabel={themeLabel}
            ThemeIcon={ThemeIcon}
            cycleTheme={cycleTheme}
          />
        </div>
      </header>

      {/* ── Body ──────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* Left nav */}
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
            {(role === 'crew' || role === 'host' || role === 'guide' || role === 'mentor' || role === 'janitor') && (
              <Link
                href="/crew"
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  pathname === '/crew'
                    ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-50'
                }`}
              >
                <Zap
                  className={`w-[18px] h-[18px] shrink-0 ${
                    pathname === '/crew' ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-400 dark:text-gray-600'
                  }`}
                  strokeWidth={pathname === '/crew' ? 2.5 : 2}
                />
                Crew
              </Link>
            )}

            {/* Admin — host+ */}
            {(role === 'host' || role === 'guide' || role === 'mentor' || role === 'janitor') && (
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
                    pathname.startsWith('/admin') ? 'text-amber-600 dark:text-amber-400' : 'text-gray-400 dark:text-gray-600'
                  }`}
                  strokeWidth={pathname.startsWith('/admin') ? 2.5 : 2}
                />
                Admin
              </Link>
            )}
          </nav>

          {/* Upgrade to Crew CTA — members only (not janitor) */}
          {role === 'member' && (
            <div className="mx-3 mb-3 rounded-xl border border-indigo-100 dark:border-indigo-900 bg-gradient-to-br from-indigo-50 to-violet-50 dark:from-indigo-950 dark:to-violet-950 p-3.5">
              <p className="text-xs font-semibold text-indigo-900 dark:text-indigo-100 mb-1">
                Upgrade to Crew
              </p>
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

          {/* Profile card — public identity anchor */}
          {/* Avatar · name · role badge → public profile · member settings */}
          {/* Grows into: points, rank, badges as we build out engagement */}
          <div className="border-t border-gray-100 dark:border-gray-800 p-3">
            <ProfileCard profile={profile} badge={badge} profileHref={profileHref} />
          </div>
        </aside>

        {/* Center + right column */}
        <div className="flex flex-1 min-h-0 min-w-0 overflow-hidden">

          {/* Page content */}
          <main className="flex-1 overflow-y-auto pb-16 md:pb-0 min-w-0">
            {children}
          </main>

          {/* Right sidebar — only on lg+, hidden on admin/settings */}
          {showSidebar && (
            <aside className="hidden lg:block w-72 shrink-0 overflow-y-auto border-l border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
              {sidebar}
            </aside>
          )}
        </div>
      </div>

      {/* ── Mobile bottom nav ─────────────────────────────── */}
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
