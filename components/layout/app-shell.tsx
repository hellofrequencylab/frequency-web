'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
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
  Camera,
  Users,
  Menu,
  X,
  Gem,
  Monitor,
  ChevronUp,
  ChevronRight,
  ChevronLeft,
  QrCode,
  Megaphone,
  HelpCircle,
  PanelLeft,
  PanelRight,
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
import { NAV_AREAS, meetsAccess, meetsStaff, type NavAccess } from '@/lib/nav-areas'
import type { StaffRole } from '@/lib/staff'
import type { ProfileIdentity } from '@/lib/types/profile'
import { PrimaryNav } from '@/components/layout/primary-nav'
import { BrandMark } from '@/components/layout/brand-mark'
import { AREA_ICONS } from '@/components/layout/nav-icons'
import { UpgradeCrew } from '@/components/layout/upgrade-crew'
import { DemoToggle } from '@/components/layout/demo-toggle'
import { DockRevealProvider, useDockRevealed, useHoverScrollReveal } from '@/components/sidebar/dock-reveal'
import { railFor } from '@/lib/layout/page-chrome'
import { SearchOverlay } from '@/components/search/search-overlay'

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
  /** Min staff role (team_members) that also unlocks this item. */
  staffAccess?: StaffRole
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
      staffAccess: area.staffAccess,
    }
    const last = sections[sections.length - 1]
    if (last && last.label === area.section) last.items.push(item)
    else sections.push({ label: area.section, items: [item] })
  }
  return sections
}

// One vertical rail holds every destination: Feed (home anchor, pinned top), then
// the two worlds — Community and The Quest — and finally Manage (Steward + Platform),
// grouped by section. Sections and their order are derived entirely from NAV_AREAS
// (no hardcoded section list). The desktop rail and mobile drawer render the same set.
const NAV_SECTIONS = buildSections([...NAV_AREAS])

// The Manage sections TELESCOPE: an item the viewer can't reach is hidden (not
// muted), and a group with nothing reachable is skipped entirely (header included)
// — so a member never sees empty admin headers and a host isn't shown greyed-out
// janitor tools. Member worlds (Community, The Quest) still mute/preview instead,
// as aspirational surfaces.
const TELESCOPE_SECTIONS = new Set(['Steward', 'Platform'])

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
            <Link
              href="/codes"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-3 py-2 text-sm text-text hover:bg-surface-elevated transition-colors"
            >
              <QrCode className="w-4 h-4 text-subtle" />
              My code
            </Link>
            {showCrewLink && (
              <Link
                href="/entry-points"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 px-3 py-2 text-sm text-text hover:bg-surface-elevated transition-colors"
              >
                <Megaphone className="w-4 h-4 text-subtle" />
                Entry points
              </Link>
            )}
            <Link
              href="/help"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-3 py-2 text-sm text-text hover:bg-surface-elevated transition-colors"
            >
              <HelpCircle className="w-4 h-4 text-subtle" />
              Help
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
  staffRole = null,
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
  /** Viewer's staff role (team_members axis); unlocks Studio independent of trust. */
  staffRole?: StaffRole | null
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
        // Admin sections telescope: keep only reachable items, and skip the whole
        // group (header included) when nothing is reachable.
        const adminSection = TELESCOPE_SECTIONS.has(section.label ?? '')
        const visibleItems = adminSection
          ? section.items.filter(
              (it) => meetsAccess(effectiveAccess(it, permissions), role) || meetsStaff(it, staffRole),
            )
          : section.items
        if (visibleItems.length === 0) return null
        return (
        <div
          key={section.label ?? `top-${i}`}
          className={`space-y-0.5 ${i > 0 ? 'mt-2' : ''} ${isHomeAnchor ? 'pb-2 mb-1 border-b border-border' : ''}`}
        >
          {section.label && <p className={sectionLabelClass}>{section.label}</p>}
          {visibleItems.map((item) => {
            const { href, label, Icon } = item
            // Member worlds always show (muting/preview below); admin sections were
            // pre-filtered to reachable items above.
            const reachable = meetsAccess(effectiveAccess(item, permissions), role) || meetsStaff(item, staffRole)
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
              <Link key={href} href={href} onClick={onNavigate} data-tour-anchor={`nav-${item.key}`} className={itemClass(active, isHomeAnchor)}>
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

// A labeled on/off switch row (used for the edge-rail preferences in the drawer).
function RailToggle({
  label,
  Icon,
  on,
  onChange,
}: {
  label: string
  Icon: React.ElementType
  on: boolean
  onChange: (on: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm font-medium text-text hover:bg-surface-elevated transition-colors"
    >
      <span className="flex items-center gap-2.5">
        <Icon className="h-4 w-4 text-muted shrink-0" />
        {label}
      </span>
      <span
        aria-hidden
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${on ? 'bg-primary' : 'bg-border-strong'}`}
      >
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-surface shadow-sm transition-transform ${on ? 'translate-x-4' : 'translate-x-0.5'}`} />
      </span>
    </button>
  )
}

// ── Mobile left drawer ───────────────────────────────────────────────────────

function MobileLeftDrawer({
  open,
  onClose,
  role,
  identityRole,
  profile,
  profileHref,
  isActive,
  extraSections,
  hideAppNav = false,
  permissions,
  staffRole = null,
  railNavOn,
  statsRailOn,
  onSetRail,
}: {
  open: boolean
  onClose: () => void
  role: CommunityRole | null
  /** The viewer's actual community role — drives the identity badge (not gated). */
  identityRole: CommunityRole
  profile: Profile
  profileHref: string
  isActive: (href: string) => boolean
  extraSections?: NavSection[]
  hideAppNav?: boolean
  permissions?: Record<string, NavAccess>
  staffRole?: StaffRole | null
  /** Edge-rail preferences (mobile) + setter — turns each rail back on. */
  railNavOn: boolean
  statsRailOn: boolean
  onSetRail: (key: 'freq-rail-nav' | 'freq-stats-rail', on: boolean) => void
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

      {/* Panel. The full menu now lives here (the bottom tab bar holds the primary
          destinations); it leads with the viewer's identity + rewards, then the
          full nav, and a thumb-reach close at the bottom. */}
      <aside
        role="dialog"
        aria-label="Navigation"
        className={`absolute inset-y-0 left-0 w-64 max-w-[82vw] bg-surface shadow-2xl flex flex-col transform transition-transform duration-200 ease-out ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="h-14 shrink-0 flex items-center px-4 border-b border-border">
          <Link href="/feed" onClick={onClose} className="flex items-center">
            <Image src="/frequency-logo.png" alt="Frequency" width={963} height={170} className="h-7 w-auto dark:invert" />
          </Link>
        </div>

        {/* Identity + rewards — the bits that used to sit in the bottom bar. Tap the
            card for your profile, the pill for your Dashboard. */}
        <div className="shrink-0 border-b border-border px-3 py-3">
          <Link
            href={profileHref}
            onClick={onClose}
            className="flex items-center gap-2.5 rounded-lg p-1 -m-1 hover:bg-surface-elevated transition-colors"
          >
            {profile.avatar_url ? (
              <Image
                src={profile.avatar_url}
                alt={profile.display_name}
                width={40}
                height={40}
                className="h-10 w-10 rounded-full object-cover shrink-0"
              />
            ) : (
              <div className="h-10 w-10 rounded-full bg-primary text-on-primary text-sm font-bold flex items-center justify-center select-none shrink-0">
                {getInitials(profile.display_name)}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-text truncate leading-tight">
                {profile.display_name}
              </p>
              <span
                className="rank-badge mt-0.5 inline-block text-[10px] leading-tight"
                style={roleBadgeStyle(identityRole)}
              >
                {ROLE_LABEL[identityRole]}
              </span>
            </div>
          </Link>
          <Link
            href="/crew"
            onClick={onClose}
            aria-label="Open rewards dashboard"
            className="mt-2.5 flex items-center justify-center gap-5 rounded-lg bg-surface-elevated py-2 hover:bg-border-strong transition-colors"
          >
            <span className="flex items-center gap-1.5" title="Bolts (this season)">
              <Zap className="w-4 h-4 text-primary" strokeWidth={2.5} />
              <span className="text-sm font-bold text-text tabular-nums">
                {(profile.current_season_zaps ?? 0).toLocaleString()}
              </span>
            </span>
            <span className="flex items-center gap-1.5" title="Gems">
              <Gem className="w-4 h-4 text-signal" strokeWidth={2.5} />
              <span className="text-sm font-bold text-text tabular-nums">
                {(profile.lifetime_gems ?? 0).toLocaleString()}
              </span>
            </span>
          </Link>
        </div>

        {/* Edge-rail preferences — turn the bracketing nav + stats rails on/off. */}
        <div className="shrink-0 border-b border-border px-3 py-2 space-y-0.5">
          <RailToggle
            label="Left nav rail"
            Icon={PanelLeft}
            on={railNavOn}
            onChange={(on) => onSetRail('freq-rail-nav', on)}
          />
          <RailToggle
            label="Right stats rail"
            Icon={PanelRight}
            on={statsRailOn}
            onChange={(on) => onSetRail('freq-stats-rail', on)}
          />
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
          <NavLinkList isActive={isActive} role={role} onNavigate={onClose} extraSections={extraSections} hideAppNav={hideAppNav} permissions={permissions} staffRole={staffRole} sections={NAV_SECTIONS} />
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

// ── Mobile bottom tab bar ─────────────────────────────────────────────────────
// The primary destinations, thumb-reachable along the bottom (the most native
// mobile pattern). The last tab — Menu — opens the full drawer (identity, rewards,
// and the long-tail nav). Keeps full content width: nothing is permanently eaten
// from the side of an already-narrow phone screen.

// The four core community destinations that earn a fixed tab. Everything else
// (The Quest, Manage, settings…) lives one tap away under Menu. Icons come from
// AREA_ICONS so the tab bar stays in lockstep with the rail/drawer.
const MOBILE_TABS: { key: string; href: string; label: string }[] = [
  { key: 'feed', href: '/feed', label: 'Feed' },
  { key: 'circles', href: '/circles', label: 'Circles' },
  { key: 'channels', href: '/channels', label: 'Channels' },
  { key: 'events', href: '/events', label: 'Events' },
]

function MobileTabBar({
  isActive,
  onOpenMenu,
  menuOpen,
  hideAppNav = false,
}: {
  isActive: (href: string) => boolean
  onOpenMenu: () => void
  menuOpen: boolean
  /** Stripped shells (e.g. Studio) hide the app destinations; only Menu remains. */
  hideAppNav?: boolean
}) {
  const tabClass = (active: boolean) =>
    `flex flex-1 flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors ${
      active ? 'text-primary-strong' : 'text-muted hover:text-text'
    }`

  return (
    <nav
      className="md:hidden fixed inset-x-0 bottom-0 z-40 flex items-stretch bg-surface/95 backdrop-blur-sm border-t border-border"
      style={{
        height: 'calc(4rem + env(safe-area-inset-bottom))',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {!hideAppNav && MOBILE_TABS.map((tab) => {
        const Icon = AREA_ICONS[tab.key] ?? Globe
        const active = isActive(tab.href)
        return (
          <Link key={tab.key} href={tab.href} aria-label={tab.label} className={tabClass(active)}>
            <Icon className="h-[22px] w-[22px]" strokeWidth={active ? 2.5 : 2} />
            <span className="leading-none">{tab.label}</span>
          </Link>
        )
      })}
      <button
        type="button"
        onClick={onOpenMenu}
        aria-label="Open menu"
        aria-expanded={menuOpen}
        className={tabClass(menuOpen)}
      >
        <Menu className="h-[22px] w-[22px]" strokeWidth={menuOpen ? 2.5 : 2} />
        <span className="leading-none">Menu</span>
      </button>
    </nav>
  )
}

// ── Mobile edge rails (left nav · right stats) ────────────────────────────────
// Both bracket the feed with the SAME behavior, driven by feed scroll:
//   • at the TOP of scroll → hidden (nothing shows);
//   • scrolled INTO the feed → a tall (33vh), very-light tab slides onto the edge.
//     It's an OVERLAY (doesn't push the content) — it just floats over the margin;
//   • tap the tab → the side menu opens (left = nav, right = stats);
//   • it's a "one-use" menu: selecting a link OR clicking anywhere (menu or the
//     backdrop) closes it; scrolling also snaps it shut.
// On/off is a per-device setting in the Menu drawer. Mobile only — desktop uses the
// real rails.

function useRailReveal(enabled: boolean) {
  const [scrolledIn, setScrolledIn] = useState(false)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    if (!enabled) return
    const el = document.querySelector('[data-feed-scroll]') as HTMLElement | null
    if (!el) return
    let lastTop = el.scrollTop
    const onScroll = () => {
      const top = el.scrollTop
      const moved = Math.abs(top - lastTop) > 4
      lastTop = top
      setScrolledIn(top > 80) // hidden at the top; the tab floats in once scrolled
      if (moved) setExpanded(false) // any scroll closes the open menu
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [enabled])

  return { scrolledIn, expanded, setExpanded }
}

// The tall, very-light edge tab that floats in on scroll (doesn't push content).
function EdgeTab({ side, show, onOpen }: { side: 'left' | 'right'; show: boolean; onOpen: () => void }) {
  const Chevron = side === 'left' ? ChevronRight : ChevronLeft
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="Open menu"
      className={`md:hidden fixed top-1/2 z-20 flex h-[33vh] w-7 -translate-y-1/2 items-center justify-center border border-border/50 bg-surface/40 text-muted backdrop-blur-sm transition-[transform,opacity] duration-300 ease-out motion-reduce:transition-none ${
        side === 'left' ? 'left-0 rounded-r-2xl border-l-0' : 'right-0 rounded-l-2xl border-r-0'
      } ${
        show
          ? 'translate-x-0 opacity-50 hover:opacity-100'
          : `${side === 'left' ? '-translate-x-full' : 'translate-x-full'} opacity-0 pointer-events-none`
      }`}
    >
      <Chevron className="h-4 w-4" />
    </button>
  )
}

function MobileSideRail({
  isActive,
  onOpenMenu,
  enabled,
}: {
  isActive: (href: string) => boolean
  onOpenMenu: () => void
  enabled: boolean
}) {
  const { scrolledIn, expanded, setExpanded } = useRailReveal(enabled)
  if (!enabled) return null

  const itemClass = (active: boolean) =>
    `flex items-center gap-3 rounded-xl px-2.5 py-2 text-sm font-medium transition-colors ${
      active ? 'bg-primary-bg text-primary-strong' : 'text-muted hover:bg-surface-elevated hover:text-text'
    }`

  return (
    <>
      <EdgeTab side="left" show={scrolledIn && !expanded} onOpen={() => setExpanded(true)} />

      {/* Side menu — opens on tap; one use: any click (a link, the panel, or the
          light backdrop) closes it. */}
      <div className={`md:hidden fixed inset-0 z-30 ${expanded ? '' : 'pointer-events-none'}`} aria-hidden={!expanded}>
        <div
          onClick={() => setExpanded(false)}
          className={`absolute inset-0 bg-black/10 transition-opacity duration-200 ${expanded ? 'opacity-100' : 'opacity-0'}`}
        />
        <aside
          aria-label="Quick navigation"
          onClick={() => setExpanded(false)}
          className={`absolute left-0 top-14 flex w-56 max-w-[80vw] flex-col bg-surface shadow-xl transition-transform duration-200 ease-out motion-reduce:transition-none ${
            expanded ? 'translate-x-0' : '-translate-x-full'
          }`}
          style={{ bottom: 'calc(4rem + env(safe-area-inset-bottom))' }}
        >
          <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
            {MOBILE_TABS.map((tab) => {
              const Icon = AREA_ICONS[tab.key] ?? Globe
              const active = isActive(tab.href)
              return (
                <Link key={tab.key} href={tab.href} className={itemClass(active)}>
                  <Icon className="h-5 w-5 shrink-0" strokeWidth={active ? 2.5 : 2} />
                  <span className="truncate">{tab.label}</span>
                </Link>
              )
            })}
            <button type="button" onClick={onOpenMenu} className={`w-full ${itemClass(false)}`}>
              <Menu className="h-5 w-5 shrink-0" strokeWidth={2} />
              <span className="truncate">More</span>
            </button>
          </nav>
        </aside>
      </div>
    </>
  )
}

function MobileStatsMenu({
  children,
  enabled,
}: {
  children: React.ReactNode
  enabled: boolean
}) {
  const { scrolledIn, expanded, setExpanded } = useRailReveal(enabled)
  if (!enabled) return null

  return (
    <>
      <EdgeTab side="right" show={scrolledIn && !expanded} onOpen={() => setExpanded(true)} />

      {/* Stats menu — opens on tap; one use: any click (a link, the panel, or the
          light backdrop) closes it. */}
      <div className={`md:hidden fixed inset-0 z-30 ${expanded ? '' : 'pointer-events-none'}`} aria-hidden={!expanded}>
        <div
          onClick={() => setExpanded(false)}
          className={`absolute inset-0 bg-black/10 transition-opacity duration-200 ${expanded ? 'opacity-100' : 'opacity-0'}`}
        />
        <aside
          aria-label="Your stats"
          onClick={() => setExpanded(false)}
          className={`absolute right-0 top-14 flex w-72 max-w-[85vw] flex-col bg-surface shadow-xl transition-transform duration-200 ease-out motion-reduce:transition-none ${
            expanded ? 'translate-x-0' : 'translate-x-full'
          }`}
          style={{ bottom: 'calc(4rem + env(safe-area-inset-bottom))' }}
        >
          <div className="h-12 shrink-0 flex items-center gap-2 px-3 border-b border-border">
            <Zap className="h-4 w-4 text-primary fill-current" />
            <p className="text-sm font-bold text-text">Your stats</p>
          </div>
          <div className="flex-1 overflow-y-auto p-3">{children}</div>
        </aside>
      </div>
    </>
  )
}

// ── App shell ─────────────────────────────────────────────────────────────────

export default function AppShell({
  profile,
  realRole,
  previewVisitor = false,
  children,
  sidebar,
  statsPanel,
  ticker,
  unreadCount = 0,
  extraSections,
  hideAppNav = false,
  permissions,
  staffRole = null,
  demoMode = false,
  demoHidden = false,
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
  /** Member stats / streaks / gamification body — hosted by the mobile right-edge
   *  stats menu (the desktop dock shows the same content in the right rail). */
  statsPanel?: React.ReactNode
  /** Community news ticker pinned above the page content (streamed via Suspense). */
  ticker?: React.ReactNode
  unreadCount?: number
  extraSections?: NavSection[]
  hideAppNav?: boolean
  /** Per-area access overrides (janitor-set); merged over code defaults. */
  permissions?: Record<string, NavAccess>
  /** Viewer's staff role (team_members axis); unlocks Studio. Null under view-as. */
  staffRole?: StaffRole | null
  /** Global demo_mode is on (seeded beta content exists) → show the Beta toggle. */
  demoMode?: boolean
  /** This viewer has hidden beta content for themselves (drives the toggle state). */
  demoHidden?: boolean
}) {
  const pathname = usePathname()
  const role = (profile.community_role ?? 'member') as CommunityRole
  const effectiveRealRole = realRole ?? role
  // Nav gating role: a visitor preview gates as a logged-out visitor (null).
  const gateRole: CommunityRole | null = previewVisitor ? null : role
  // Stewards (host+) and Studio staff get a mobile quick-add for the Profile
  // Creator — tap to scan a card / add a profile on the go (ADR-096).
  const canCreateProfile = meetsAccess('host', gateRole) || meetsStaff({ staffAccess: 'analyst' }, staffRole)
  const profileHref = `/people/${profile.handle}`
  const { theme, setTheme } = useTheme()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [lastPath, setLastPath] = useState(pathname)

  // Opt-in mobile edge rails — left nav + right stats — each remembered per device.
  // Both start hidden on the server so there's no hydration flash, then hydrate from
  // localStorage right after mount (default ON; turned off via each rail's bottom
  // tick, back on from the drawer toggles).
  const [railNavOn, setRailNavOn] = useState(false)
  const [statsRailOn, setStatsRailOn] = useState(false)
  useEffect(() => {
    // One-time hydration of client-only prefs: server + first client render both see
    // `false` (no rails) → no hydration mismatch; we sync to the stored values after
    // mount. (This is the legitimate effect→setState case.)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRailNavOn(localStorage.getItem('freq-rail-nav') !== '0')
    setStatsRailOn(localStorage.getItem('freq-stats-rail') !== '0')
  }, [])
  function setRail(key: 'freq-rail-nav' | 'freq-stats-rail', on: boolean) {
    localStorage.setItem(key, on ? '1' : '0')
    if (key === 'freq-rail-nav') setRailNavOn(on)
    else setStatsRailOn(on)
  }

  // Close mobile drawer when the route changes (covers browser back/forward).
  if (lastPath !== pathname) {
    setLastPath(pathname)
    if (drawerOpen) setDrawerOpen(false)
  }

  // ⌘K / Ctrl+K → open the live search overlay
  const [searchOpen, setSearchOpen] = useState(false)
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setSearchOpen(true)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

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

  // Scope-aware rail (PAGE-FRAMEWORK §3/§4): which rail (if any) frames the page
  // is decided by ONE declarative map — lib/layout/page-chrome.ts — not by a list
  // hand-maintained here. The GLOBAL rail shows on 'global' pages; it is suppressed
  // for 'scoped' entity-detail pages (they render their own scope rail in-body, no
  // double-rail trap) and for 'none' Focus pages (compose/edit/settings/operator
  // workspaces that read best full-width). To reframe a route, edit page-chrome.ts.
  const showSidebar = !!sidebar && railFor(pathname) === 'global'

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

        {/* Engraved, interactive wordmark. Leads the bar — on mobile the menu now
            lives in the bottom tab bar, so the wordmark anchors the top-left. */}
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
        <div className="flex flex-1 items-center justify-end gap-1 px-2.5 md:gap-2 md:px-4">

          {/* Demo-content toggle — sits to the LEFT of Search (desktop). Members
              hide/show seeded demo content for themselves; sized to match Search. */}
          {demoMode && <DemoToggle initialHidden={demoHidden} />}

          {/* Search pill — opens the live overlay. Desktop */}
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="hidden sm:flex items-center gap-2 rounded-full border border-border bg-surface-elevated/70 pl-3 pr-2 py-1.5 text-sm text-muted hover:text-text hover:border-border-strong hover:bg-surface-elevated transition-colors"
          >
            <Search className="w-4 h-4" />
            <span>Search</span>
            <kbd className="text-[10px] leading-none rounded px-1.5 py-1 border border-border bg-surface text-subtle">
              ⌘K
            </kbd>
          </button>

          {/* Search icon — opens the live overlay. Mobile */}
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            aria-label="Search"
            className="sm:hidden flex items-center justify-center w-8 h-8 rounded-full text-muted hover:text-text hover:bg-surface-elevated transition-colors"
          >
            <Search className="w-5 h-5" />
          </button>

          {/* Community actions. Desktop: friends + messages + notifications.
              Mobile: friends + messages fold into ONE silhouette icon → Messages. */}
          <div className="flex items-center gap-1 sm:ml-1 sm:pl-1.5 sm:border-l sm:border-border">
            {/* Friends — desktop only (mobile merges it into the combined icon) */}
            <Link
              href="/friends"
              aria-label="Friends"
              className="hidden sm:flex items-center justify-center w-9 h-9 rounded-full text-muted hover:text-text hover:bg-surface-elevated transition-colors"
            >
              <Users className="w-5 h-5" />
            </Link>
            {/* Messages — desktop popover */}
            <div className="hidden sm:block">
              <MessagesPopover />
            </div>
            {/* Mobile: friends + messages combined into one silhouette icon → Messages */}
            <Link
              href="/messages"
              aria-label="Friends & messages"
              className="sm:hidden flex items-center justify-center w-8 h-8 rounded-full text-muted hover:text-text hover:bg-surface-elevated transition-colors"
            >
              <Users className="w-5 h-5" />
            </Link>
            <NotificationBell initialUnread={unreadCount} />
          </div>

          {/* Account group — set off by its own divider. Quick-capture (mobile,
              stewards) sits to the LEFT of the account avatar so the profile stays
              the far-right anchor and the two read as one balanced pair. */}
          <div className="flex items-center gap-1 ml-1 pl-1.5 border-l border-border md:gap-2 md:pl-2">
            {/* Quick capture — snap a card straight into your contacts. A filled
                primary box with a white camera. Mobile only, stewards + staff. */}
            {canCreateProfile && (
              <Link
                href="/connections/new"
                aria-label="New contact"
                title="New contact"
                className="md:hidden flex items-center justify-center w-8 h-8 shrink-0 rounded-full bg-primary text-on-primary shadow-sm hover:bg-primary-hover transition-colors"
              >
                <Camera className="w-5 h-5" />
              </Link>
            )}
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
            <NavLinkList isActive={isActive} role={gateRole} extraSections={extraSections} hideAppNav={hideAppNav} permissions={permissions} staffRole={staffRole} />
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
              <aside className="hidden lg:flex flex-col w-72 shrink-0 border-l border-border bg-surface/80 backdrop-blur-sm">
                {sidebar}
              </aside>
            )}
          </div>
        </div>
      </div>
      </DockRevealProvider>

      {/* ── Live search overlay (⌘K or the header search) ─────────────────── */}
      {searchOpen && <SearchOverlay onClose={() => setSearchOpen(false)} />}

      {/* ── Mobile edge rails (fixed overlays; bracket the feed on scroll) ─── */}
      {!hideAppNav && (
        <MobileSideRail isActive={isActive} onOpenMenu={() => setDrawerOpen(true)} enabled={railNavOn} />
      )}
      {!hideAppNav && statsPanel && (
        <MobileStatsMenu enabled={statsRailOn}>{statsPanel}</MobileStatsMenu>
      )}

      {/* ── Mobile bottom tab bar ─────────────────────────── */}
      {/* Feed · Circles · Channels · Events · Menu (opens the full drawer). */}
      <MobileTabBar isActive={isActive} onOpenMenu={() => setDrawerOpen(true)} menuOpen={drawerOpen} hideAppNav={hideAppNav} />

      {/* ── Mobile left drawer (the full menu) ────────────── */}
      <MobileLeftDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        role={gateRole}
        identityRole={role}
        profile={profile}
        profileHref={profileHref}
        isActive={isActive}
        extraSections={extraSections}
        hideAppNav={hideAppNav}
        permissions={permissions}
        staffRole={staffRole}
        railNavOn={railNavOn}
        statsRailOn={statsRailOn}
        onSetRail={setRail}
      />

    </div>
  )
}
