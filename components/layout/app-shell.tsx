'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect, useRef } from 'react'
import {
  Globe,
  User,
  LogOut,
  Shield,
  Moon,
  Sun,
  Settings,
  Zap,
  Search,
  CreditCard,
  BellRing,
  SlidersHorizontal,
  UserPlus,
  Menu,
  X,
  Gem,
  Monitor,
  ChevronUp,
} from 'lucide-react'
import { getInitials } from '@/lib/utils'
import { NotificationBell } from '@/components/layout/notification-bell'
import { MessagesPopover } from '@/components/messages/messages-popover'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { ViewAsControl } from '@/components/layout/view-as-control'
import {
  type CommunityRole,
  ROLE_LABEL,
  roleBadgeStyle,
} from '@/lib/community-roles'
import { NAV_AREAS, meetsAccess, type NavAccess } from '@/lib/nav-areas'
import type { ProfileIdentity } from '@/lib/types/profile'
import { PrimaryNav } from '@/components/layout/primary-nav'
import { BrandMark } from '@/components/layout/brand-mark'
import { AREA_ICONS } from '@/components/layout/nav-icons'
import { UpgradeCrew } from '@/components/layout/upgrade-crew'
import { DockRevealProvider, useDockRevealed, useHoverScrollReveal } from '@/components/sidebar/dock-reveal'

// The sidebar + community bar are built from NAV_AREAS (lib/nav-areas.ts — the
// single source of truth shared with the permission grid). The whole menu is
// ALWAYS shown; an item the viewer can't reach renders muted (greyed, non-
// clickable). Each area's access level can be overridden per-area from
// /admin/roles; those overrides are passed in via the `permissions` prop and
// merged on top of the code defaults. To add/move a link or change its baseline
// access (or placement), edit lib/nav-areas.ts; to give it an icon, add a key in
// components/layout/nav-icons.ts.

type MainNavItem = {
  key: string
  href: string
  label: string
  Icon: React.ElementType
  defaultAccess: NavAccess
  /** Below-access viewers may still click through to a muted preview. */
  preview?: boolean
}

type NavSectionGroup = { label: string | null; items: MainNavItem[] }

// Group a list of areas into ordered sections, preserving declaration order.
function buildSections(areas: typeof NAV_AREAS[number][]): NavSectionGroup[] {
  const sections: NavSectionGroup[] = []
  for (const area of areas) {
    const item: MainNavItem = {
      key: area.key,
      href: area.href,
      label: area.label,
      Icon: AREA_ICONS[area.key] ?? Globe,
      defaultAccess: area.defaultAccess,
      preview: area.previewBelowAccess,
    }
    const last = sections[sections.length - 1]
    if (last && last.label === area.section) last.items.push(item)
    else sections.push({ label: area.section, items: [item] })
  }
  return sections
}

// One vertical rail holds every destination: Feed + Messages (the home anchors,
// pinned top), then the three pillars — Community, The Quest, Network — and
// finally Manage (admin), grouped by section. Sections and their order are
// derived entirely from NAV_AREAS (no hardcoded section list). The desktop rail
// and the mobile drawer render the same set.
const NAV_SECTIONS = buildSections([...NAV_AREAS])

// The effective access for an area = a janitor's per-area override, if any,
// else the code default. `role` is the viewer's community role (null = visitor).
function effectiveAccess(
  item: MainNavItem,
  permissions: Record<string, NavAccess> | undefined,
): NavAccess {
  return permissions?.[item.key] ?? item.defaultAccess
}

interface Profile extends ProfileIdentity {
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
  realRole,
  profileHref,
  previewVisitor = false,
}: {
  profile: Profile
  role: CommunityRole
  /** True DB role (ignores any view-as override) — gates the janitor control. */
  realRole: CommunityRole
  profileHref: string
  /** Janitor previewing as a logged-out visitor — show a "Visitor" chip. */
  previewVisitor?: boolean
}) {
  // Pinned at the bottom of the (non-scrolling) left rail, so it stays put on a
  // long scroll. The quick-actions panel rises when the feed reaches its end
  // (shared reveal), on a hover-scroll over the card, or on tapping the chevron.
  const [manualOpen, setManualOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const revealed = useDockRevealed()
  const hoverOpen = useHoverScrollReveal(rootRef)
  const open = manualOpen || revealed || hoverOpen

  return (
    <div ref={rootRef} className="border-t border-border">
      {/* Compact identity bar — matched in height to the right stats bar.
          Stays on top; the quick actions fill in underneath it. */}
      <div className="flex items-center gap-2.5 px-3 py-3.5">
        <Link href={profileHref} className="shrink-0" data-tour-anchor="avatar">
          {profile.avatar_url ? (
            <Image
              src={profile.avatar_url}
              alt={profile.display_name}
              width={44}
              height={44}
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
          {previewVisitor ? (
            <span className="mt-1 inline-block rounded-full bg-surface-elevated px-2 py-0.5 text-[10px] font-semibold leading-tight text-muted">
              Visitor
            </span>
          ) : (
            <span
              className="rank-badge mt-1 inline-block text-[10px] leading-tight"
              style={roleBadgeStyle(role)}
            >
              {ROLE_LABEL[role]}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setManualOpen((v) => !v)}
          aria-expanded={open}
          aria-label={open ? 'Collapse profile menu' : 'Expand profile menu'}
          className="shrink-0 p-1.5 rounded-md text-subtle hover:text-primary-strong hover:bg-surface-elevated transition-colors"
        >
          <ChevronUp className={`w-4 h-4 transition-transform duration-300 ${open ? '' : 'rotate-180'}`} />
        </button>
      </div>

      {/* Quick actions — rise underneath the bar in sync with the right stats
          dock. View-as (janitor only) leads the menu. */}
      <div
        className={`grid transition-[grid-template-rows] duration-500 ease-out motion-reduce:transition-none ${
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        }`}
      >
        <div className="overflow-hidden">
          <div className="px-2 pb-3 space-y-0.5">
            {/* Janitor-only "view as role" — first item; opens upward via portal. */}
            <ViewAsControl realRole={realRole} currentRole={role} asVisitor={previewVisitor} />
            <Link
              href={profileHref}
              className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm font-medium text-text hover:bg-surface-elevated transition-colors"
            >
              <User className="w-4 h-4 text-muted shrink-0" />
              View profile
            </Link>
            <Link
              href="/settings"
              className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm font-medium text-text hover:bg-surface-elevated transition-colors"
            >
              <Settings className="w-4 h-4 text-muted shrink-0" />
              Settings
            </Link>
            <form action="/auth/signout" method="POST">
              <button
                type="submit"
                className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm font-medium text-danger hover:bg-danger-bg transition-colors"
              >
                <LogOut className="w-4 h-4 shrink-0" />
                Sign out
              </button>
            </form>
          </div>
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

  const showCrewLink = role === 'crew' || role === 'host' || role === 'guide' || role === 'mentor' || role === 'admin' || role === 'janitor'
  const showAdminLink = role === 'host' || role === 'guide' || role === 'mentor' || role === 'admin' || role === 'janitor'

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Account menu"
        aria-expanded={open}
        className="flex items-center justify-center w-8 h-8 rounded-full bg-surface-elevated text-muted text-[11px] font-semibold ring-1 ring-border hover:text-text hover:ring-border-strong transition-colors select-none shrink-0"
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
                  Dashboard
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

export type NavSection = {
  label: string | null
  items: { href: string; label: string; Icon: React.ElementType }[]
}

function NavLinkList({
  isActive,
  role,
  onNavigate,
  extraSections,
  hideAppNav = false,
  permissions,
  sections = NAV_SECTIONS,
}: {
  isActive: (href: string) => boolean
  /** Gating role; null = visitor (the janitor's "view as visitor" preview). */
  role: CommunityRole | null
  onNavigate?: () => void
  extraSections?: NavSection[]
  hideAppNav?: boolean
  /** Per-area access overrides (janitor-set); merged over code defaults. */
  permissions?: Record<string, NavAccess>
  /** Which area sections to render. Defaults to the full rail (NAV_SECTIONS). */
  sections?: NavSectionGroup[]
}) {
  // `emphasize` = the home anchor (Feed): always the brand's dark brown and bold,
  // active or not, so it reads as the rail's permanent "home".
  const itemClass = (active: boolean, emphasize = false) =>
    `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
      emphasize
        ? `font-bold text-[var(--brand-mark)] ${active ? 'bg-primary-bg' : 'hover:bg-surface-elevated'}`
        : active
          ? 'bg-primary-bg text-primary-strong font-semibold'
          : 'text-muted font-medium hover:bg-surface-elevated hover:text-text'
    }`

  const sectionLabelClass =
    'px-3 pt-1 pb-1 text-[10px] font-semibold uppercase tracking-wider text-subtle'

  return (
    <>
      {!hideAppNav && sections.map((section, i) => {
        // The leading label-less group is the home anchor (Feed): set it apart
        // from the destination groups with a hairline below and bolder items.
        const isHomeAnchor = i === 0 && section.label === null
        return (
        <div
          key={section.label ?? `top-${i}`}
          className={`space-y-0.5 ${i > 0 ? 'mt-2' : ''} ${isHomeAnchor ? 'pb-2 mb-1 border-b border-border' : ''}`}
        >
          {section.label && <p className={sectionLabelClass}>{section.label}</p>}
          {section.items.map((item) => {
            const { href, label, Icon } = item
            // Whole menu always shows; mute what the viewer can't reach — EXCEPT the
            // Manage section, whose entries are operator consoles, not aspirational
            // member features. There we telescope (hide) so the rail stays tight and
            // a host isn't shown five greyed-out janitor tools.
            const reachable = meetsAccess(effectiveAccess(item, permissions), role)
            if (!reachable && section.label === 'Manage') return null
            // Preview-able areas (the Quest) stay CLICKABLE but read as a muted
            // "dead" state for below-access viewers; the page gates engagement.
            if (!reachable && item.preview) {
              const active = isActive(href)
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={onNavigate}
                  title="Preview — upgrade to Crew to engage"
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    active ? 'bg-surface-elevated text-muted' : 'text-subtle hover:bg-surface-elevated hover:text-muted'
                  }`}
                >
                  <Icon className="h-[18px] w-[18px] shrink-0 text-subtle" strokeWidth={2} />
                  {label}
                </Link>
              )
            }
            if (!reachable) {
              return (
                <div
                  key={href}
                  aria-disabled="true"
                  title="You don't have access to this yet"
                  className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-subtle opacity-50 cursor-not-allowed select-none"
                >
                  <Icon className="w-[18px] h-[18px] shrink-0 text-subtle" strokeWidth={2} />
                  {label}
                </div>
              )
            }
            const active = isActive(href)
            return (
              <Link key={href} href={href} onClick={onNavigate} className={itemClass(active, isHomeAnchor)}>
                <Icon
                  className={`w-[18px] h-[18px] shrink-0 ${isHomeAnchor ? 'text-[var(--brand-mark)]' : active ? 'text-primary-strong' : 'text-subtle'}`}
                  strokeWidth={active || isHomeAnchor ? 2.5 : 2}
                />
                {label}
              </Link>
            )
          })}
        </div>
        )
      })}

      {extraSections?.map((section, i) => (
        <div key={`extra-${section.label ?? i}`} className="space-y-0.5 mt-2">
          {section.label && <p className={sectionLabelClass}>{section.label}</p>}
          {section.items.map(({ href, label, Icon }) => {
            const active = isActive(href)
            return (
              <Link key={href} href={href} onClick={onNavigate} className={itemClass(active)}>
                <Icon
                  className={`w-[18px] h-[18px] shrink-0 ${active ? 'text-primary-strong' : 'text-subtle'}`}
                  strokeWidth={active ? 2.5 : 2}
                />
                {label}
              </Link>
            )
          })}
        </div>
      ))}

    </>
  )
}

// ── Mobile left drawer ───────────────────────────────────────────────────────

function MobileLeftDrawer({
  open,
  onClose,
  role,
  isActive,
  extraSections,
  hideAppNav = false,
  permissions,
}: {
  open: boolean
  onClose: () => void
  role: CommunityRole | null
  isActive: (href: string) => boolean
  extraSections?: NavSection[]
  hideAppNav?: boolean
  permissions?: Record<string, NavAccess>
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
            <Image src="/frequency-logo.png" alt="Frequency" width={963} height={170} className="h-7 w-auto dark:invert" />
          </Link>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
          <NavLinkList isActive={isActive} role={role} onNavigate={onClose} extraSections={extraSections} hideAppNav={hideAppNav} permissions={permissions} sections={NAV_SECTIONS} />
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
          <Image
            src={profile.avatar_url}
            alt={profile.display_name}
            width={36}
            height={36}
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
          <span
            className="rank-badge mt-0.5 text-[9px] leading-tight"
            style={roleBadgeStyle(role)}
          >
            {ROLE_LABEL[role]}
          </span>
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
  realRole,
  previewVisitor = false,
  children,
  sidebar,
  ticker,
  unreadCount = 0,
  extraSections,
  hideAppNav = false,
  permissions,
}: {
  profile: Profile
  /** True DB role, ignoring any view-as override. Defaults to the (effective)
   *  profile role, so the janitor control only appears for actual janitors. */
  realRole?: CommunityRole
  /** Janitor previewing the logged-out visitor experience — gates the nav as a
   *  visitor and flips the identity chrome to "Visitor". */
  previewVisitor?: boolean
  children: React.ReactNode
  sidebar?: React.ReactNode
  /** Community news ticker pinned above the page content (streamed via Suspense). */
  ticker?: React.ReactNode
  unreadCount?: number
  extraSections?: NavSection[]
  hideAppNav?: boolean
  /** Per-area access overrides (janitor-set); merged over code defaults. */
  permissions?: Record<string, NavAccess>
}) {
  const pathname = usePathname()
  const router = useRouter()
  const role = (profile.community_role ?? 'member') as CommunityRole
  const effectiveRealRole = realRole ?? role
  // Nav gating role: a visitor preview gates as a logged-out visitor (null).
  const gateRole: CommunityRole | null = previewVisitor ? null : role
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
    if (href === '/marketing') return pathname === '/marketing'
    if (href === '/feed')     return pathname === '/feed'
    if (href === '/circles')  return pathname === '/circles' || pathname.startsWith('/circles/') || pathname.startsWith('/hubs/') || pathname.startsWith('/nexuses/')
    if (href === '/channels') return pathname === '/channels' || pathname.startsWith('/channels/')
    if (href === '/messages') return pathname === '/messages' || pathname.startsWith('/messages/')
    if (href === '/settings') return pathname === '/settings' || pathname.startsWith('/settings/')
    // Dashboard (/crew) is the section root; its siblings /crew/quests and
    // /crew/store are their own rail items, so match /crew exactly and let those
    // sub-routes light up their own entry via the generic prefix rule below.
    if (href === '/crew')     return pathname === '/crew'
    if (href === '/search')   return pathname === '/search'
    return pathname === href || pathname.startsWith(href + '/')
  }

  // Scope-aware rail (PAGE-FRAMEWORK §4): the GLOBAL rail shows on global/index
  // pages. Entity DETAIL pages render their own scope-scoped rail in the page body
  // (members/events for that circle, etc.), so the global rail is suppressed there
  // to avoid the double-sidebar trap. A detail route = one path segment past the
  // section (e.g. /circles/<slug>, /people/<handle>, /channels/<id>), while the
  // index (/circles) keeps the global rail.
  // Only sections whose detail page renders its own scoped right column.
  // Circle + channel detail render their own scope-scoped rail in the page body,
  // so the global rail is suppressed there. Profiles now use the standard global
  // rail (the person's own gamification lives in their header), so /people/ is
  // intentionally NOT in this list.
  const SCOPED_SECTIONS = ['/circles/', '/channels/']
  const isEntityDetail = SCOPED_SECTIONS.some(
    (s) => pathname.startsWith(s) && pathname.slice(s.length).length > 0,
  )

  // Hide right sidebar only where it would crowd or distract:
  // /settings (narrow focused forms); /messages/<id> (chat needs full width);
  // /marketing (a wide workspace with its own tab bar); entity detail pages.
  const showSidebar =
    !!sidebar &&
    !pathname.startsWith('/settings') &&
    !pathname.startsWith('/marketing') &&
    !(pathname.startsWith('/messages/') && pathname !== '/messages') &&
    !isEntityDetail

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

        {/* Engraved, interactive wordmark. Full-width header, no vertical divider */}
        <BrandMark />

        {/* Full-site browse nav (Discover + About dropdowns) beside the logo —
            the same component the splash/site uses. In the app shell we're in
            "community mode", so it fades back to keep attention on the community
            sub-menu below; hovering or focusing it brings it fully forward so
            members can still browse the wider site with ease. Desktop only. */}
        {!hideAppNav && (
          <div className="hidden md:flex items-stretch ml-1 opacity-40 hover:opacity-100 focus-within:opacity-100 transition-opacity duration-300 motion-reduce:transition-none">
            <PrimaryNav audience="member" variant="light" showDiscover={false} />
          </div>
        )}

        {/* Right cluster: search · [messages · notifications] · account.
            Three groups, each set off by a hairline so the icons read as one
            tidy block of community actions and the account stays distinct. */}
        <div className="flex flex-1 items-center justify-end gap-1.5 px-3 md:gap-2 md:px-4">

          {/* Search pill. Desktop */}
          <Link
            href="/search"
            className="hidden sm:flex items-center gap-2 rounded-full border border-border bg-surface-elevated/70 pl-3 pr-2 py-1.5 text-sm text-muted hover:text-text hover:border-border-strong hover:bg-surface-elevated transition-colors"
          >
            <Search className="w-4 h-4" />
            <span>Search</span>
            <kbd className="text-[10px] leading-none rounded px-1.5 py-1 border border-border bg-surface text-subtle">
              ⌘K
            </kbd>
          </Link>

          {/* Search icon. Mobile */}
          <Link
            href="/search"
            aria-label="Search"
            className="sm:hidden flex items-center justify-center w-9 h-9 rounded-full text-muted hover:text-text hover:bg-surface-elevated transition-colors"
          >
            <Search className="w-5 h-5" />
          </Link>

          {/* Community actions — messages + notifications, set off by a divider */}
          <div className="flex items-center gap-0.5 sm:ml-1 sm:pl-1.5 sm:border-l sm:border-border">
            <MessagesPopover />
            <NotificationBell initialUnread={unreadCount} />
          </div>

          {/* Account — distinct, with its own divider */}
          <div className="flex items-center ml-1 pl-1.5 border-l border-border">
            <AccountDropdown
              profile={profile}
              profileHref={profileHref}
              role={role}
              themeLabel={themeLabel}
              ThemeIcon={ThemeIcon}
              cycleTheme={cycleTheme}
            />
          </div>
        </div>
      </header>

      {/* ── Body ──────────────────────────────────────────── */}
      {/* DockRevealProvider runs the single shared scroll listener that rises
          both bottom docks together (left profile, right stats). */}
      <DockRevealProvider>
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* Left nav */}
        <aside className="hidden md:flex w-52 flex-col shrink-0 border-r border-border bg-surface/80 backdrop-blur-sm">

          {/* Community spaces + features + admin rail (the Broadcast bar lives up top) */}
          <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
            <NavLinkList isActive={isActive} role={gateRole} extraSections={extraSections} hideAppNav={hideAppNav} permissions={permissions} />
          </nav>

          {/* Upgrade to Crew. Non-paying members only; one-time pitch that
              collapses to a slim "Upgrade" tab above the profile card. */}
          {!hideAppNav && role === 'member' && <UpgradeCrew />}

          {/* Profile card. Public identity anchor.
              Avatar · name · role badge → public profile · member settings.
              Rises to show quick actions when the feed scroll hits the bottom. */}
          <ProfileCard profile={profile} role={role} realRole={effectiveRealRole} profileHref={profileHref} previewVisitor={previewVisitor} />
        </aside>

        {/* Center + right column — ONE shared scroll container (no per-column
            scroll boxes). The feed and the rail live in the same scroll and
            move together: the rail scrolls up with the feed, and once the rail
            runs out the feed keeps going (right side just shows the divider);
            scrolling back up brings the rail back. Normal flow, no sticky. */}
        <div data-feed-scroll className="flex-1 min-w-0 overflow-y-auto pb-[calc(4rem_+_env(safe-area-inset-bottom))] md:pb-0">
          <div className="flex items-stretch min-h-full">

            {/* Center column — an ambient dispatch ticker pinned on top, then the
                page content. Navigation lives entirely in the single left rail
                (Feed + sections); the right rail sits beside this in the shared
                scroll. */}
            <div className="flex-1 min-w-0 flex flex-col">
              {!hideAppNav && ticker}
              <main className="flex-1 min-w-0 px-4 py-6 sm:px-6" data-tour-anchor="content">
                <Breadcrumbs />
                {children}
              </main>
            </div>

            {/* Right sidebar. Only on lg+, hidden on admin/settings.
                The <aside> spans the full content height (flex column) so the
                rail's top widgets scroll up and out, bringing the stats dock up
                into view as you near the end; its left border is a full-height
                divider. */}
            {showSidebar && (
              <aside className="hidden lg:flex flex-col w-72 shrink-0 border-l border-border">
                {sidebar}
              </aside>
            )}
          </div>
        </div>
      </div>
      </DockRevealProvider>

      {/* ── Mobile bottom bar ─────────────────────────────── */}
      {/* Profile (→ /settings) · Bolts + Gems (→ /crew) */}
      <ProfileBottomBar profile={profile} role={role} />

      {/* ── Mobile left drawer ────────────────────────────── */}
      <MobileLeftDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        role={gateRole}
        isActive={isActive}
        extraSections={extraSections}
        hideAppNav={hideAppNav}
        permissions={permissions}
      />

    </div>
  )
}
