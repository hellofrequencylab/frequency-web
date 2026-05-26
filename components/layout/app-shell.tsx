'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
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
} from 'lucide-react'

type CommunityRole = 'member' | 'crew' | 'host' | 'guide' | 'mentor'

const ROLE_BADGE: Record<CommunityRole, { label: string; cls: string }> = {
  member: { label: 'Member', cls: 'bg-gray-100 text-gray-600' },
  crew:   { label: 'Crew',   cls: 'bg-blue-100 text-blue-700' },
  host:   { label: 'Host',   cls: 'bg-green-100 text-green-700' },
  guide:  { label: 'Guide',  cls: 'bg-purple-100 text-purple-700' },
  mentor: { label: 'Mentor', cls: 'bg-amber-100 text-amber-700' },
}

const SIDEBAR_NAV = [
  { href: '/feed',     label: 'Feed',      Icon: Home },
  { href: '/circles',  label: 'Circles',   Icon: Users },
  { href: '/channels', label: 'Channels',  Icon: Radio },
  { href: '/events',   label: 'Events',    Icon: CalendarDays },
  { href: '/people',   label: 'Directory', Icon: Globe },
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

  function isActive(href: string) {
    if (href === '/feed') return pathname === '/feed'
    if (href === '/circles') return pathname === '/circles' || pathname.startsWith('/circles/') || pathname.startsWith('/hubs/') || pathname.startsWith('/nexuses/')
    if (href === '/channels') return pathname === '/channels' || pathname.startsWith('/channels/')
    return pathname === href || pathname.startsWith(href + '/')
  }

  const profileActive = pathname === profileHref || pathname.startsWith('/people/')

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">

      {/* ── Desktop sidebar ─────────────────────────── */}
      <aside className="hidden md:flex w-60 flex-col shrink-0 border-r border-gray-200 bg-white">

        {/* Logo */}
        <div className="flex items-center gap-2.5 h-16 px-5 border-b border-gray-100 shrink-0">
          <Radio className="w-5 h-5 text-indigo-600" strokeWidth={2.5} />
          <span className="text-[15px] font-semibold tracking-tight text-gray-900">
            frequency
          </span>
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
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                }`}
              >
                <Icon
                  className={`w-[18px] h-[18px] shrink-0 ${
                    active ? 'text-indigo-600' : 'text-gray-400'
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
                  ? 'bg-amber-50 text-amber-700'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              }`}
            >
              <Shield
                className={`w-[18px] h-[18px] shrink-0 ${
                  pathname.startsWith('/admin') ? 'text-amber-600' : 'text-gray-400'
                }`}
                strokeWidth={pathname.startsWith('/admin') ? 2.5 : 2}
              />
              Admin
            </Link>
          )}
        </nav>

        {/* Upgrade to Crew CTA — member only */}
        {role === 'member' && (
          <div className="mx-3 mb-3 rounded-xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-violet-50 p-3.5">
            <p className="text-xs font-semibold text-indigo-900 mb-1">Upgrade to Crew</p>
            <p className="text-xs text-indigo-600 leading-snug mb-3">
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
        <div className="shrink-0 border-t border-gray-100 p-3">
          <div className="flex items-center gap-1">
            <Link
              href={profileHref}
              className="flex items-center gap-2.5 flex-1 min-w-0 rounded-lg px-2 py-1.5 hover:bg-gray-50 transition-colors"
            >
              {profile.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt={profile.display_name}
                  className="w-8 h-8 rounded-full object-cover shrink-0"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 text-xs font-semibold flex items-center justify-center shrink-0 select-none">
                  {getInitials(profile.display_name)}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900 truncate leading-tight">
                  {profile.display_name}
                </p>
                <span
                  className={`inline-block mt-0.5 text-[11px] px-1.5 py-px rounded-full font-medium leading-tight ${badge.cls}`}
                >
                  {badge.label}
                </span>
              </div>
            </Link>

            <button
              aria-label="Notifications"
              className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            >
              <Bell className="w-4 h-4" />
            </button>
            <form action="/auth/signout" method="POST">
              <button
                type="submit"
                aria-label="Sign out"
                className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
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
        <header className="md:hidden flex items-center justify-between h-14 px-4 shrink-0 border-b border-gray-200 bg-white">
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-indigo-600" strokeWidth={2.5} />
            <span className="text-sm font-semibold tracking-tight text-gray-900">
              frequency
            </span>
          </div>
          <button
            aria-label="Notifications"
            className="p-2 -mr-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <Bell className="w-5 h-5" />
          </button>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto pb-16 md:pb-0">
          {children}
        </main>
      </div>

      {/* ── Mobile bottom nav ────────────────────────── */}
      <nav className="md:hidden fixed inset-x-0 bottom-0 z-40 flex h-16 items-stretch bg-white border-t border-gray-200">
        {(
          [
            { href: '/feed',     label: 'Feed',    Icon: Home },
            { href: '/circles',  label: 'Circles', Icon: Users },
            { href: '/events',   label: 'Events',  Icon: CalendarDays },
            { href: profileHref, label: 'Profile', Icon: User },
          ] as const
        ).map(({ href, label, Icon }) => {
          const active =
            href === profileHref ? profileActive : isActive(href)
          return (
            <Link
              key={label}
              href={href}
              className={`flex flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors ${
                active ? 'text-indigo-600' : 'text-gray-400'
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
