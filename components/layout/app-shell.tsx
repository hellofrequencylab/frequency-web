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
  Camera,
  Users,
  X,
  Gem,
  Monitor,
  ChevronUp,
  ChevronRight,
  ChevronLeft,
  Maximize2,
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
import { NAV_AREAS, meetsAccess, meetsStaff, type NavAccess } from '@/lib/nav-areas'
import type { AccessLevel } from '@/lib/core/access-matrix'
import type { StaffRole, StaffDomain } from '@/lib/staff'
import type { ProfileIdentity } from '@/lib/types/profile'
import { PrimaryNav } from '@/components/layout/primary-nav'
import { BrandMark } from '@/components/layout/brand-mark'
import { AREA_ICONS } from '@/components/layout/nav-icons'
import { UpgradeCrew } from '@/components/layout/upgrade-crew'
import { DemoToggle } from '@/components/layout/demo-toggle'
import { DockRevealProvider } from '@/components/sidebar/dock-reveal'
import { railFor } from '@/lib/layout/page-chrome'
import { SearchOverlay } from '@/components/search/search-overlay'
import { PageAdminProvider } from '@/components/layout/page-admin-context'

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
// pinned top), then the worlds — Practice · Community · The Quest — and finally
// Manage, split into four axis-gated groups (Steward · Structure · Studio ·
// Platform). Sections and their order are derived entirely from NAV_AREAS (no
// hardcoded section list). The desktop rail and mobile drawer render the same set.
const NAV_SECTIONS = buildSections([...NAV_AREAS])

// The Manage sections TELESCOPE: an item the viewer can't reach is hidden (not
// muted), and a group with nothing reachable is skipped entirely (header included)
// — so a member never sees empty admin headers and a host isn't shown greyed-out
// janitor tools. Member worlds (Community, The Quest) still mute/preview instead,
// as aspirational surfaces.
const TELESCOPE_SECTIONS = new Set(['Steward', 'Structure', 'Studio', 'Platform'])

// Split the rail for mobile: the member worlds vs the axis-gated Manage groups. On
// a phone the member worlds stay in the drawer / edge menus while Manage moves to
// the avatar (initials) menu, so the primary nav stays calm. Desktop shows both in
// the left rail. (Manage = the TELESCOPE groups.)
const MEMBER_SECTIONS = NAV_SECTIONS.filter((s) => !TELESCOPE_SECTIONS.has(s.label ?? ''))
const MANAGE_SECTIONS = NAV_SECTIONS.filter((s) => TELESCOPE_SECTIONS.has(s.label ?? ''))

// The effective access for an area = a janitor's per-area override, if any,
// else the code default. `role` is the viewer's community role (null = visitor).
function effectiveAccess(
  item: MainNavItem,
  permissions: Record<string, NavAccess> | undefined,
): NavAccess {
  return permissions?.[item.key] ?? item.defaultAccess
}

// Matrix-driven reachability (owner directive): a nav item shows if the viewer has ANY
// access (limited or full) to its surface — for ANY hat (role / tier / persona / staff),
// no matter where it sits in the menu. `navAccess` is the server-resolved access level
// per key (lib/core/access-matrix via getViewerHats). Falls back to the role/staff ladder
// when absent. Staff-domain unlocks always apply (finer than the matrix's coarse columns).
function itemReachable(
  item: MainNavItem,
  role: CommunityRole | null,
  staffRole: StaffRole | null,
  permissions: Record<string, NavAccess> | undefined,
  navAccess: Record<string, AccessLevel> | undefined,
): boolean {
  // Known nav items resolve via the matrix; dynamic extras (not in the map) keep the
  // role/staff ladder so a missing key never hides a pinned/extra item.
  if (navAccess && item.key in navAccess) return navAccess[item.key] !== 'none' || meetsStaff(item, staffRole)
  return meetsAccess(effectiveAccess(item, permissions), role) || meetsStaff(item, staffRole)
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
  // long scroll. The quick-actions panel opens ONLY on tapping the chevron — it
  // never rises on scroll or hover (that was disorienting); it stays put until the
  // member chooses to open it.
  const [manualOpen, setManualOpen] = useState(false)
  const open = manualOpen

  return (
    <div className="border-t border-border">
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
  gateRole,
  staffRole,
  permissions,
  navAccess,
  isActive,
  themeLabel,
  ThemeIcon,
  cycleTheme,
}: {
  profile: Profile
  profileHref: string
  role: CommunityRole
  /** Gating role (respects "view as") used to telescope the mobile Manage groups. */
  gateRole: CommunityRole | null
  staffRole: StaffRole | null
  permissions?: Record<string, NavAccess>
  navAccess?: Record<string, AccessLevel>
  isActive: (href: string) => boolean
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
  // Mobile-only: the Manage groups the viewer can actually reach (telescoped), so
  // global admin lives in the initials menu on a phone (desktop keeps it in the rail).
  const hasManage = MANAGE_SECTIONS.some((s) =>
    s.items.some((it) => itemReachable(it, gateRole, staffRole, permissions, navAccess)),
  )

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

          {/* Crew dashboard. Role-gated. (Admin lives in the page admin dock +
              the primary nav's Manage sections, not here.) */}
          {showCrewLink && (
            <div className="border-t border-border py-1">
              <Link
                href="/crew"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 px-3 py-2 text-sm text-text hover:bg-surface-elevated transition-colors"
              >
                <Zap className="w-4 h-4 text-primary" />
                Dashboard
              </Link>
            </div>
          )}

          {/* Manage — mobile only. On desktop these live in the left rail; on a
              phone the primary nav stays member-only and admin lives here. */}
          {hasManage && (
            <div className="md:hidden border-t border-border py-1">
              <NavLinkList
                isActive={isActive}
                role={gateRole}
                staffRole={staffRole}
                permissions={permissions}
                navAccess={navAccess}
                sections={MANAGE_SECTIONS}
                onNavigate={() => setOpen(false)}
              />
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
    `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
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
        // Admin sections telescope: keep only reachable items, and skip the whole
        // group (header included) when nothing is reachable.
        const adminSection = TELESCOPE_SECTIONS.has(section.label ?? '')
        const visibleItems = adminSection
          ? section.items.filter((it) => itemReachable(it, role, staffRole, permissions, navAccess))
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
            // Member worlds always show (muting/preview below); admin sections were
            // pre-filtered to reachable items above.
            const reachable = itemReachable(item, role, staffRole, permissions, navAccess)

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
            // Preview-able areas (the Quest) stay CLICKABLE but read as a muted
            // "dead" state for below-access viewers; the page gates engagement.
            if (!reachable && item.preview) {
              const active = isActive(href)
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={onNavigate}
                  title="Preview. Upgrade to Crew to engage"
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
          <NavLinkList isActive={isActive} role={role} onNavigate={onClose} extraSections={extraSections} hideAppNav={hideAppNav} permissions={permissions} navAccess={navAccess} staffRole={staffRole} sections={MEMBER_SECTIONS} />
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
  const tabClass = (active: boolean) =>
    `flex flex-1 flex-col items-center justify-end gap-1 pb-1.5 text-3xs font-medium transition-colors ${
      active ? 'text-primary-strong' : 'text-muted hover:text-text'
    }`

  const renderTab = (tab: { key: string; href: string; label: string }) => {
    const Icon = AREA_ICONS[tab.key] ?? Globe
    const active = isActive(tab.href)
    return (
      <Link key={tab.key} href={tab.href} aria-label={tab.label} className={tabClass(active)}>
        <Icon className="h-[22px] w-[22px]" strokeWidth={active ? 2.5 : 2} />
        <span className="leading-none">{tab.label}</span>
      </Link>
    )
  }

  const arrow = 'flex w-7 shrink-0 items-center justify-center text-muted transition-colors hover:text-text'

  return (
    <nav
      className="md:hidden fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t border-border bg-surface/95 backdrop-blur-sm"
      style={{
        height: 'calc(4rem + env(safe-area-inset-bottom))',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {/* One continuous arch — a bump in the bar's top edge that rises up & over the
          Capture button, so the whole bar reads as a single shape. */}
      {!hideAppNav && (
        <span
          aria-hidden
          className="pointer-events-none absolute bottom-full left-1/2 -mb-px h-5 w-[4.75rem] -translate-x-1/2 rounded-t-full border-x border-t border-border bg-surface"
        />
      )}

      {/* Left arrow → nav menu. Points IN (›) to expand, OUT (‹) to collapse. */}
      <button type="button" onClick={onOpenMenu} aria-label={menuOpen ? 'Close menu' : 'Open menu'} aria-expanded={menuOpen} className={arrow}>
        {menuOpen ? <ChevronLeft className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
      </button>

      {!hideAppNav && MOBILE_TABS.slice(0, 2).map(renderTab)}

      {/* Capture — the circle sticks up above the bar; the label is bottom-aligned
          with the other tabs (which are justify-end now). */}
      {!hideAppNav && (
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent('open-capture', { detail: { mode: 'post' } }))}
          aria-label="Capture a moment"
          className="relative flex flex-1 flex-col items-center justify-end gap-1 pb-1.5 text-3xs font-semibold text-primary-strong"
        >
          <span className="-mt-6 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-on-primary shadow-pop">
            <Camera className="h-[22px] w-[22px]" strokeWidth={2.5} />
          </span>
          <span className="leading-none">Capture</span>
        </button>
      )}

      {!hideAppNav && MOBILE_TABS.slice(2).map(renderTab)}

      {/* Right arrow → stats. Points IN (‹) to expand, OUT (›) to collapse. */}
      {!hideAppNav && (
        <button type="button" onClick={onOpenStats} aria-label={statsOpen ? 'Close stats' : 'Open stats'} aria-expanded={statsOpen} className={arrow}>
          {statsOpen ? <ChevronRight className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
        </button>
      )}
    </nav>
  )
}

// ── Mobile edge menu (right = stats/streaks) ──────────────────────────────────
// A sliding panel opened ONLY by the bottom tab bar's arrow (no mid-screen edge
// tab — one trigger, one menu). It stays open until you tap outside (the shared
// backdrop), select a link (route change), scroll, or open the opposite drawer
// (the shell closes one side when the other opens). A Micro / Full size selector
// sits at the bottom (per-device setting). The panel is always mounted and slides
// on a transform, so open/close animates. Mobile only — desktop uses the real rails.

export type RailSize = 'micro' | 'full'

function EdgeMenu({
  side,
  ariaLabel,
  size,
  onSizeChange,
  open,
  micro,
  children,
}: {
  side: 'left' | 'right'
  ariaLabel: string
  size: RailSize
  onSizeChange: (s: RailSize) => void
  open: boolean
  /** The collapsed body — a single icon column. */
  micro: React.ReactNode
  /** The expanded body — full, content-appropriate. */
  children: React.ReactNode
}) {
  const onLeft = side === 'left'
  const widthClass =
    size === 'micro' ? 'w-16' : onLeft ? 'w-64 max-w-[80vw]' : 'w-[88vw] max-w-sm'
  // Closed → slid fully off its own edge; open → flush. Transitions both ways.
  const slideClass = open ? 'translate-x-0' : onLeft ? '-translate-x-full' : 'translate-x-full'

  return (
    <>
      {/* Panel — always mounted, slides in/out (and animates its width on resize).
          Soft easing both ways. */}
      <aside
        role="dialog"
        aria-label={ariaLabel}
        aria-hidden={!open}
        className={`md:hidden fixed top-14 z-40 flex flex-col border-border bg-surface shadow-xl transition-all duration-300 ease-in-out ${
          onLeft ? 'left-0 border-r' : 'right-0 border-l'
        } ${widthClass} ${slideClass} ${open ? '' : 'pointer-events-none'}`}
        style={{ bottom: 'calc(4rem + env(safe-area-inset-bottom))' }}
      >
        <div className="flex-1 overflow-y-auto">{size === 'micro' ? micro : children}</div>

        {/* Bottom control. In micro it's a single expand button (the column is too
            narrow for a segmented control); in full it's the Micro/Full picker
            (shared per-device across both menus). */}
        {size === 'micro' ? (
          <button
            type="button"
            onClick={() => onSizeChange('full')}
            aria-label="Expand menu"
            className="flex shrink-0 items-center justify-center border-t border-border p-2.5 text-subtle transition-colors hover:text-text"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
        ) : (
          <div className="flex shrink-0 items-center gap-2 border-t border-border p-2">
            <span className="flex-1 pl-1 text-2xs font-semibold uppercase tracking-wide text-subtle">View</span>
            <div className="flex items-center rounded-lg bg-surface-elevated p-0.5">
              {(['micro', 'full'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => onSizeChange(s)}
                  aria-pressed={size === s}
                  className={`rounded-md px-2.5 py-1 text-2xs font-semibold capitalize transition-colors ${
                    size === s ? 'bg-surface text-text shadow-sm' : 'text-subtle hover:text-text'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
      </aside>
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
  navAccess,
  staffRole = null,
  demoMode = false,
  demoHidden = false,
  hasDemoContent = true,
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
}) {
  const pathname = usePathname()
  const role = (profile.community_role ?? 'member') as CommunityRole
  const effectiveRealRole = realRole ?? role
  // Nav gating role: a visitor preview gates as a logged-out visitor (null).
  const gateRole: CommunityRole | null = previewVisitor ? null : role
  // Stewards (host+) and Studio staff get a mobile quick-add for the Profile
  const profileHref = `/people/${profile.handle}`
  const { theme, setTheme } = useTheme()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [lastPath, setLastPath] = useState(pathname)

  // Mobile right edge menu (stats) — opened only from the bottom tab bar's arrow.
  // Micro/Full size preference is per device. The left side is the nav DRAWER
  // (drawerOpen, also bottom-bar triggered); the shell keeps the two mutually
  // exclusive — opening one closes the other.
  const [railSize, setRailSize] = useState<RailSize>('micro')
  const [rightOpen, setRightOpen] = useState(false)
  function closeEdges() {
    setRightOpen(false)
  }
  useEffect(() => {
    // One-time hydration of client-only prefs: server + first client render both see
    // the defaults → no hydration mismatch; we sync to the stored values after
    // mount. (This is the legitimate effect→setState case.)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (localStorage.getItem('freq-rail-size') === 'full') setRailSize('full')
  }, [])
  function changeRailSize(s: RailSize) {
    localStorage.setItem('freq-rail-size', s)
    setRailSize(s)
  }

  // Close mobile drawer + edge menu when the route changes (covers back/forward).
  if (lastPath !== pathname) {
    setLastPath(pathname)
    if (drawerOpen) setDrawerOpen(false)
    if (rightOpen) closeEdges()
  }

  // Scrolling the feed closes the open edge menu.
  useEffect(() => {
    if (!rightOpen) return
    const el = document.querySelector('[data-feed-scroll]') as HTMLElement | null
    if (!el) return
    let lastTop = el.scrollTop
    const onScroll = () => {
      if (Math.abs(el.scrollTop - lastTop) > 6) closeEdges()
      lastTop = el.scrollTop
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [rightOpen])

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
    // The document itself scrolls (not an inner pane) so the whole page renders in
    // normal flow — full-page screenshot tools capture everything, and Next's native
    // scroll restoration works. The header + side rails stay put via `sticky`.
    <div className="flex min-h-screen flex-col bg-canvas">

      {/* ── Top bar ───────────────────────────────────────── */}
      <header className="sticky top-0 h-14 shrink-0 flex items-stretch bg-surface/90 backdrop-blur-sm border-b border-border z-30">

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
        <div className="flex flex-1 items-center justify-end gap-1 pl-2.5 md:gap-2 md:pl-4">

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
          <div className="flex items-center justify-end gap-1 sm:ml-1 sm:border-l sm:border-border sm:pl-1.5 md:gap-2 lg:ml-0 lg:w-72 lg:justify-start lg:pl-3 lg:pr-4">
            {/* Community actions: friends · messages · notifications · daily streak. */}
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
            <div className="flex items-center gap-1 ml-1 pl-1.5 border-l border-border md:gap-2 md:pl-2 lg:ml-auto">
              <AccountDropdown
                profile={profile}
                profileHref={profileHref}
                role={role}
                gateRole={gateRole}
                staffRole={staffRole}
                permissions={permissions}
                navAccess={navAccess}
                isActive={isActive}
                themeLabel={themeLabel}
                ThemeIcon={ThemeIcon}
                cycleTheme={cycleTheme}
              />
            </div>
          </div>
        </div>
      </header>

      {/* ── Body ──────────────────────────────────────────── */}
      {/* DockRevealProvider runs the single shared scroll listener that rises
          both bottom docks together (left profile, right stats). */}
      <DockRevealProvider>
      {/* Both rails now live IN normal flow inside the one shared page scroll, so the
          LEFT nav scrolls up with the content exactly like the right rail (its profile
          card sits at the bottom of the column and rides up with the page). */}
      <div className="flex flex-1">
        <div
          data-feed-scroll
          className="flex-1 min-w-0 pb-[calc(4rem_+_env(safe-area-inset-bottom))] md:pb-0"
        >
          <div className="flex items-stretch min-h-[calc(100vh-3.5rem)]">

            {/* Left nav — in-flow column; the NAV scrolls up with the page (matching
                the right rail), while the profile card is pinned to the bottom-left
                viewport (rendered fixed, below). The extra bottom padding keeps the
                last nav items clear of the pinned footer. */}
            <aside className="hidden md:flex w-52 shrink-0 flex-col border-r border-border bg-surface/80 backdrop-blur-sm">
              {/* Community spaces + features + admin rail (the Broadcast bar lives up top) */}
              <nav className="flex-1 px-3 pt-3 pb-32 space-y-0.5">
                <NavLinkList isActive={isActive} role={gateRole} extraSections={extraSections} hideAppNav={hideAppNav} permissions={permissions} navAccess={navAccess} staffRole={staffRole} />
              </nav>
            </aside>

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
              <main className="flex-1 min-w-0 px-6 py-6 sm:px-8 lg:px-10" data-tour-anchor="content">
                <Breadcrumbs />
                <PageAdminProvider value={{ role: gateRole, staffRole }}>
                  {children}
                </PageAdminProvider>
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

        {/* Pinned bottom-left footer — the Upgrade tab + profile card stay fixed to
            the viewport while the nav above scrolls with the page. Desktop only;
            matches the left rail's width + chrome. */}
        <div className="hidden md:flex fixed bottom-0 left-0 z-20 w-52 flex-col border-r border-t border-border bg-surface/95 backdrop-blur-sm">
          {!hideAppNav && role === 'member' && <UpgradeCrew />}
          <ProfileCard profile={profile} role={role} realRole={effectiveRealRole} profileHref={profileHref} previewVisitor={previewVisitor} />
        </div>
      </div>
      </DockRevealProvider>

      {/* ── Live search overlay (⌘K or the header search) ─────────────────── */}
      {searchOpen && <SearchOverlay onClose={() => setSearchOpen(false)} />}

      {/* Page-specific admin now lives inline at the top of the content
          (PageAdminBar in <main>), replacing the old right-edge admin drawer. */}

      {/* ── Mobile right edge menu — stats / streaks / gamification, opened only
            from the bottom tab bar's right arrow. The left side is the nav drawer
            (also bottom-bar triggered); one side open closes the other. ── */}
      {!hideAppNav && statsPanel && (
        <>
          {/* Fading backdrop — a tap anywhere outside closes the menu. */}
          <div
            aria-hidden
            onClick={closeEdges}
            className={`md:hidden fixed inset-0 z-30 bg-black/10 transition-opacity duration-300 ease-in-out ${
              rightOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}
          />
          <EdgeMenu
            side="right"
            ariaLabel="Streaks & stats"
            size={railSize}
            onSizeChange={changeRailSize}
            open={rightOpen}
          micro={
            <div className="flex flex-col items-center gap-1.5 p-2">
              <Link
                href="/crew"
                aria-label="Streak"
                title="Streak"
                onClick={closeEdges}
                className="flex h-11 w-11 items-center justify-center rounded-xl text-muted transition-colors hover:bg-surface-elevated hover:text-text"
              >
                <Flame className="h-5 w-5" strokeWidth={2} />
              </Link>
              <Link
                href="/crew"
                aria-label="Zaps this season"
                title="Zaps this season"
                onClick={closeEdges}
                className="flex flex-col items-center gap-0.5 rounded-xl px-1 py-1.5 text-muted transition-colors hover:bg-surface-elevated"
              >
                <Zap className="h-5 w-5 text-primary" strokeWidth={2.5} />
                <span className="text-3xs font-bold tabular-nums text-text">
                  {(profile.current_season_zaps ?? 0).toLocaleString()}
                </span>
              </Link>
              <Link
                href="/crew"
                aria-label="Gems"
                title="Gems"
                onClick={closeEdges}
                className="flex flex-col items-center gap-0.5 rounded-xl px-1 py-1.5 text-muted transition-colors hover:bg-surface-elevated"
              >
                <Gem className="h-5 w-5 text-signal" strokeWidth={2.5} />
                <span className="text-3xs font-bold tabular-nums text-text">
                  {(profile.lifetime_gems ?? 0).toLocaleString()}
                </span>
              </Link>
            </div>
          }
        >
          <div className="p-3">{statsPanel}</div>
          </EdgeMenu>
        </>
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
      />

    </div>
  )
}
