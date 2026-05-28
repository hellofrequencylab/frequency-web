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
  UserPlus,
  Menu,
  X,
  Gem,
  Monitor,
} from 'lucide-react'
import { getInitials } from '@/lib/utils'
import { NotificationBell } from '@/components/layout/notification-bell'
import { MessagesPopover } from '@/components/messages/messages-popover'

type CommunityRole = 'member' | 'crew' | 'host' | 'guide' | 'mentor' | 'janitor'

// Dawn volunteer ladder (Section 6): Crew → Hosts → Guides → Mentors maps to
// stone → clay → jade → plum. `member` is *not* a rank, so it renders as a
// neutral muted chip. `janitor` is outside the volunteer ladder. Parked on
// slate (admin-feeling) until product weighs in.
type RankKey = 'stone' | 'clay' | 'jade' | 'plum' | 'slate'
const ROLE_RANK: Record<CommunityRole, RankKey | null> = {
  member:  null,
  crew:    'stone',
  host:    'clay',
  guide:   'jade',
  mentor:  'plum',
  janitor: 'slate',
}
const ROLE_LABEL: Record<CommunityRole, string> = {
  member:  'Member',
  crew:    'Crew',
  host:    'Host',
  guide:   'Guide',
  mentor:  'Mentor',
  janitor: 'Janitor',
}
function rankStyle(rank: RankKey | null): React.CSSProperties {
  if (!rank) return {}
  return {
    ['--rank' as string]:        `var(--rank-${rank})`,
    ['--rank-deep' as string]:   `var(--rank-${rank}-deep)`,
    ['--rank-bright' as string]: `var(--rank-${rank}-bright)`,
  }
}

const SIDEBAR_NAV = [
  { href: '/feed',      label: 'Feed',      Icon: Home },
  { href: '/broadcast', label: 'Broadcast', Icon: Megaphone },
  { href: '/circles',   label: 'Circles',   Icon: Users },
  { href: '/channels',  label: 'Channels',  Icon: Radio },
  { href: '/events',    label: 'Events',    Icon: CalendarDays },
  { href: '/messages',  label: 'Messages',  Icon: MessageSquare },
  { href: '/friends',   label: 'Friends',   Icon: UserPlus },
  { href: '/people',    label: 'Directory', Icon: Globe },
]

interface Profile {
  display_name: string
  handle: string
  avatar_url: string | null
  community_role: CommunityRole
  current_season_zaps?: number | null
  lifetime_gems?: number | null
}

// ── Theme hook ────────────────────────────────────────────────────────────────

type Theme = 'light' | 'dark' | 'system'

function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window === 'undefined') return 'system'
    const saved = localStorage.getItem('freq-theme') as Theme | null
    return saved === 'dark' || saved === 'light' || saved === 'system' ? saved : 'system'
  })

  // Apply (mode → .dark class + meta theme-color). Pulled out so we can also
  // call it from the OS preference listener below.
  function apply(mode: Theme) {
    const sysDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const isDark = mode === 'dark' || (mode === 'system' && sysDark)
    document.documentElement.classList.toggle('dark', isDark)
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.setAttribute('content', isDark ? '#16130E' : '#FBFAF6')
  }

  function setTheme(next: Theme) {
    setThemeState(next)
    localStorage.setItem('freq-theme', next)
    apply(next)
  }

  // Follow OS changes while the user is on 'system'.
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    function onChange() {
      if ((localStorage.getItem('freq-theme') ?? 'system') === 'system') apply('system')
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return { theme, setTheme }
}

// ── Profile card (sidebar bottom) ─────────────────────────────────────────────
// Public-facing identity: avatar · name · role badge → profile + member settings
// This is the engagement anchor. Badges, rank, etc. will live here as we grow.

function ProfileCard({
  profile,
  role,
  profileHref,
}: {
  profile: Profile
  role: CommunityRole
  profileHref: string
}) {
  const rank = ROLE_RANK[role]
  return (
    <div className="flex items-start gap-2.5 rounded-xl p-2 hover:bg-surface-elevated transition-colors group">
      <Link href={profileHref} className="shrink-0">
        {profile.avatar_url ? (
          <img
            src={profile.avatar_url}
            alt={profile.display_name}
            className="w-11 h-11 rounded-full object-cover"
          />
        ) : (
          <div className="w-11 h-11 rounded-full bg-primary text-on-primary text-sm font-bold flex items-center justify-center select-none">
            {getInitials(profile.display_name)}
          </div>
        )}
      </Link>
      <div className="flex-1 min-w-0">
        <Link href={profileHref}>
          <p className="text-sm font-semibold text-text truncate leading-tight">
            {profile.display_name}
          </p>
        </Link>
        <div className="flex items-center gap-1 mt-1">
          {rank ? (
            <span className="rank-badge text-[10px] leading-tight" style={rankStyle(rank)}>
              {ROLE_LABEL[role]}
            </span>
          ) : (
            <span className="text-[10px] px-1.5 py-px rounded-md font-medium leading-tight bg-surface-elevated text-muted">
              {ROLE_LABEL[role]}
            </span>
          )}
          <Link
            href="/settings"
            aria-label="Member settings"
            className="p-1 rounded-md text-subtle hover:text-primary-strong hover:bg-surface-elevated transition-colors"
          >
            <Settings className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </div>
  )
}

// ── Account dropdown (top-right) ──────────────────────────────────────────────
// Admin layer: account settings, billing, notifications, theme, sign out.
// Always shows initials. Keeps it feeling functional/admin vs. personal.

function AccountDropdown({
  profile,
  profileHref,
  role,
  themeLabel,
  ThemeIcon,
  cycleTheme,
}: {
  profile: Profile
  profileHref: string
  role: CommunityRole
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

  const showCrewLink = role === 'crew' || role === 'host' || role === 'guide' || role === 'mentor' || role === 'janitor'
  const showAdminLink = role === 'host' || role === 'guide' || role === 'mentor' || role === 'janitor'

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Account menu"
        aria-expanded={open}
        className="flex items-center justify-center w-8 h-8 rounded-full bg-surface-elevated text-muted text-[11px] font-semibold hover:bg-surface-elevated transition-colors select-none shrink-0"
      >
        {getInitials(profile.display_name)}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-60 rounded-xl border border-border bg-surface shadow-xl shadow-black/5 py-1 z-50 max-h-[80vh] overflow-y-auto">

          {/* Header */}
          <div className="px-3 py-2.5 border-b border-border">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-subtle mb-0.5">
              Account
            </p>
            <p className="text-sm font-semibold text-text truncate">
              {profile.display_name}
            </p>
            <p className="text-xs text-subtle truncate">@{profile.handle}</p>
          </div>

          {/* Identity & people links */}
          <div className="py-1">
            <Link
              href={profileHref}
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-3 py-2 text-sm text-text hover:bg-surface-elevated transition-colors"
            >
              <User className="w-4 h-4 text-subtle" />
              Profile
            </Link>
            <Link
              href="/friends"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-3 py-2 text-sm text-text hover:bg-surface-elevated transition-colors"
            >
              <UserPlus className="w-4 h-4 text-subtle" />
              Friends
            </Link>
          </div>

          {/* Crew + Admin. Role-gated */}
          {(showCrewLink || showAdminLink) && (
            <div className="border-t border-border py-1">
              {showCrewLink && (
                <Link
                  href="/crew"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2.5 px-3 py-2 text-sm text-text hover:bg-surface-elevated transition-colors"
                >
                  <Zap className="w-4 h-4 text-primary" />
                  Crew Dashboard
                </Link>
              )}
              {showAdminLink && (
                <Link
                  href="/admin"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2.5 px-3 py-2 text-sm text-text hover:bg-surface-elevated transition-colors"
                >
                  <Shield className="w-4 h-4 text-signal-strong" />
                  Admin
                </Link>
              )}
            </div>
          )}

          {/* Account links */}
          <div className="border-t border-border py-1">
            <Link
              href="/settings"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-3 py-2 text-sm text-text hover:bg-surface-elevated transition-colors"
            >
              <SlidersHorizontal className="w-4 h-4 text-subtle" />
              Account Settings
            </Link>
            <Link
              href="/settings/billing"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-3 py-2 text-sm text-text hover:bg-surface-elevated transition-colors"
            >
              <CreditCard className="w-4 h-4 text-subtle" />
              Billing & Plans
            </Link>
            <Link
              href="/settings/notifications"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-3 py-2 text-sm text-text hover:bg-surface-elevated transition-colors"
            >
              <BellRing className="w-4 h-4 text-subtle" />
              Notifications
            </Link>
          </div>

          {/* Theme */}
          <div className="border-t border-border py-1">
            <button
              onClick={() => { cycleTheme() }}
              className="flex items-center gap-2.5 px-3 py-2 text-sm text-text hover:bg-surface-elevated w-full text-left transition-colors"
            >
              <ThemeIcon className="w-4 h-4 text-subtle" />
              {themeLabel}
            </button>
          </div>

          {/* Sign out */}
          <div className="border-t border-border py-1">
            <form action="/auth/signout" method="POST">
              <button
                type="submit"
                className="flex items-center gap-2.5 px-3 py-2 text-sm text-danger hover:bg-danger-bg w-full text-left transition-colors"
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

// ── Shared nav items (used by desktop sidebar and mobile drawer) ──────────────

function NavLinkList({
  isActive,
  role,
  onNavigate,
}: {
  isActive: (href: string) => boolean
  role: CommunityRole
  onNavigate?: () => void
}) {
  const showCrew = role === 'crew' || role === 'host' || role === 'guide' || role === 'mentor' || role === 'janitor'
  const showAdmin = role === 'host' || role === 'guide' || role === 'mentor' || role === 'janitor'

  return (
    <>
      {SIDEBAR_NAV.map(({ href, label, Icon }) => {
        const active = isActive(href)
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              active
                ? 'bg-primary-bg text-primary-strong'
                : 'text-muted hover:bg-surface-elevated hover:text-text'
            }`}
          >
            <Icon
              className={`w-[18px] h-[18px] shrink-0 ${
                active ? 'text-primary-strong' : 'text-subtle'
              }`}
              strokeWidth={active ? 2.5 : 2}
            />
            {label}
          </Link>
        )
      })}

      {showCrew && (
        <Link
          href="/crew"
          onClick={onNavigate}
          className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
            isActive('/crew')
              ? 'bg-primary-bg text-primary-strong'
              : 'text-muted hover:bg-surface-elevated hover:text-text'
          }`}
        >
          <Zap
            className={`w-[18px] h-[18px] shrink-0 ${
              isActive('/crew') ? 'text-primary-strong' : 'text-subtle'
            }`}
            strokeWidth={isActive('/crew') ? 2.5 : 2}
          />
          Crew
        </Link>
      )}

      {showAdmin && (
        <Link
          href="/admin"
          onClick={onNavigate}
          className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
            isActive('/admin')
              ? 'bg-signal-bg text-signal-strong'
              : 'text-muted hover:bg-surface-elevated hover:text-text'
          }`}
        >
          <Shield
            className={`w-[18px] h-[18px] shrink-0 ${
              isActive('/admin') ? 'text-signal-strong' : 'text-subtle'
            }`}
            strokeWidth={isActive('/admin') ? 2.5 : 2}
          />
          Admin
        </Link>
      )}
    </>
  )
}

// ── Mobile left drawer ───────────────────────────────────────────────────────

function MobileLeftDrawer({
  open,
  onClose,
  role,
  isActive,
}: {
  open: boolean
  onClose: () => void
  role: CommunityRole
  isActive: (href: string) => boolean
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    if (open) window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <div
      className={`md:hidden fixed inset-0 z-50 ${open ? 'pointer-events-auto' : 'pointer-events-none'}`}
      aria-hidden={!open}
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        className={`absolute inset-0 bg-black/40 transition-opacity duration-200 ${
          open ? 'opacity-100' : 'opacity-0'
        }`}
      />

      {/* Panel. Narrowed to roughly the logo's footprint; close button lives at the bottom for thumb reach */}
      <aside
        role="dialog"
        aria-label="Navigation"
        className={`absolute inset-y-0 left-0 w-52 max-w-[75vw] bg-surface shadow-2xl flex flex-col transform transition-transform duration-200 ease-out ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="h-14 shrink-0 flex items-center px-4 border-b border-border">
          <Link href="/feed" onClick={onClose} className="flex items-center">
            <img src="/frequency-logo.png" alt="Frequency" className="h-7 w-auto dark:invert" />
          </Link>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
          <NavLinkList isActive={isActive} role={role} onNavigate={onClose} />
        </nav>

        {/* Bottom close. Sits in the thumb zone */}
        <div className="shrink-0 border-t border-border p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button
            onClick={onClose}
            aria-label="Close navigation"
            className="w-full flex items-center justify-center gap-2 rounded-lg bg-surface-elevated text-text text-sm font-medium py-3 hover:bg-border-strong transition-colors"
          >
            <X className="w-4 h-4" />
            Close
          </button>
        </div>
      </aside>
    </div>
  )
}

// ── Mobile profile bottom bar ────────────────────────────────────────────────
// Left tap → /settings · Right tap → /crew (gamified dashboard).

function ProfileBottomBar({
  profile,
  role,
}: {
  profile: Profile
  role: CommunityRole
}) {
  const seasonZaps = profile.current_season_zaps ?? 0
  const lifetimeGems = profile.lifetime_gems ?? 0
  const rank = ROLE_RANK[role]

  return (
    <nav
      className="md:hidden fixed inset-x-0 bottom-0 z-40 flex items-stretch bg-surface/95 backdrop-blur-sm border-t border-border"
      style={{
        height: 'calc(4rem + env(safe-area-inset-bottom))',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {/* Profile. Tap to open settings */}
      <Link
        href="/settings"
        aria-label="Open settings"
        className="flex flex-1 min-w-0 items-center gap-2.5 px-3 hover:bg-surface-elevated/50 transition-colors"
      >
        {profile.avatar_url ? (
          <img
            src={profile.avatar_url}
            alt={profile.display_name}
            className="w-9 h-9 rounded-full object-cover shrink-0"
          />
        ) : (
          <div className="w-9 h-9 rounded-full bg-primary text-on-primary text-xs font-bold flex items-center justify-center select-none shrink-0">
            {getInitials(profile.display_name)}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-text truncate leading-tight">
            {profile.display_name}
          </p>
          {rank ? (
            <span
              className="rank-badge mt-0.5 text-[9px] leading-tight"
              style={rankStyle(rank)}
            >
              {ROLE_LABEL[role]}
            </span>
          ) : (
            <span className="inline-block mt-0.5 text-[9px] px-1.5 py-px rounded-md font-medium bg-surface-elevated text-muted">
              {ROLE_LABEL[role]}
            </span>
          )}
        </div>
      </Link>

      {/* Divider */}
      <div className="w-px bg-border-strong my-3" aria-hidden="true" />

      {/* Rewards. Tap to open gamified dashboard */}
      <Link
        href="/crew"
        aria-label="Open rewards dashboard"
        className="flex items-center gap-3 px-4 hover:bg-surface-elevated/50 transition-colors"
      >
        <div className="flex items-center gap-1" title="Bolts (this season)">
          <Zap className="w-4 h-4 text-primary" strokeWidth={2.5} />
          <span className="text-sm font-bold text-text tabular-nums">
            {seasonZaps.toLocaleString()}
          </span>
        </div>
        <div className="flex items-center gap-1" title="Gems">
          <Gem className="w-4 h-4 text-signal" strokeWidth={2.5} />
          <span className="text-sm font-bold text-text tabular-nums">
            {lifetimeGems.toLocaleString()}
          </span>
        </div>
      </Link>
    </nav>
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
  const profileHref = `/people/${profile.handle}`
  const { theme, setTheme } = useTheme()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [lastPath, setLastPath] = useState(pathname)

  // Close mobile drawer when the route changes (covers browser back/forward).
  if (lastPath !== pathname) {
    setLastPath(pathname)
    if (drawerOpen) setDrawerOpen(false)
  }

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
    if (href === '/crew')     return pathname === '/crew' || pathname.startsWith('/crew/')
    if (href === '/search')   return pathname === '/search'
    return pathname === href || pathname.startsWith(href + '/')
  }

  // Hide right sidebar only where it would crowd or distract
  // /settings. Narrow focused forms
  // /messages/<id>. Chat thread needs full width; the index keeps the sidebar
  const showSidebar =
    !!sidebar &&
    !pathname.startsWith('/settings') &&
    !(pathname.startsWith('/messages/') && pathname !== '/messages')

  function cycleTheme() {
    if (theme === 'system') setTheme('dark')
    else if (theme === 'dark') setTheme('light')
    else setTheme('system')
  }

  const ThemeIcon = theme === 'dark' ? Moon : theme === 'system' ? Monitor : Sun
  const themeLabel =
    theme === 'dark' ? 'Dark mode' : theme === 'light' ? 'Light mode' : 'System theme'

  return (
    <div className="flex flex-col h-screen bg-canvas overflow-hidden">

      {/* ── Top bar ───────────────────────────────────────── */}
      <header className="h-14 shrink-0 flex items-stretch bg-surface/90 backdrop-blur-sm border-b border-border z-30">

        {/* Hamburger. Mobile only */}
        <button
          onClick={() => setDrawerOpen(true)}
          aria-label="Open navigation"
          aria-expanded={drawerOpen}
          className="md:hidden flex items-center justify-center px-4 text-muted hover:text-text transition-colors"
        >
          <Menu className="w-6 h-6" />
        </button>

        {/* Logo. Full-width header, no vertical divider */}
        <div className="flex items-center pl-1 pr-3 md:px-5">
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

          {/* Search pill. Desktop */}
          <Link
            href="/search"
            className="hidden sm:flex items-center gap-2 rounded-lg border border-border bg-surface-elevated px-3 py-1.5 text-sm text-muted hover:border-border-strong transition-colors mr-1"
          >
            <Search className="w-3.5 h-3.5" />
            <span>Search</span>
            <kbd className="text-[10px] rounded px-1 border border-border text-subtle">
              ⌘K
            </kbd>
          </Link>

          {/* Search icon. Mobile */}
          <Link
            href="/search"
            aria-label="Search"
            className="sm:hidden p-2 rounded-lg text-muted hover:text-text hover:bg-surface-elevated transition-colors"
          >
            <Search className="w-5 h-5" />
          </Link>

          {/* Messages */}
          <MessagesPopover />

          {/* Notifications */}
          <NotificationBell initialUnread={unreadCount} />

          {/* Account dropdown. Initials, admin/account layer */}
          <AccountDropdown
            profile={profile}
            profileHref={profileHref}
            role={role}
            themeLabel={themeLabel}
            ThemeIcon={ThemeIcon}
            cycleTheme={cycleTheme}
          />
        </div>
      </header>

      {/* ── Body ──────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* Left nav */}
        <aside className="hidden md:flex w-52 flex-col shrink-0 border-r border-border bg-surface/80 backdrop-blur-sm">

          {/* Primary nav */}
          <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
            <NavLinkList isActive={isActive} role={role} />
          </nav>

          {/* Upgrade to Crew CTA. Members only (not janitor) */}
          {role === 'member' && (
            <div className="mx-3 mb-3 rounded-xl border border-border bg-primary-bg p-3.5">
              <p className="text-xs font-semibold text-primary-strong mb-1">
                Upgrade to Crew
              </p>
              <p className="text-xs text-muted leading-snug mb-3">
                Get full access to the feed, events, and your group.
              </p>
              <a
                href="/upgrade"
                className="block text-center rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-on-primary hover:bg-primary-hover transition-colors"
              >
                Upgrade →
              </a>
            </div>
          )}

          {/* Profile card. Public identity anchor */}
          {/* Avatar · name · role badge → public profile · member settings */}
          {/* Grows into: points, rank, badges as we build out engagement */}
          <div className="border-t border-border p-3">
            <ProfileCard profile={profile} role={role} profileHref={profileHref} />
          </div>
        </aside>

        {/* Center + right column */}
        <div className="flex flex-1 min-h-0 min-w-0 overflow-hidden">

          {/* Page content */}
          <main className="flex-1 overflow-y-auto pb-[calc(4rem_+_env(safe-area-inset-bottom))] md:pb-0 min-w-0">
            <div className="w-full px-6 py-6">
              {children}
            </div>
          </main>

          {/* Right sidebar. Only on lg+, hidden on admin/settings */}
          {showSidebar && (
            <aside className="hidden lg:block w-72 shrink-0 overflow-y-auto border-l border-border bg-surface/80 backdrop-blur-sm">
              {sidebar}
            </aside>
          )}
        </div>
      </div>

      {/* ── Mobile bottom bar ─────────────────────────────── */}
      {/* Profile (→ /settings) · Bolts + Gems (→ /crew) */}
      <ProfileBottomBar profile={profile} role={role} />

      {/* ── Mobile left drawer ────────────────────────────── */}
      <MobileLeftDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        role={role}
        isActive={isActive}
      />

    </div>
  )
}
