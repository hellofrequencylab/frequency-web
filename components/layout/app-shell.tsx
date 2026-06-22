'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useState, useEffect, useRef } from 'react'
import {
  Globe,
  User,
  LogOut,
  Moon,
  Sun,
  Settings,
  Zap,
  Search,
  CreditCard,
  BellRing,
  SlidersHorizontal,
  UserPlus,
  Users,
  UserRound,
  X,
  Gem,
  Monitor,
  ChevronUp,
  ChevronRight,
  Menu,
  ChevronsLeft,
  ChevronsRight,
  Flame,
  QrCode,
  Megaphone,
  HelpCircle,
  LifeBuoy,
  Bug,
  Gift,
} from 'lucide-react'
import { getInitials } from '@/lib/utils'
import { NotificationBell } from '@/components/layout/notification-bell'
import { HoverTip } from '@/components/ui/hover-tip'
import { MessagesPopover } from '@/components/messages/messages-popover'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { ViewAsControl } from '@/components/layout/view-as-control'
import {
  type CommunityRole,
  ROLE_LABEL,
  roleBadgeStyle,
} from '@/lib/community-roles'
import { NAV_AREAS, meetsAccess, meetsStaff, type NavAccess, type NavArea } from '@/lib/nav-areas'
import type { AccessLevel } from '@/lib/core/access-matrix'
import type { StaffRole, StaffDomain } from '@/lib/staff'
import type { ProfileIdentity } from '@/lib/types/profile'
import { PrimaryNav } from '@/components/layout/primary-nav'
import { MegaBar } from '@/components/layout/mega-menu'
import { defaultMenu } from '@/lib/menus/defaults'
import type { MenuAccess, MenuSettings, ResolvedMenu } from '@/lib/menus/types'
import { BrandMark } from '@/components/layout/brand-mark'
import { MemberFooter } from '@/components/layout/member-footer'
import { AREA_ICONS } from '@/components/layout/nav-icons'
import { UpgradeCrew } from '@/components/layout/upgrade-crew'
import { DemoToggle } from '@/components/layout/demo-toggle'
import { DockRevealProvider } from '@/components/sidebar/dock-reveal'
import { railFor, leftRailFor, mergeChrome, railStartsCollapsed, type ChromeOverrides } from '@/lib/layout/page-chrome'
import type { WebRole } from '@/lib/core/roles'
import { SearchOverlay } from '@/components/search/search-overlay'
import { PageAdminProvider } from '@/components/layout/page-admin-context'
import { SettingsDrawer, type SettingsDrawerState } from '@/components/layout/settings-drawer'
import { MindlessProvider, useMindless } from '@/components/on-air/mindless'
import { MovementProvider } from '@/components/on-air/movement'
import { LotusIcon } from '@/components/on-air/icons'

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
  /** Staff capability domain (team_members) that also unlocks this item. */
  staffDomain?: StaffDomain
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
      staffDomain: area.staffDomain,
    }
    const last = sections[sections.length - 1]
    if (last && last.label === area.section) last.items.push(item)
    else sections.push({ label: area.section, items: [item] })
  }
  return sections
}

// One vertical rail holds every destination: the Home anchors (Feed · Around You,
// pinned top), then the worlds — Community · The Quest — and finally the single
// Admin category (admin + studio + platform rolled into one, mirroring the back-end
// admin menu). Sections and their order are derived entirely from NAV_AREAS (no
// hardcoded section list). The desktop rail and mobile drawer render the same set.
const NAV_SECTIONS = buildSections([...NAV_AREAS])

// Build the rail from an operator-resolved key order (the GLOBAL menu config —
// /admin/menu). Hidden items are already filtered out upstream (orderedVisibleAreas),
// so this only reorders + drops unknown keys; an empty/missing list falls back to the
// full code rail so the rail is NEVER empty. Per-role gating is unchanged — it still
// runs over these items via `permissions` / `navAccess`.
const AREA_BY_KEY = new Map(NAV_AREAS.map((a) => [a.key, a]))
function sectionsFromKeys(keys: string[] | undefined): NavSectionGroup[] {
  if (!keys || keys.length === 0) return NAV_SECTIONS
  const areas = keys.map((k) => AREA_BY_KEY.get(k)).filter((a): a is NavArea => !!a)
  return areas.length > 0 ? buildSections(areas) : NAV_SECTIONS
}

// Drop the member's Profile into the headerless home group beside Feed (it can't be a
// static NAV_AREA — its href is the viewer's own /people/<handle>). Result: the rail opens
// with Feed · Profile pinned above the worlds. If Feed's leading null group is missing
// (e.g. an operator menu order without it), Profile still leads in its own home group.
function withHomeProfile(sections: NavSectionGroup[], profileHref: string): NavSectionGroup[] {
  const profileItem: MainNavItem = {
    key: 'profile',
    href: profileHref,
    label: 'Profile',
    Icon: UserRound,
    defaultAccess: 'member',
  }
  const [first, ...rest] = sections
  if (first && first.label === null) {
    return [{ label: null, items: [...first.items, profileItem] }, ...rest]
  }
  return [{ label: null, items: [profileItem] }, ...sections]
}

// The Manage sections TELESCOPE: an item the viewer can't reach is hidden (not
// muted), and a group with nothing reachable is skipped entirely (header included)
// — so a member never sees empty admin headers and a host isn't shown greyed-out
// janitor tools. Member worlds (Community, The Quest) still mute/preview instead,
// as aspirational surfaces.
const TELESCOPE_SECTIONS = new Set(['Steward', 'Structure', 'Admin', 'Leadership'])

// Mobile renders the SAME rail as desktop (owner call, mobile-menus pass): the
// left drawer carries the member worlds AND the axis-gated Manage groups — one
// menu structure everywhere. Manage telescopes, so members never see admin
// headers; the account menu stays purely personal.

// The effective access for an area = a janitor's per-area override, if any,
// else the code default. `role` is the viewer's community role (null = visitor).
function effectiveAccess(
  item: MainNavItem,
  permissions: Record<string, NavAccess> | undefined,
): NavAccess {
  return permissions?.[item.key] ?? item.defaultAccess
}

// Matrix-driven access (owner directive): the viewer's level on a nav item's surface,
// 'none' | 'limited' | 'full'. `navAccess` (server-resolved per key via the access matrix)
// is AUTHORITATIVE when present — it already folds in the viewer's effective role/tier/
// staff (and under a view-as preview those are the impersonated values), so we do NOT
// union a separate staff check on top of it (that path leaked real staff access into a
// downgraded preview). Only DYNAMIC extras with no matrix key fall back to the role/staff
// ladder, so a pinned/extra item is never wrongly hidden.
function itemAccess(
  item: MainNavItem,
  role: CommunityRole | null,
  staffRole: StaffRole | null,
  permissions: Record<string, NavAccess> | undefined,
  navAccess: Record<string, AccessLevel> | undefined,
): AccessLevel {
  if (navAccess && item.key in navAccess) return navAccess[item.key]
  return meetsAccess(effectiveAccess(item, permissions), role) || meetsStaff(item, staffRole) ? 'full' : 'none'
}


interface Profile extends ProfileIdentity {
  community_role: CommunityRole
  current_season_zaps?: number | null
  lifetime_gems?: number | null
  meta?: unknown
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
    if (meta) {
      // Derive the status-bar color from the live token source so it can't drift
      // from the design system. We read AFTER toggling .dark, so the computed
      // value is already the mode-specific token: the page background is
      // --color-canvas in light, and the deep ink band is --color-ink in dark
      // (app/globals.css :root / .dark). Trim because getPropertyValue keeps
      // the declaration's leading whitespace.
      const token = isDark ? '--color-ink' : '--color-canvas'
      const color = getComputedStyle(document.documentElement)
        .getPropertyValue(token)
        .trim()
      if (color) meta.setAttribute('content', color)
    }
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
  // long scroll. The quick-actions panel opens ONLY on tapping the chevron — it
  // never rises on scroll or hover (that was disorienting); it stays put until the
  // member chooses to open it.
  const [manualOpen, setManualOpen] = useState(false)
  const open = manualOpen

  return (
    <div>
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
            <span className="mt-1 inline-block rounded-full bg-surface-elevated px-2 py-0.5 text-3xs font-semibold leading-tight text-muted">
              Visitor
            </span>
          ) : (
            <span
              className="rank-badge mt-1 inline-block text-3xs leading-tight"
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

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Account menu"
        aria-expanded={open}
        className="flex items-center justify-center w-8 h-8 rounded-full bg-surface-elevated text-muted text-2xs font-semibold ring-1 ring-border hover:text-text hover:ring-border-strong transition-colors select-none shrink-0"
      >
        {getInitials(profile.display_name)}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-60 rounded-xl border border-border bg-surface shadow-xl shadow-black/5 py-1 z-50 max-h-[80vh] overflow-y-auto">

          {/* Header */}
          <div className="px-3 py-2.5 border-b border-border">
            <p className="text-3xs font-semibold uppercase tracking-wider text-subtle mb-0.5">
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
            <button
              type="button"
              onClick={() => { setOpen(false); window.dispatchEvent(new Event('open-invite')) }}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-text hover:bg-surface-elevated transition-colors"
            >
              <Gift className="w-4 h-4 text-primary-strong" />
              Invite friends · earn zaps
            </button>
          </div>

          {/* Dashboard moved to the mobile right (gamification) drawer; admin
              lives in the left drawer + desktop rail (mobile-menus pass). This
              menu stays purely personal. */}

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
              href="/support"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-3 py-2 text-sm text-text hover:bg-surface-elevated transition-colors"
            >
              <LifeBuoy className="w-4 h-4 text-subtle" />
              Support tickets
            </Link>
            <button
              type="button"
              onClick={() => { setOpen(false); window.dispatchEvent(new CustomEvent('open-support', { detail: { type: 'bug' } })) }}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-text hover:bg-surface-elevated transition-colors"
            >
              <Bug className="w-4 h-4 text-subtle" />
              Report a bug
            </button>
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
  navAccess,
  staffRole = null,
  sections = NAV_SECTIONS,
  compact = false,
}: {
  isActive: (href: string) => boolean
  /** Gating role; null = visitor (the janitor's "view as visitor" preview). */
  role: CommunityRole | null
  onNavigate?: () => void
  extraSections?: NavSection[]
  hideAppNav?: boolean
  /** Per-area access overrides (janitor-set); merged over code defaults. */
  permissions?: Record<string, NavAccess>
  /** Server-resolved access matrix per nav key (matrix-driven visibility). */
  navAccess?: Record<string, AccessLevel>
  /** Viewer's staff role (team_members axis); unlocks Studio independent of trust. */
  staffRole?: StaffRole | null
  /** Which area sections to render. Defaults to the full rail (NAV_SECTIONS). */
  sections?: NavSectionGroup[]
  /** Icon-only column (the micro edge menu): no labels, no section headers. */
  compact?: boolean
}) {
  // `emphasize` = the home anchor (Feed): always the brand's dark brown and bold,
  // active or not, so it reads as the rail's permanent "home".
  const itemClass = (active: boolean, emphasize = false) =>
    `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
      emphasize
        ? `font-bold text-[var(--brand-mark)] ${active ? 'bg-primary-bg' : 'hover:bg-surface-elevated'}`
        : active
          ? 'bg-primary-bg text-primary-strong font-semibold'
          : 'text-muted font-medium hover:bg-surface-elevated hover:text-text'
    }`

  const sectionLabelClass =
    'px-3 pt-1 pb-1 text-3xs font-semibold uppercase tracking-wider text-subtle'

  return (
    <>
      {!hideAppNav && sections.map((section, i) => {
        // The leading label-less group is the home anchor (Feed): set it apart
        // from the destination groups with a hairline below and bolder items.
        const isHomeAnchor = i === 0 && section.label === null
        // Admin sections telescope AND require FULL access: an operator tool is shown only
        // to someone who can actually operate it (not a 'limited' preview), and the whole
        // group (header included) is skipped when nothing is full. So a visitor or member
        // never sees an Admin header, and below-access viewers never get a ghosted admin row.
        const adminSection = TELESCOPE_SECTIONS.has(section.label ?? '')
        const visibleItems = adminSection
          ? section.items.filter((it) => itemAccess(it, role, staffRole, permissions, navAccess) === 'full')
          : section.items
        if (visibleItems.length === 0) return null
        return (
        <div
          key={section.label ?? `top-${i}`}
          className={
            compact
              ? `flex flex-col items-center gap-1 ${isHomeAnchor ? 'pb-1.5 mb-0.5 border-b border-border' : ''}`
              : `space-y-0.5 ${i > 0 ? 'mt-2' : ''} ${isHomeAnchor ? 'pb-2 mb-1 border-b border-border' : ''}`
          }
        >
          {!compact && section.label && <p className={sectionLabelClass}>{section.label}</p>}
          {visibleItems.map((item) => {
            const { href, label, Icon } = item
            // The viewer's matrix level on this surface. full → the normal link; limited →
            // a muted "ghost" preview that still clicks through to the gated page (e.g. a
            // visitor on Practices/Library); none → a disabled, non-clickable ghost. Admin
            // sections were pre-filtered to full-access items above.
            const access = itemAccess(item, role, staffRole, permissions, navAccess)
            const reachable = access !== 'none'

            // Icon-only column (micro edge menu): one square per area, tooltip-labelled.
            if (compact) {
              const active = isActive(href)
              if (!reachable && !item.preview) {
                return (
                  <div
                    key={href}
                    aria-disabled="true"
                    title="You don't have access to this yet"
                    className="flex h-11 w-11 items-center justify-center rounded-xl text-subtle opacity-50 cursor-not-allowed select-none"
                  >
                    <Icon className="h-5 w-5" strokeWidth={2} />
                  </div>
                )
              }
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={onNavigate}
                  aria-label={label}
                  title={label}
                  className={`flex h-11 w-11 items-center justify-center rounded-xl transition-colors ${
                    active
                      ? 'bg-primary-bg text-primary-strong'
                      : reachable
                        ? 'text-muted hover:bg-surface-elevated hover:text-text'
                        : 'text-subtle hover:bg-surface-elevated'
                  }`}
                >
                  <Icon className="h-5 w-5" strokeWidth={active ? 2.5 : 2} />
                </Link>
              )
            }
            // Ghost preview — a 'limited' surface (a visitor on Practices/Library, or a
            // below-tier viewer on a paid area). The row stays but reads muted and clicks
            // through to the gated page, which shows the preview + how to unlock.
            if (access === 'limited') {
              const active = isActive(href)
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={onNavigate}
                  title="Preview. Sign in or upgrade to engage"
                  className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    active ? 'bg-surface-elevated text-muted' : 'text-subtle hover:bg-surface-elevated hover:text-muted'
                  }`}
                >
                  <Icon className="h-[18px] w-[18px] shrink-0 text-subtle" strokeWidth={2} />
                  {label}
                </Link>
              )
            }
            // No access — a disabled, non-clickable ghost.
            if (access === 'none') {
              return (
                <div
                  key={href}
                  aria-disabled="true"
                  title="You don't have access to this yet"
                  className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium text-subtle opacity-50 cursor-not-allowed select-none"
                >
                  <Icon className="w-[18px] h-[18px] shrink-0 text-subtle" strokeWidth={2} />
                  {label}
                </div>
              )
            }
            const active = isActive(href)
            return (
              <Link key={href} href={href} onClick={onNavigate} data-tour-anchor={`nav-${item.key}`} className={itemClass(active)}>
                <Icon
                  className={`w-[18px] h-[18px] shrink-0 ${active ? 'text-primary-strong' : 'text-subtle'}`}
                  strokeWidth={active ? 2.5 : 2}
                />
                {label}
              </Link>
            )
          })}
        </div>
        )
      })}

      {extraSections?.map((section, i) => (
        <div
          key={`extra-${section.label ?? i}`}
          className={compact ? 'flex flex-col items-center gap-1 mt-1' : 'space-y-0.5 mt-2'}
        >
          {!compact && section.label && <p className={sectionLabelClass}>{section.label}</p>}
          {section.items.map(({ href, label, Icon }) => {
            const active = isActive(href)
            if (compact) {
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={onNavigate}
                  aria-label={label}
                  title={label}
                  className={`flex h-11 w-11 items-center justify-center rounded-xl transition-colors ${
                    active ? 'bg-primary-bg text-primary-strong' : 'text-muted hover:bg-surface-elevated hover:text-text'
                  }`}
                >
                  <Icon className="h-5 w-5" strokeWidth={active ? 2.5 : 2} />
                </Link>
              )
            }
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
  identityRole,
  profile,
  profileHref,
  isActive,
  extraSections,
  hideAppNav = false,
  permissions,
  navAccess,
  staffRole = null,
  sections = NAV_SECTIONS,
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
  navAccess?: Record<string, AccessLevel>
  staffRole?: StaffRole | null
  /** The operator-ordered, visibility-filtered rail sections (GLOBAL menu config). */
  sections?: NavSectionGroup[]
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
                className="rank-badge mt-0.5 inline-block text-3xs leading-tight"
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
            <span className="flex items-center gap-1.5" title="Zaps (this season)">
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

        <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
          <NavLinkList isActive={isActive} role={role} onNavigate={onClose} extraSections={extraSections} hideAppNav={hideAppNav} permissions={permissions} navAccess={navAccess} staffRole={staffRole} sections={sections} />
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
  { key: 'quest', href: '/crew', label: 'Quest' },
  { key: 'events', href: '/events', label: 'Events' },
]

function MobileTabBar({
  isActive,
  onOpenMenu,
  onOpenStats,
  menuOpen,
  statsOpen,
  hideAppNav = false,
}: {
  isActive: (href: string) => boolean
  onOpenMenu: () => void
  onOpenStats: () => void
  menuOpen: boolean
  statsOpen: boolean
  /** Stripped shells (e.g. Studio) hide the app destinations; only the menu arrow remains. */
  hideAppNav?: boolean
}) {
  // Every item — the two edge buttons AND the destination tabs — is flex-1 with the same
  // icon size + stroke weight, so the row reads as one evenly-spaced, uniform set. Active is
  // shown by COLOR only (not a heavier stroke), so weights never differ across the row.
  const tabClass = (active: boolean) =>
    `flex flex-1 flex-col items-center justify-end gap-1.5 pb-2 text-3xs font-medium transition-colors ${
      active ? 'text-primary-strong' : 'text-muted hover:text-text'
    }`

  const renderTab = (tab: { key: string; href: string; label: string }) => {
    const Icon = AREA_ICONS[tab.key] ?? Globe
    const active = isActive(tab.href)
    return (
      <Link key={tab.key} href={tab.href} aria-label={tab.label} className={tabClass(active)}>
        <Icon className="h-[22px] w-[22px]" strokeWidth={2} />
        <span className="leading-none">{tab.label}</span>
      </Link>
    )
  }

  // The edge buttons (menu + stats) are plain tabs too — same flex-1 width, icon, and weight.
  const handle =
    'flex flex-1 flex-col items-center justify-end gap-1.5 pb-2 text-3xs font-medium text-muted transition-colors active:text-text'

  return (
    <nav
      className="md:hidden fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t border-border bg-surface/95 backdrop-blur-sm"
      style={{
        height: 'calc(3.5rem + env(safe-area-inset-bottom))',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {/* Left → the nav drawer. */}
      <button
        type="button"
        onClick={onOpenMenu}
        aria-label={menuOpen ? 'Close menu' : 'Open menu'}
        aria-expanded={menuOpen}
        className={`${handle} ${menuOpen ? 'text-primary-strong' : ''}`}
      >
        {menuOpen ? <X className="h-[22px] w-[22px]" strokeWidth={2} /> : <Menu className="h-[22px] w-[22px]" strokeWidth={2} />}
        <span className="leading-none">Menu</span>
      </button>

      {!hideAppNav && MOBILE_TABS.slice(0, 2).map(renderTab)}

      {/* Zap — the action button (ADR-230). Member-facing it's Zap; the backend
          stays Capture (the 'open-capture' event, the captures machinery): Zap is
          the function that captures. The bolt is a LIGHT glyph on the orange button
          in light mode and a DARK glyph on the gold button at night, with a soft
          catch behind it that flips to match (all tokens). */}
      {!hideAppNav && (
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent('open-capture', { detail: { mode: 'post' } }))}
          aria-label="Zap, capture a moment"
          className="relative flex flex-1 flex-col items-center justify-end gap-1.5 pb-2 text-3xs font-semibold text-primary-strong"
        >
          {/* The circle sits a touch lower than dead-center on the bar's top edge so
              it reads balanced against the flat tabs (its center is 6px below the
              line); the arch above drops to match, keeping the even 12px margin. */}
          <span aria-hidden className="h-[26px] w-[22px]" />
          {/* The fully-rounded white catch the bolt sits in — a floating disc, not a bar bump. */}
          <span aria-hidden className="absolute left-1/2 top-0 h-14 w-14 -translate-x-1/2 -translate-y-[22px] rounded-full border border-border bg-surface" />
          <span className="absolute left-1/2 top-0 flex h-12 w-12 -translate-x-1/2 -translate-y-[18px] items-center justify-center rounded-full bg-primary shadow-pop">
            {/* the catch behind the glyph — a soft shadow under the bolt (flips with
                the glyph so the carve always reads) */}
            <Zap
              aria-hidden
              className="absolute h-[24px] w-[24px] translate-y-[1.5px] text-primary-strong/40 fill-primary-strong/20 dark:text-on-primary/45 dark:fill-on-primary/25"
              strokeWidth={2}
            />
            {/* the glyph: LIGHT on the orange button in light mode, DARK on the gold
                button in night mode */}
            <Zap
              className="relative h-[24px] w-[24px] text-on-primary fill-on-primary/35 dark:text-ink dark:fill-ink/35"
              strokeWidth={2}
            />
          </span>
          <span className="leading-none">Zap</span>
        </button>
      )}

      {!hideAppNav && MOBILE_TABS.slice(2).map(renderTab)}

      {/* Right → the stats drawer (zaps · gems · streak). */}
      {!hideAppNav && (
        <button
          type="button"
          onClick={onOpenStats}
          aria-label={statsOpen ? 'Close stats' : 'Open stats'}
          aria-expanded={statsOpen}
          className={`${handle} ${statsOpen ? 'text-signal-strong' : ''}`}
        >
          <Gem className="h-[22px] w-[22px]" strokeWidth={2} />
          <span className="leading-none">Stats</span>
        </button>
      )}
    </nav>
  )
}

// ── Mobile right drawer (The Quest: stats / streaks / gamification) ──────────
// Mirrors the left drawer exactly (mobile-menus pass): same full-height panel,
// same backdrop, same thumb-zone Close — the old micro/full size toggle is gone.
// Opened only from the tab bar's gem control; one side open closes the other.
// Dashboard lives at the top here (moved out of the account menu).

function MobileRightDrawer({
  open,
  onClose,
  children,
}: {
  open: boolean
  onClose: () => void
  children: React.ReactNode
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

      <aside
        role="dialog"
        aria-label="Streaks & stats"
        className={`absolute inset-y-0 right-0 w-72 max-w-[85vw] bg-surface shadow-2xl flex flex-col transform transition-transform duration-200 ease-out ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="h-14 shrink-0 flex items-center gap-2 px-4 border-b border-border">
          <Gem className="h-4 w-4 text-signal" strokeWidth={2.5} />
          <p className="text-sm font-bold text-text">The Quest</p>
        </div>

        {/* My Quest — promoted here from the account menu (owner ask): the
            gamification drawer is where the game lives. */}
        <Link
          href="/crew"
          onClick={onClose}
          className="mx-3 mt-3 flex shrink-0 items-center gap-2.5 rounded-lg bg-surface-elevated px-3 py-2.5 text-sm font-semibold text-text transition-colors hover:bg-border-strong"
        >
          <Zap className="w-4 h-4 text-primary" />
          My Quest
          <ChevronRight className="ml-auto h-4 w-4 text-subtle" />
        </Link>

        <div className="flex-1 overflow-y-auto p-3">{children}</div>

        {/* Bottom close. Sits in the thumb zone, same as the left drawer. */}
        <div className="shrink-0 border-t border-border p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button
            onClick={onClose}
            aria-label="Close stats"
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

// ── Mindless launcher (header) ────────────────────────────────────────────────
// Opens the global Mindless overlay (the On Air timer) from anywhere. Reads the
// launcher API from MindlessProvider, which wraps the whole shell below — so
// this must render inside that provider's tree (it does: it sits in the header,
// which the provider wraps). Styled to sit beside Search/Friends as one of the
// quiet community controls; the lotus is the On Air mark.

function MindlessLaunch() {
  const { open } = useMindless()
  return (
    <HoverTip label="Mindless">
      <button
        type="button"
        onClick={() => open()}
        aria-label="Mindless. Open the practice timer"
        className="flex items-center gap-1.5 h-8 sm:h-9 px-2 sm:px-2.5 rounded-full text-muted hover:text-primary-strong hover:bg-surface-elevated transition-colors"
      >
        {/* Pure-outline lotus (no fill) so it carries the same weight as the lucide icons beside it. */}
        <LotusIcon filled={false} className="w-5 h-5" />
        <span className="hidden text-2xs font-bold uppercase tracking-widest sm:inline">Mindless</span>
      </button>
    </HoverTip>
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
  menuAreaKeys,
  navAccess,
  staffRole = null,
  demoMode = false,
  demoHidden = false,
  hasDemoContent = true,
  skin = 'default',
  brandName = null,
  brandLogoUrl = null,
  chromeOverrides,
  webRole = 'none',
  generation = 'balanced',
  occasion = 'none',
  exploreMenu,
  discoverMenu,
  adminMenu,
  menuViewerRole = 'visitor',
  menuTimings,
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
  /** The GLOBAL menu order (janitor-set from /admin/menu), already ordered + with
   *  hidden items removed. Drives the rail's order + visibility for EVERYONE. Empty
   *  / omitted falls back to the full code rail (NAV_AREAS). Per-role gating is
   *  unchanged — it still runs over these items via `permissions` / `navAccess`. */
  menuAreaKeys?: string[]
  /** Server-resolved access matrix per nav key — drives matrix-driven nav visibility
   *  (an item shows if the viewer has any access to its surface). */
  navAccess?: Record<string, AccessLevel>
  /** Viewer's staff role (team_members axis); unlocks Studio. Null under view-as. */
  staffRole?: StaffRole | null
  /** Global demo_mode is on (seeded beta content exists) → show the Beta toggle. */
  demoMode?: boolean
  /** This viewer has hidden beta content for themselves (drives the toggle state). */
  demoHidden?: boolean
  /** Whether any seeded demo content actually exists — the toggle hides when none. */
  hasDemoContent?: boolean
  /** The active Space's skin token set (ADR-249/250 step 6). Sets `[data-skin]` on the
   *  shell root so per-Space token overrides can scope to the in-app surface. 'default' is
   *  the current look (a no-op until skin token sets are authored). */
  skin?: string
  /** The active Space's brand display name; replaces the default wordmark text when set. */
  brandName?: string | null
  /** The active Space's brand logo URL; rendered in the header in place of the wordmark. */
  brandLogoUrl?: string | null
  /** Operator route -> rail overrides (page_chrome_overrides), merged over the code chrome map. */
  chromeOverrides?: ChromeOverrides
  /** The viewer's STAFF web_role (ADR-208), view-as-aware ('none' under a downgrade
   *  preview). Gates the staff-only on-page "Page" settings group (admin+). */
  webRole?: WebRole
  /** The active generation/style preset id; sets `data-generation` on the shell root. */
  generation?: string
  /** The active occasion id; sets `data-occasion` on the shell root ('none' = omitted). */
  occasion?: string
  /** The resolved `public_explore` menu (server-fetched, DB-backed). Drives the in-app
   *  "Explore Frequency" header mega. Falls back to the code default when omitted. */
  exploreMenu?: ResolvedMenu
  /** The resolved `public_discover` menu (unused in-app today, where the left rail owns
   *  discovery; passed through for parity / a safe fallback). */
  discoverMenu?: ResolvedMenu
  /** The resolved `admin_subheader` menu (server-fetched, DB-backed). Drives the admin
   *  sub-header mega on /admin* routes. Falls back to the code default when omitted. */
  adminMenu?: ResolvedMenu
  /** The viewer collapsed to a single MenuAccess token; drives per-item mode (active /
   *  ghost / hidden) in the header + admin megas. */
  menuViewerRole?: MenuAccess
  /** Mega-menu interaction timings from the global Menu Manager settings. */
  menuTimings?: MenuSettings
}) {
  const pathname = usePathname()
  const profileHref = `/people/${profile.handle}`
  // The rail's sections, built from the operator's GLOBAL order + visibility
  // (menuAreaKeys). Same set everywhere; per-role gating still filters within it. Profile
  // is injected into the home anchor (beside Feed) since its href is viewer-specific.
  const navSections = withHomeProfile(sectionsFromKeys(menuAreaKeys), profileHref)
  const role = (profile.community_role ?? 'member') as CommunityRole
  const effectiveRealRole = realRole ?? role
  // Nav gating role: a visitor preview gates as a logged-out visitor (null).
  const gateRole: CommunityRole | null = previewVisitor ? null : role
  const { theme, setTheme } = useTheme()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [lastPath, setLastPath] = useState(pathname)
  // Per-route override for the right rail's collapsed state (mini-rail build surfaces). Keyed
  // by path so it auto-resets on navigation — see the railCollapsed derivation below.
  const [railOverride, setRailOverride] = useState<{ path: string; collapsed: boolean } | null>(null)

  // The shell-level settings drawer (ADR-128, rebuilt; owner revision 2026-06-21). The
  // SettingsDrawer owns open/persistence + the grab-handle resize + the `open-settings` event,
  // and reports its live { open, width, resizing } up here. The shell sizes the RAIL COLUMN to
  // that width, so the drawer slides over the rail at rest (covering it, nothing reflows) and,
  // as the grab handle widens it, the rail column grows and the CENTER CONTENT COMPRESSES to
  // match. It never spills past the content's right column (it is its own pushing column).
  const [settings, setSettings] = useState<SettingsDrawerState>({ open: false, width: 288, resizing: false })

  // Mobile right drawer (The Quest stats) — opened only from the tab bar's gem
  // control. The left side is the nav DRAWER (drawerOpen, also bottom-bar
  // triggered); the shell keeps the two mutually exclusive.
  const [rightOpen, setRightOpen] = useState(false)
  function closeEdges() {
    setRightOpen(false)
  }

  // Close mobile drawer + edge menu when the route changes (covers back/forward).
  if (lastPath !== pathname) {
    setLastPath(pathname)
    if (drawerOpen) setDrawerOpen(false)
    if (rightOpen) closeEdges()
  }

  // ⌘K / Ctrl+K → open the live search overlay. Other surfaces (the admin command
  // bar) open it by dispatching an 'open-search' window event.
  const [searchOpen, setSearchOpen] = useState(false)
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setSearchOpen(true)
      }
    }
    function handleOpen() {
      setSearchOpen(true)
    }
    window.addEventListener('keydown', handleKey)
    window.addEventListener('open-search', handleOpen)
    return () => {
      window.removeEventListener('keydown', handleKey)
      window.removeEventListener('open-search', handleOpen)
    }
  }, [])

  function isActive(href: string) {
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
    // /admin is the section root with many sub-routes that are their own rail items
    // (QR Studio, Support, Insight, Vera, Hubs, Memberships). Match it EXACTLY so a
    // sub-route lights up only its own entry, not Overview/Admin too.
    if (href === '/admin')    return pathname === '/admin'
    return pathname === href || pathname.startsWith(href + '/')
  }

  // Scope-aware rail (PAGE-FRAMEWORK §3/§4): which rail (if any) frames the page
  // is decided by ONE declarative map — lib/layout/page-chrome.ts — not by a list
  // hand-maintained here. The GLOBAL rail shows on 'global' pages; it is suppressed
  // for 'scoped' entity-detail pages (they render their own scope rail in-body, no
  // double-rail trap) and for 'none' Focus pages (compose/edit/settings/operator
  // workspaces that read best full-width). To reframe a route, edit page-chrome.ts.
  // Effective right-rail mode: the operator's per-route override (page_chrome_overrides,
  // loaded server-side and passed in) wins over the code chrome map; absent → code default.
  const effectiveRail = mergeChrome(railFor(pathname), chromeOverrides ?? {}, pathname)
  const showSidebar = !!sidebar && effectiveRail === 'global'

  // Mini rail (immersive build surfaces — the Journey course builder). The GLOBAL rail is
  // still mounted (never removed), but on these routes it STARTS collapsed to a thin strip
  // so the builder gets the full center width; a foot toggle expands/collapses it. The
  // default comes from page-chrome (railStartsCollapsed); a member can flip it for the
  // current route, and the override resets when they navigate away — so the builder always
  // opens collapsed, per the design. Pure derivation (no effect): railOverride only applies
  // when its path matches the live pathname.
  const railCollapsible = showSidebar && railStartsCollapsed(pathname)
  const railCollapsed =
    railOverride?.path === pathname ? railOverride.collapsed : railCollapsible
  const toggleRail = () => setRailOverride({ path: pathname, collapsed: !railCollapsed })

  // The global MEMBER left rail is swapped out on workspace routes (today: /admin/*),
  // which mount their OWN left nav in their layout (the admin sidebar). Suppressing
  // the member rail here is what prevents a double left rail. Governed declaratively
  // by page-chrome.ts (leftRailFor) — the shell never path-sniffs.
  const showLeftRail = leftRailFor(pathname) === 'global'

  // The member sitemap footer (canvas, end of the center column, scrolls with the
  // page). Shown only on real MEMBER content pages: skip stripped shells
  // (hideAppNav), the admin workspace (leftRailFor → 'none'), and Focus/takeover
  // surfaces (railFor → 'none': on-air/scan/settings/compose). Stream/Index/
  // Dashboard and scoped-detail pages all keep it. One declarative rule, read from
  // the same page-chrome map the rails use — pages never toggle it.
  const showFooter = !hideAppNav && showLeftRail && effectiveRail !== 'none'

  // Admin secondary nav (mirrors the prior in-content admin mega bar, now promoted to a
  // FULL-WIDTH sub-header below the main header). Driven by the DB-backed `admin_subheader`
  // menu (lib/menus), whose top-level categories are the sub-header triggers; MegaBar resolves
  // each entry's mode for the viewer (menuViewerRole). The menu falls back to the code default
  // (assembled from ADMIN_NAV) when no DB row exists, so it never drifts pre-migration; the
  // pages themselves still re-gate server-side. Only on /admin* and never in stripped shells.
  const isAdminRoute = pathname === '/admin' || pathname.startsWith('/admin/')
  const adminMega: ResolvedMenu | null =
    !hideAppNav && isAdminRoute ? (adminMenu ?? defaultMenu('admin_subheader')) : null
  // True when the resolved admin menu has at least one top-level section to show.
  const showAdminMega = !!adminMega && adminMega.categories.length > 0

  function cycleTheme() {
    if (theme === 'system') setTheme('dark')
    else if (theme === 'dark') setTheme('light')
    else setTheme('system')
  }

  const ThemeIcon = theme === 'dark' ? Moon : theme === 'system' ? Monitor : Sun
  const themeLabel =
    theme === 'dark' ? 'Dark mode' : theme === 'light' ? 'Light mode' : 'System theme'

  return (
    // MindlessProvider + MovementProvider wrap the whole shell so the header
    // launcher AND every in-app page can open the global Mindless / Movement
    // timer overlays via useMindless() / useMovement(). Each renders a `fixed
    // inset-0 z-50` overlay, so they layer over everything.
    <MindlessProvider>
    <MovementProvider>
    {/* The document itself scrolls (not an inner pane) so the whole page renders in
        normal flow — full-page screenshot tools capture everything, and Next's native
        scroll restoration works. The header + side rails stay put via `sticky`. */}
    <div
      data-skin={skin}
      data-generation={generation}
      data-occasion={occasion === 'none' ? undefined : occasion}
      className="flex min-h-screen flex-col overflow-x-clip bg-canvas"
    >

      {/* ── Top bar ───────────────────────────────────────── */}
      <header className="sticky top-0 h-14 shrink-0 flex items-stretch bg-surface/90 backdrop-blur-sm border-b border-border z-30">

        {/* Engraved, interactive wordmark. Leads the bar — on mobile the menu now
            lives in the bottom tab bar, so the wordmark anchors the top-left. */}
        <BrandMark name={brandName} logoUrl={brandLogoUrl} />

        {/* Full-site browse nav ("Explore Frequency") beside the logo — the same
            component the splash/site uses. Vertically centered on the header line
            (items-center, not stretch) and at the rail link's color (no dimming), so
            it reads as a peer of the other header items. Its panel aligns to the page
            CONTENT COLUMN (panelAlign='content'), reserving the right rail width only
            when that rail is actually shown. Desktop only. */}
        {!hideAppNav && (
          <div className="ml-1 hidden items-center md:flex">
            <PrimaryNav
              variant="light"
              showDiscover={false}
              panelAlign="content"
              rightRail={showSidebar}
              discoverMenu={discoverMenu}
              exploreMenu={exploreMenu}
              viewerRole={menuViewerRole}
              timings={menuTimings}
            />
          </div>
        )}

        {/* Mobile demo toggle — tiny bolt + switch, dead centre of the tight
            header (the pill variant lives in the right cluster on sm+). */}
        {demoMode && hasDemoContent && (
          <div className="absolute inset-y-0 left-1/2 flex -translate-x-1/2 items-center sm:hidden">
            <DemoToggle initialHidden={demoHidden} variant="mini" />
          </div>
        )}

        {/* Right cluster: search · [messages · notifications] · account.
            Three groups, each set off by a hairline so the icons read as one
            tidy block of community actions and the account stays distinct.
            pr keeps the avatar off the screen edge below lg (the lg block is
            flush-right by design for the rail alignment). */}
        <div className="flex flex-1 min-w-0 items-center justify-end gap-1 pl-2.5 pr-2 md:gap-2 md:pl-4 lg:pr-0">

          {/* Demo-content toggle — sits to the LEFT of Search (desktop). Members
              hide/show seeded demo content for themselves; sized to match Search. */}
          {demoMode && hasDemoContent && <DemoToggle initialHidden={demoHidden} />}

          {/* Report a bug — Beta only (shown while demo mode is on). Opens the same
              support sheet as the account menu's "Report a bug", via the shared event. */}
          {demoMode && (
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent('open-support', { detail: { type: 'bug' } }))}
              title="Report a bug"
              className="hidden sm:flex items-center gap-1.5 rounded-full border border-warning/40 bg-warning-bg/40 px-3 py-1.5 text-sm font-medium text-warning hover:bg-warning-bg/70 transition-colors"
            >
              <Bug className="w-4 h-4" />
              <span className="hidden md:inline">Report a bug</span>
            </button>
          )}

          {/* Search pill — opens the live overlay. Desktop */}
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            title="Search (⌘K)"
            className="hidden sm:flex items-center gap-2 rounded-full border border-border bg-surface-elevated/70 pl-3 pr-2 py-1.5 text-sm text-muted hover:text-text hover:border-border-strong hover:bg-surface-elevated transition-colors"
          >
            <Search className="w-4 h-4" />
            <span>Search</span>
            <kbd className="text-3xs leading-none rounded px-1.5 py-1 border border-border bg-surface text-subtle">
              ⌘K
            </kbd>
          </button>

          {/* Search icon — opens the live overlay. Mobile */}
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            aria-label="Search"
            title="Search"
            className="sm:hidden flex items-center justify-center w-8 h-8 rounded-full text-muted hover:text-text hover:bg-surface-elevated transition-colors"
          >
            <Search className="w-5 h-5" />
          </button>

          {/* Right action block. On lg+ it's exactly the right rail's width (w-72) and
              sits flush to the viewport's right edge, so its LEADING divider (the "|"
              between Search and these actions) lines up with the right column's left
              border. Below lg (no right rail) it's a natural-width right-aligned cluster. */}
          <div className="flex items-center justify-end gap-1 sm:ml-1 sm:border-l sm:border-border sm:pl-1.5 md:gap-2 lg:ml-0 lg:min-w-72 lg:justify-start lg:pl-3 lg:pr-4">
            {/* Community actions: mindless · friends · messages · notifications · daily streak. */}
            {/* Mindless — the global practice timer overlay, openable from anywhere. */}
            <MindlessLaunch />
            {/* Friends — all sizes (mobile reaches Messages via the button on /friends). */}
            <HoverTip label="Friends">
              <Link
                href="/friends"
                aria-label="Friends"
                className="flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-full text-muted hover:text-text hover:bg-surface-elevated transition-colors"
              >
                <Users className="w-5 h-5" />
              </Link>
            </HoverTip>
            {/* Messages — desktop popover */}
            <HoverTip label="Messages" className="hidden sm:inline-flex">
              <MessagesPopover />
            </HoverTip>
            {/* Notifications — sits before the streak (swapped per request); shown on
                all sizes, tooltip on hover. */}
            <HoverTip label="Notifications">
              <NotificationBell initialUnread={unreadCount} />
            </HoverTip>
            {/* Daily check-in streak — links to your Quest dashboard. */}
            {Number((profile.meta as { daily_checkin_streak?: number } | null)?.daily_checkin_streak ?? 0) >= 1 && (
              <HoverTip label="Daily Streak" className="hidden sm:inline-flex">
                <Link
                  href="/crew"
                  aria-label="Daily Streak. Open your Quest dashboard"
                  className="inline-flex items-center gap-1 rounded-full bg-primary-bg px-2 py-1 text-xs font-bold text-primary-strong transition-colors hover:bg-primary-bg/70"
                >
                  <Flame className="w-3.5 h-3.5" />
                  {Number((profile.meta as { daily_checkin_streak?: number } | null)?.daily_checkin_streak ?? 0)}
                </Link>
              </HoverTip>
            )}

            {/* Account — its own divider, pushed to the far right of the block on lg+. */}
            <div className="flex items-center gap-1.5 ml-2 pl-2.5 border-l border-border md:gap-2 md:pl-2.5 lg:ml-auto">
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
        </div>
      </header>

      {/* ── Admin sub-header ───────────────────────────────── */}
      {/* In admin, a SECOND full-width bar opens below the main header. It is in normal
          flow (so it PUSHES the body down) and sticky under the main header (top-14). Its
          triggers align to the content column (a left rail-width spacer), and the MegaBar
          panel slides out from under it with panelAlign='content' (no rightRail — admin has
          no member right rail), so the slide-out stays in the page content column. */}
      {showAdminMega && adminMega && (
        <div className="sticky top-14 z-20 hidden border-b border-border bg-surface/95 backdrop-blur-sm md:block">
          <div className="mx-auto flex h-12 max-w-[105rem] items-center gap-8 px-4 sm:px-6 lg:px-8">
            <div className="hidden w-48 shrink-0 md:block" aria-hidden />
            <div className="min-w-0 flex-1">
              <MegaBar
                menus={[adminMega]}
                triggerLevel="category"
                viewerRole={menuViewerRole}
                variant="light"
                ariaLabel="Admin"
                panelAlign="content"
                timings={menuTimings}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Body ──────────────────────────────────────────── */}
      {/* DockRevealProvider runs the single shared scroll listener that rises
          both bottom docks together (left profile, right stats). */}
      <DockRevealProvider>
      {/* Both rails now live IN normal flow inside the one shared page scroll, so the
          LEFT nav scrolls up with the content exactly like the right rail (its profile
          card sits at the bottom of the column and rides up with the page). */}
      <div className="flex min-w-0 flex-1">
        <div
          data-feed-scroll
          className="min-w-0 flex-1 pb-[calc(3.5rem_+_env(safe-area-inset-bottom))] md:pb-0"
        >
          {/* The page-admin context wraps the whole content row (not just <main>) so the
              settings drawer — mounted in the right-rail slot — can read the viewer's
              role / staffRole / webRole gates alongside the page body. */}
          <PageAdminProvider value={{ role: gateRole, staffRole, webRole }}>
          <div className="mx-auto flex w-full max-w-[105rem] items-stretch gap-8 px-4 sm:px-6 lg:px-8 min-h-[calc(100vh-3.5rem)]">

            {/* Left nav — NEVER scrolls out of view. Pinned under the header
                (sticky top-14) with its window ending exactly where the fixed
                bottom-left profile box begins (the 8rem in the max-h), so the
                menu's bottom always sits against that box while the content
                column scrolls past. A menu taller than the window scrolls
                INTERNALLY instead of riding the page. */}
            {showLeftRail && (
              <aside className="hidden md:flex w-48 shrink-0 flex-col">
                {/* The menu + profile footer live in NORMAL FLOW and scroll WITH the page
                    (no sticky pin, no inner scrollbar): the menu rides up as you scroll and
                    the profile card sits at the bottom of the column, revealed as you reach
                    the end of the page — like the right rail's dock. */}
                {/* No outer px here: items carry their own px-3, so their hover boxes sit flush
                    to the column edge — matching the right rail's cards, so the outer margin reads
                    the same on both sides. */}
                <nav className="flex-1 py-3 space-y-1">
                  <NavLinkList isActive={isActive} role={gateRole} extraSections={extraSections} hideAppNav={hideAppNav} permissions={permissions} navAccess={navAccess} staffRole={staffRole} sections={navSections} />
                </nav>
                {/* Mirrors the right rail's stats dock: sticky to the column bottom, rises
                    on scroll, no longer fixed to the viewport. */}
                {/* Bottom-left profile card — the admin canvas corner-tab skin (rounded top,
                    hairline, canvas-tinted blur), sticky to the column bottom like the right
                    stats dock. Mirrors components/admin/admin-profile-card.tsx's wrapper. */}
                <div className="sticky bottom-0 z-10 rounded-t-2xl border-x border-t border-border/70 bg-[var(--color-canvas)]/95 px-1.5 pt-1 backdrop-blur-sm">
                  {!hideAppNav && role === 'member' && <UpgradeCrew />}
                  <ProfileCard profile={profile} role={role} realRole={effectiveRealRole} profileHref={profileHref} previewVisitor={previewVisitor} />
                </div>
              </aside>
            )}

            {/* Center column — an ambient dispatch ticker pinned on top, then the
                page content. Navigation lives entirely in the single left rail
                (Feed + sections); the right rail sits beside this in the shared
                scroll. */}
            <div className="flex-1 min-w-0 flex flex-col">
              {!hideAppNav && ticker}
              {/* More side buffer (px-8/lg:px-10) so content isn't tight against the
                  rails. The page-admin "Settings" bar now renders INSIDE each page
                  template's header (on the divider under the title), fed by this
                  provider — not floating above the page. */}
              <main className="flex-1 min-w-0 py-6" data-tour-anchor="content">
                <Breadcrumbs />
                {children}
                {showFooter && (
                  <MemberFooter role={gateRole} staffRole={staffRole} navAccess={navAccess} />
                )}
              </main>
            </div>

            {/* Right sidebar. Only on lg+, dropped on admin / takeover surfaces (railFor
                'none'). The <aside> spans the full content height (flex column) so the
                rail's top widgets scroll up and out, bringing the stats dock up into view
                as you near the end; its left border is a full-height divider. The rail STAYS
                mounted when the settings drawer opens — the drawer overlays this same column
                (mounted inside the expanded aside below), bounded by the content's right edge. */}
            {showSidebar && (
              // Rail COLUMN wrapper. Its width is the rail at rest, or the live settings-drawer
              // width while the drawer is open — so the drawer slides over the rail (covering it)
              // and, as its grab handle widens it, THIS column grows and the center `flex-1`
              // compresses to match. `justify-end` keeps the rail content pinned right; the drawer
              // (absolute, full column) overlays it. The width transition is dropped mid-drag so
              // the column tracks the pointer 1:1.
              <div
                className={`relative hidden shrink-0 justify-end lg:flex ${
                  settings.resizing ? '' : 'transition-[width] duration-200 ease-out motion-reduce:transition-none'
                }`}
                style={{ width: settings.open ? settings.width : railCollapsed ? 56 : 288 }}
              >
                {railCollapsed ? (
                  // Mini rail — the global community rail collapsed to a thin strip. It shows ICONS
                  // for the rail's items (the Quest stats); clicking any reopens the rail. The
                  // collapse/expand TOGGLE sits at the BOTTOM. The rail is never removed.
                  <aside className="flex w-14 shrink-0 flex-col items-center border-l border-border/60 py-6">
                    <div className="flex flex-col items-center gap-1.5">
                      {([['Quest', Zap], ['Gems', Gem], ['Streak', Flame]] as const).map(([label, Icon]) => (
                        <button
                          key={label}
                          type="button"
                          onClick={toggleRail}
                          title={`${label} — open the rail`}
                          aria-label={`${label} — open the rail`}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-muted transition-colors hover:bg-surface-elevated hover:text-text"
                        >
                          <Icon className="h-5 w-5" aria-hidden />
                        </button>
                      ))}
                    </div>
                    <div className="flex-1" />
                    <button
                      type="button"
                      onClick={toggleRail}
                      title="Show the rail"
                      aria-label="Show the rail"
                      className="sticky bottom-6 inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface text-muted shadow-sm transition-colors hover:border-border-strong hover:text-text"
                    >
                      <ChevronsLeft className="h-5 w-5" aria-hidden />
                    </button>
                  </aside>
                ) : (
                  <aside className="flex w-72 shrink-0 flex-col py-6">
                    {sidebar}
                    {railCollapsible && (
                      // The collapse TOGGLE at the BOTTOM, sticky so it stays visible as the rail
                      // scrolls. A chevron toggle (not a hamburger), mirroring the collapsed state.
                      <div className="sticky bottom-4 mt-2 flex justify-end">
                        <button
                          type="button"
                          onClick={toggleRail}
                          title="Hide the rail"
                          aria-label="Hide the rail"
                          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface/95 text-muted shadow-sm backdrop-blur-sm transition-colors hover:border-border-strong hover:text-text"
                        >
                          <ChevronsRight className="h-5 w-5" aria-hidden />
                        </button>
                      </div>
                    )}
                  </aside>
                )}
                {/* The settings drawer slides over THIS column (absolute, full height) on the
                    `open-settings` event, reporting its width up so the column sizes to match. */}
                <SettingsDrawer onStateChange={setSettings} />
              </div>
            )}
          </div>
          </PageAdminProvider>
        </div>

      </div>
      </DockRevealProvider>

      {/* ── Live search overlay (⌘K or the header search) ─────────────────── */}
      {searchOpen && <SearchOverlay onClose={() => setSearchOpen(false)} />}

      {/* Page-specific admin now lives inline at the top of the content
          (PageAdminBar in <main>), replacing the old right-edge admin drawer. */}

      {/* ── Mobile right drawer — The Quest (stats / streaks / gamification),
            opened only from the tab bar's gem. Mirrors the left drawer. ── */}
      {!hideAppNav && statsPanel && (
        <MobileRightDrawer open={rightOpen} onClose={closeEdges}>
          {statsPanel}
        </MobileRightDrawer>
      )}

      {/* ── Mobile bottom tab bar ─────────────────────────── */}
      {/* Feed · Circles · Channels · Events · Menu/stats arrows. Opening one side
          closes the other — never both drawers at once. */}
      <MobileTabBar
        isActive={isActive}
        onOpenMenu={() => {
          setDrawerOpen((o) => !o)
          setRightOpen(false)
        }}
        onOpenStats={() => {
          setRightOpen((o) => !o)
          setDrawerOpen(false)
        }}
        menuOpen={drawerOpen}
        statsOpen={rightOpen}
        hideAppNav={hideAppNav}
      />

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
        navAccess={navAccess}
        staffRole={staffRole}
        sections={navSections}
      />

    </div>
    </MovementProvider>
    </MindlessProvider>
  )
}
