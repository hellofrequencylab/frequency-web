'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useState, useEffect, useCallback, useMemo, useSyncExternalStore } from 'react'
import {
  Moon,
  Sun,
  Zap,
  Search,
  Users,
  X,
  Gem,
  Monitor,
  ChevronUp,
  Flame,
  Bug,
} from 'lucide-react'
import { getInitials } from '@/lib/utils'
import { canChooseMode } from '@/lib/theme/mode'
import { hasAccount } from '@/lib/theme/apply-mode'
import { avatarSrc, avatarFocusStyle } from '@/lib/images/avatar-focus'
import { NotificationBell } from '@/components/layout/notification-bell'
import { HoverTip } from '@/components/ui/hover-tip'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { ContextSwitcher } from '@/components/layout/context-switcher'
import { DockBar, DOCK_HEAD_H_CLASS, RAIL_END_SENTINEL_ID } from '@/components/layout/dock-bar'
import type { AvailableContext, OperatorContext } from '@/lib/context/operator-context'
import {
  type CommunityRole,
  RoleBadge,
} from '@/lib/community-roles'
import { type NavAccess } from '@/lib/nav-areas'
import type { AccessLevel } from '@/lib/core/access-matrix'
import type { StaffRole } from '@/lib/staff'
import { PrimaryNav } from '@/components/layout/primary-nav'
import type {
  MenuAccess,
  MenuSettings,
  ResolvedMenu,
} from '@/lib/menus/types'
import { MyFrequencyMenu } from '@/components/layout/my-frequency-menu'
import type { MyFrequency } from '@/lib/nav/my-frequency'
import { BrandMark } from '@/components/layout/brand-mark'
import { Wordmark } from '@/components/layout/wordmark'
import { MemberFooter } from '@/components/layout/member-footer'
import { UpgradeCrew } from '@/components/layout/upgrade-crew'
import { DemoToggle } from '@/components/layout/demo-toggle'
import { railFor, leftRailFor, mergeChrome, railStartsCollapsed, isFullViewportEditor, isFullWidthEditor, type ChromeOverrides , ownsBreadcrumb } from '@/lib/layout/page-chrome'
import {
  DEFAULT_RAIL_FOLDS,
  nextRailFold,
  railFoldsSnapshot,
  resolveRailFold,
  setRailFolds,
  subscribeRailFolds,
  type RailFolds,
  type RailSide,
} from '@/lib/layout/rail-fold'
import { RailFoldTick } from '@/components/layout/rail-fold-control'
import type { AppOverrides } from '@/lib/apps/overrides'
import { isJanitor, type WebRole } from '@/lib/core/roles'
import type { Capability } from '@/lib/core/capabilities'
import { SearchOverlay } from '@/components/search/search-overlay'
import { PageAdminProvider } from '@/components/layout/page-admin-context'
import { AdminBar, type AdminBarState } from '@/components/layout/admin-bar/admin-bar'
import { EntityLayoutMount } from '@/components/entity-blocks/profile-layout-context'
import { MindlessProvider, useMindless } from '@/components/on-air/mindless'
import { MovementProvider } from '@/components/on-air/movement'
import { LotusIcon } from '@/components/on-air/icons'
import { AccountDropdown, ProfileCard, useTheme } from './app-shell-account'
import { NavLinkList, type NavSection } from './app-shell-nav-list'
import { MobileTabBar } from './app-shell-mobile'
import {
  NAV_SECTIONS,
  menuToSections,
  sectionsFromKeys,
  type NavSectionGroup,
  type Profile,
} from './app-shell-nav'

// LIVE-412: nav helpers, account dock, rail list, and mobile tab bar live in
// sibling modules. This file keeps the layout chrome (header, rails, drawer).
// The sidebar + community bar are built from NAV_AREAS (lib/nav-areas.ts — the
// single source of truth shared with the permission grid). The whole menu is
// ALWAYS shown; an item the viewer can't reach renders muted (greyed, non-
// clickable). Each area's access level can be overridden per-area from
// /admin/roles; those overrides are passed in via the `permissions` prop and
// merged on top of the code defaults. To add/move a link or change its baseline
// access (or placement), edit lib/nav-areas.ts; to give it an icon, add a key in
// components/layout/nav-icons.ts.

// ── Mobile left drawer ───────────────────────────────────────────────────────

/** The Vault region revealed inside the drawer's identity card. Named once so the chevron's
 *  `aria-controls` and the region it points at can never drift apart. */
const DRAWER_VAULT_ID = 'fq-drawer-vault'

function MobileLeftDrawer({
  open,
  onClose,
  role,
  identityRole,
  operatorContext,
  availableContexts = [],
  profile,
  profileHref,
  isActive,
  extraSections,
  hideAppNav = false,
  permissions,
  navAccess,
  staffRole = null,
  operatesSpaces = false,
  sections = NAV_SECTIONS,
  menuDriven = false,
  myFrequency = null,
  mobileStats,
}: {
  open: boolean
  onClose: () => void
  role: CommunityRole | null
  /** The viewer's actual community role — drives the identity badge (not gated). */
  identityRole: CommunityRole
  /** Operator-identity context (framing) — powers the mobile context switcher. */
  operatorContext?: OperatorContext
  /** Contexts the caller may switch into (server-derived). */
  availableContexts?: AvailableContext[]
  profile: Profile
  profileHref: string
  isActive: (href: string) => boolean
  extraSections?: NavSection[]
  hideAppNav?: boolean
  permissions?: Record<string, NavAccess>
  navAccess?: Record<string, AccessLevel>
  staffRole?: StaffRole | null
  /** Does the viewer own/run at least one Space? Forwarded to NavLinkList for the data gate. */
  operatesSpaces?: boolean
  /** The rail sections (DB-backed left_rail menu, else the legacy/code fallback). */
  sections?: NavSectionGroup[]
  /** The member's own things. The SAME menu the desktop rail renders, but mounted in this
   *  drawer's identity card rather than inside its nav list, so "you, your standing, and what
   *  you run" reads as one cluster on a phone (DAWN 2026-08-11, Q7). Exactly one mount per
   *  viewport either way. */
  myFrequency?: MyFrequency | null
  /** Sections are DB-driven (mode-per-item); forwarded to NavLinkList. */
  menuDriven?: boolean
  /** The game-stats block (MobileGameStats). The drawer's bottom cluster is the < 768 home of
   *  the score; from md it is the bottom-right Vault tab (`dock`). Exactly one per viewport. */
  mobileStats?: React.ReactNode
}) {
  // The Vault's disclosure inside the identity card. Collapsed on every open rather than
  // remembered: the drawer is a NAVIGATION surface, and a member who opened the menu to go
  // somewhere should meet the destination list, not last session's score pushing it down.
  const [vaultOpen, setVaultOpen] = useState(false)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    if (open) window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Reset when the drawer leaves, not when it arrives — collapsing on open would run a
  // `1fr → 0fr` transition in front of the member as the panel slides in.
  //
  // Adjusted DURING RENDER rather than in an effect. This is React's documented shape for
  // "reset state when a prop changes", and it is not a style preference here: this repo's lint
  // (`react-hooks/set-state-in-effect`) rejects the effect spelling by name, and it is right to —
  // an effect would render the stale value once, commit it, then re-render. Setting state during
  // render of the SAME component short-circuits before anything is committed.
  const [drawerWas, setDrawerWas] = useState(open)
  if (drawerWas !== open) {
    setDrawerWas(open)
    if (!open) setVaultOpen(false)
  }

  // 🔴 LOCK THE PAGE BEHIND IT. This was the ONE overlay in the repo that did not — Dialog,
  // SearchOverlay, CaptureLauncher, Mindless, the walkthrough lightbox and ReportDialog all lock. Without
  // it, dragging anywhere on the backdrop scrolls the feed underneath, and because neither the
  // drawer's <nav> nor its stats box declares `overscroll-contain`, a flick that reaches the end
  // of the nav chains straight through to the page. Three nested scrollers, no containment.
  //
  // The previous value is captured and restored rather than cleared to '': clearing is what
  // drops a lock held by an overlay ALREADY open underneath this one.
  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [open])

  return (
    <div
      className={`md:hidden fixed inset-0 z-50 ${open ? 'pointer-events-auto' : 'pointer-events-none'}`}
      aria-hidden={!open}
      // 🔴 `inert`, not just `aria-hidden` + `pointer-events-none`. Closed, the panel is only
      // translated off-screen, so every link in the nav, the four legal links and the Close
      // button stayed IN THE TAB ORDER — inside an `aria-hidden="true"` subtree, which is a
      // direct ARIA violation (focus must never land in an aria-hidden region) and in practice
      // walked a keyboard or switch user through the entire invisible menu before they reached
      // the page. `pointer-events-none` only ever handled the mouse.
      //
      // `|| undefined` because `inert={false}` still serialises the attribute, and a present
      // `inert` is true regardless of its value. Same spelling the Vera sheet already uses.
      inert={!open || undefined}
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        className={`absolute inset-0 bg-ink/40 transition-opacity duration-200 ${
          open ? 'opacity-100' : 'opacity-0'
        }`}
      />

      {/* Panel. The full menu now lives here (the bottom tab bar holds the primary
          destinations); it leads with the viewer's identity + rewards, then the
          full nav, and a thumb-reach close at the bottom. */}
      <aside
        role="dialog"
        aria-label="Navigation"
        // The overlay drawer IS the menu, so it carries the menu's chrome ground like the
        // desktop rail — and `lift-3` instead of the raw `shadow-2xl` literal, which is a
        // Tailwind default rather than a step on the system's own warm elevation scale.
        className={`absolute inset-y-0 left-0 w-64 max-w-[82vw] bg-chrome lift-3 flex flex-col transform transition-transform duration-200 ease-out ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* pt from the top inset, not just h-14: the app runs viewport-fit=cover, so without it
            this wordmark row renders UNDER the notch in the iOS PWA. The drawer's foot already
            pads by the bottom inset below; the head was the half nobody did. Every peer overlay
            (marketing-mobile-menu, search-overlay, loom-picker, capture-launcher) does this. */}
        <div className="shrink-0 flex items-center px-4 border-b border-border h-14 box-content pt-[env(safe-area-inset-top)]">
          <Link href="/feed" onClick={onClose} className="flex items-center">
            <Wordmark className="h-7 w-auto dark:invert" priority />
          </Link>
        </div>

        {/* Identity — tap the card for your profile, tap the chevron for your Vault.
            (owner, 2026-08-06: "on mobile, put the vault in the profile box pop up").
            The score used to sit in the drawer's BOTTOM cluster, below the whole nav list, so
            reaching it was: open the menu, scroll past every destination, and read it inside a
            40dvh box that the desktop panel had just grown ~4x. Here it is one tap from the
            member's own card, which is where the desktop rail's account dock already puts it.
            The chevron is a SEPARATE control from the card's link: making the whole card a
            toggle would cost one-tap profile, which is what the card is for. */}
        <div className="shrink-0 border-b border-border px-3 py-3">
          <div className="flex items-center gap-2.5">
          <Link
            href={profileHref}
            onClick={onClose}
            className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg p-1 -m-1 hover:bg-chrome-hover transition-colors"
          >
            {profile.avatar_url ? (
              <Image
                src={avatarSrc(profile.avatar_url)}
                alt={profile.display_name}
                width={40}
                height={40}
                style={avatarFocusStyle(profile.avatar_url)}
                className="h-10 w-10 rounded-pill object-cover shrink-0"
              />
            ) : (
              <div className="h-10 w-10 rounded-pill bg-primary text-on-primary text-body-sm font-bold flex items-center justify-center select-none shrink-0">
                {getInitials(profile.display_name)}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-body-sm font-semibold text-text truncate leading-tight">
                {profile.display_name}
              </p>
              <RoleBadge role={identityRole} className="mt-0.5" />
            </div>
          </Link>
            {mobileStats && (
              <button
                type="button"
                onClick={() => setVaultOpen((v) => !v)}
                aria-expanded={vaultOpen}
                aria-controls={DRAWER_VAULT_ID}
                aria-label={vaultOpen ? 'Hide your Vault' : 'Show your Vault'}
                className="tap-target -mr-1 flex shrink-0 items-center justify-center rounded-control px-1 text-subtle transition-colors hover:bg-chrome-hover hover:text-text"
              >
                <ChevronUp
                  className={`h-4 w-4 transition-transform duration-[var(--motion-base)] motion-reduce:transition-none ${vaultOpen ? '' : 'rotate-180'}`}
                  aria-hidden
                />
              </button>
            )}
          </div>

          {/* The Vault, revealed from inside the card — the same `grid-rows-[0fr] → [1fr]` row
              the three desktop docks use, so nothing lifts off and the motion honours
              `--motion-base` (globals.css zeroes it under reduced motion rather than disabling
              transitions, which is why a literal duration would opt the member out).
              `overscroll-contain` is here because the drawer nests scrollers: without it a flick
              that reaches the end of this box chains into the nav and then into the page. */}
          {mobileStats && (
            <div
              className={`grid overflow-hidden transition-[grid-template-rows] duration-[var(--motion-base)] ease-[var(--ease-out)] motion-reduce:transition-none ${
                vaultOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
              }`}
            >
              <div className="min-h-0">
                <div
                  id={DRAWER_VAULT_ID}
                  role="region"
                  aria-label="The Vault"
                  className="max-h-[50dvh] overflow-y-auto overscroll-contain pt-3"
                >
                  {mobileStats}
                </div>
              </div>
            </div>
          )}

          {/* Space switcher only (owner: no View-as-role, no streak up here by the identity
              card — the score lives in the disclosure above). Self-gates to null for members
              with a single context, so a regular member sees nothing extra. */}
          <div className="mt-2 space-y-0.5">
            <ContextSwitcher context={operatorContext ?? { kind: 'personal' }} available={availableContexts} />

            {/* WHAT YOU RUN — the second disclosure (DAWN 2026-08-11, Q7).
                The three-docks law's bottom-left region is ONE cluster: you, your standing, and
                the things you run. On desktop the rail's foot is the anchor that makes it one.
                On a phone there is no rail and no foot — the DRAWER is the popover, so the whole
                surface is the dock — and the law's grouping was the half that did not survive
                the translation: identity sat in this card, the score moved into it on 2026-08-06,
                and *what you run* was still distributed through the nav list below. Three parts,
                two clusters.
                So the same menu mounts HERE instead of inside NavLinkList (which is why
                `myFrequency` is not forwarded below). It is a MOVE, not an addition: DAWN's first
                docks rule is "a control appears in exactly one dock", and this menu already
                replaced the account dock's link list once for exactly that reason.
                Keyed on `open` so it resets collapsed when the drawer leaves, like the Vault
                disclosure above and for the same reason — a member who opened the menu to go
                somewhere should meet the destination list, not last session's expansion pushing
                it down. Resetting on LEAVE, never on arrival, so nothing animates shut in front
                of a panel that is sliding in. */}
            {myFrequency && (
              <MyFrequencyMenu
                key={open ? 'drawer-open' : 'drawer-closed'}
                data={myFrequency}
                isActive={isActive}
                onNavigate={onClose}
                label="What you run"
              />
            )}
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
          <NavLinkList isActive={isActive} role={role} onNavigate={onClose} extraSections={extraSections} hideAppNav={hideAppNav} permissions={permissions} navAccess={navAccess} staffRole={staffRole} operatesSpaces={operatesSpaces} sections={sections} menuDriven={menuDriven} />
        </nav>

        {/* Bottom cluster — About/legal, then a thumb-zone Close.
            THE SCORE IS NOT HERE ANY MORE. It moved into the identity card above (owner,
            2026-08-06). Worth stating rather than just deleting: the cap that used to live here
            was on the WRONG BOX. It capped the stats at 40dvh while the nav was `flex-1`, whose
            min-height resolves to 0 — so on a 568px screen the fixed siblings (head, identity,
            40dvh of stats, links, Close) left the entire site nav about 58px, two rows. Moving
            the score into a collapsed-by-default disclosure gives the nav its height back. */}
        <div className="shrink-0 border-t border-border pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {/* About / What is Frequency / Terms / Privacy — the site pages that were desktop
              mega-menu only, so nothing is desktop-reachable-only. */}
          <div className="flex flex-wrap gap-x-3 gap-y-1 px-4 pt-3 text-2xs text-muted">
            <Link href="/about" onClick={onClose} className="hover:text-text transition-colors">About</Link>
            <Link href="/what-is-frequency" onClick={onClose} className="hover:text-text transition-colors">What is Frequency</Link>
            <Link href="/terms" onClick={onClose} className="hover:text-text transition-colors">Terms</Link>
            <Link href="/privacy" onClick={onClose} className="hover:text-text transition-colors">Privacy</Link>
          </div>

          {/* Bottom close. Sits in the thumb zone */}
          <div className="p-3">
            <button
              onClick={onClose}
              aria-label="Close navigation"
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-surface-elevated text-text text-body-sm font-medium py-3 hover:bg-border-strong transition-colors"
            >
              <X className="w-4 h-4" />
              Close
            </button>
          </div>
        </div>
      </aside>
    </div>
  )
}

// The old Mobile right drawer (The Quest stats peek) is retired: stats moved into the LEFT
// drawer (a Zaps · Gems pill + a "View stats" link to /crew) and Messages moved to the
// header, so the bottom bar's Gem/Stats edge button is gone. The full progress cockpit
// still lives at /crew (linked from the left drawer's stats section).

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
        className="flex items-center gap-1.5 h-8 sm:h-9 px-2 sm:px-2.5 rounded-pill text-muted hover:text-primary-strong hover:bg-chrome-hover transition-colors"
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
  operatorContext,
  availableContexts = [],
  children,
  sidebar,
  mobileStats,
  dock,
  ticker,
  banner,
  unreadCount = 0,
  // Reserved for the persistent chat dock's unread badge (Phase 1). The header
  // popover that consumed it has moved into the dock; kept on the shell API so the
  // count keeps flowing without re-threading the prop.
  messagesUnread: _messagesUnread = 0,
  canReceivePayouts = false,
  extraSections,
  hideAppNav = false,
  permissions,
  menuAreaKeys,
  leftMenu,
  navAccess,
  staffRole = null,
  operatesSpaces = false,
  demoMode = false,
  demoHidden = false,
  hasDemoContent = true,
  skin = 'default',
  brandName = null,
  brandLogoUrl = null,
  chromeOverrides,
  webRole = 'none',
  openSupportTickets = 0,
  caps = [],
  appOverrides,
  generation = 'balanced',
  structure = 'standard',
  occasion = 'none',
  headerMenu,
  profileMenu,
  menuViewerRole = 'visitor',
  menuTimings,
  railFold,
  myFrequency = null,
}: {
  profile: Profile
  /** True DB role, ignoring any view-as override. Defaults to the (effective)
   *  profile role, so the janitor control only appears for actual janitors. */
  realRole?: CommunityRole
  /** Janitor previewing the logged-out visitor experience — gates the nav as a
   *  visitor and flips the identity chrome to "Visitor". */
  previewVisitor?: boolean
  /** The server-resolved operator-identity context — which hat the person is wearing (personal /
   *  operator:<space> / admin). FRAMING ONLY (lib/context/operator-context.ts): it frames the chip +
   *  powers the switcher; it is NEVER an authorization input. Defaults to personal. */
  operatorContext?: OperatorContext
  /** The contexts the caller may switch into (server-derived from real ownership/admin + staff axis).
   *  The switcher only ever renders what the server allowed. */
  availableContexts?: AvailableContext[]
  children: React.ReactNode
  sidebar?: React.ReactNode
  /** The game-stats block (MobileGameStats) for the mobile left drawer's bottom cluster —
   *  the < 768 home of the score. From md the same numbers live in the bottom-right Vault tab
   *  (`dock`); nothing is offered twice, and everything is offered once. */
  mobileStats?: React.ReactNode
  /** The bottom-right Vault tab (three-docks law, owner ruling 2026-08-04). Rendered as a
   *  SIBLING of the shell, not inside the rail column: that column is lg:flex and the tab must
   *  exist from md. Gated on showSidebar, the same flag that keeps it off /admin, where the
   *  operator page dock owns these exact coordinates. */
  dock?: React.ReactNode
  /** Community news ticker pinned above the page content (streamed via Suspense). */
  ticker?: React.ReactNode
  /** The operator announcement strip, rendered full-width directly under the header, or undefined
   *  when nothing is set. The SHELL never decides whether an announcement exists: the layout reads
   *  `announcementBannerState()` in the wave it already awaits and passes the bar in already built,
   *  so the height is present in the first flush and nothing shifts (ADR-1030). Signed-in only by
   *  construction, because this shell is. */
  banner?: React.ReactNode
  unreadCount?: number
  /** Live total of unread messages (1:1 DMs + rooms), resolved server-side. Seeds the header
   *  Messages icon's badge so it shows on first paint (mobile + desktop) without opening the
   *  popover. Fail-safe: 0 ⇒ no badge. */
  messagesUnread?: number
  /** Real payouts eligibility (host+ OR a live partner persona) for the account menu's "Receive
   *  payments" item — replaces the host-tier proxy gate. Suppressed under a view-as downgrade. */
  canReceivePayouts?: boolean
  extraSections?: NavSection[]
  hideAppNav?: boolean
  /** Per-area access overrides (janitor-set); merged over code defaults. */
  permissions?: Record<string, NavAccess>
  /** LEGACY GLOBAL menu order (menu_config, /admin/menu): an ordered, visibility-filtered
   *  key list. Used ONLY as a fallback now that `leftRailMenu` (the DB-backed lib/menus
   *  surface) drives the rail; empty / omitted falls back to the full code rail (NAV_AREAS). */
  menuAreaKeys?: string[]
  /** The resolved `left` menu (server-fetched, DB-backed, lib/menus). When it has real DB
   *  items, it DRIVES the rail's order, grouping, icons, and per-item mode (active / ghost /
   *  hidden) for the viewer. Falls back to the menuAreaKeys / code rail when empty / omitted,
   *  so the rail can never vanish pre-migration. Admin lives here as high-role sections. */
  leftMenu?: ResolvedMenu
  /** Server-resolved access matrix per nav key — drives matrix-driven nav visibility
   *  (an item shows if the viewer has any access to its surface). */
  navAccess?: Record<string, AccessLevel>
  /** Viewer's staff role (team_members axis); unlocks Studio. Null under view-as. */
  staffRole?: StaffRole | null
  /** Does the viewer own/run at least one Space? Resolved once per request (lib/spaces/operated
   *  hasOperatedSpaces) and threaded to the rail so the operator "My Spaces" item shows only for
   *  people who actually run a Space. Suppressed to false under a downgrade / visitor preview. */
  operatesSpaces?: boolean
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
  /** Count of OPEN support tickets, resolved janitor-only in (main)/layout.tsx (0 for everyone
   *  else + under a view-as downgrade). Drives the header Bug Alert so a janitor sees a bug report
   *  the moment it lands and can jump straight to /admin/support. */
  openSupportTickets?: number
  /** The viewer's GLOBAL-scope capabilities (getGlobalCapabilities), threaded into PageAdminProvider
   *  for the standardized admin bar (docs/ADMIN-RAIL.md Phase 1). Per-entity caps ride the open event
   *  from the page that resolved them; this seam carries only the route-independent global set. */
  caps?: Capability[]
  /** Per-scope operator App overrides for the current page scope (app_overrides, docs/ADMIN-RAIL.md
   *  Phase 6), loaded once per request in (main)/layout.tsx and threaded into PageAdminProvider so
   *  the settings panel can merge them over the catalog Apps. FAIL-SAFE: omitted ⇒ catalog defaults. */
  appOverrides?: AppOverrides
  /** The active generation/style preset id; sets `data-generation` on the shell root. */
  generation?: string
  /** The structural layout variant the generation maps to (lib/theme/structure.ts); sets
   *  `data-structure` on the shell root so the composition (rhythm/measure) can flex by preset.
   *  'standard' is the proven default (a no-op until denser/roomier blocks are authored). */
  structure?: string
  /** The active occasion id; sets `data-occasion` on the shell root ('none' = omitted). */
  occasion?: string
  /** The resolved `header` menu (server-fetched, DB-backed). Drives the in-app header
   *  mega-menu. Falls back to the code default when omitted. */
  headerMenu?: ResolvedMenu
  /** The resolved `profile` menu (server-fetched, DB-backed). Drives the account dropdown's
   *  editable link list. Falls back to the code default when omitted. */
  profileMenu?: ResolvedMenu
  /** The resolved `admin_header` menu (server-fetched, DB-backed). Retained for backward-compat
   *  with existing callers; the admin sub-nav now renders from the admin layout's own AdminSubNav
   *  (NAV-SYSTEM-REDESIGN §6), so the shell no longer consumes this prop. */
  adminHeaderMenu?: ResolvedMenu
  /** The viewer collapsed to a single MenuAccess token; drives per-item mode (active /
   *  ghost / hidden) in the header + admin megas. */
  menuViewerRole?: MenuAccess
  /** Mega-menu interaction timings from the global Menu Manager settings. */
  menuTimings?: MenuSettings
  /** The viewer's STANDING RAIL INSTRUCTIONS (lib/layout/rail-fold), read SERVER-SIDE from the
   *  `freq-rail-fold` cookie the shell writes.
   *
   *  🔴 THIS IS THE NO-FLASH SEAM, and it is the only one that can exist. A rail fold is MARKUP
   *  (an icon strip is a different tree, not a restyled one), so unlike the theme it cannot be
   *  corrected by a pre-paint inline script: by the time any script runs, the server has already
   *  put the open rail in the HTML. The server has to know. Wiring it is one line in the authed
   *  layout — `readRailFoldCookie((await cookies()).get(RAIL_FOLD_COOKIE)?.value)` — and that file
   *  is outside this pass's domain, so the prop ships unwired and OPTIONAL. Omitted, both sides
   *  start on Auto (today's exact first paint) and the stored instruction is applied at hydration. */
  railFold?: Partial<RailFolds>
  /** The member's own things for the rail's My Frequency disclosure (lib/nav/my-frequency),
   *  resolved server-side once per request. Omitted ⇒ the row simply does not render, so a
   *  failed read costs the rail one row and never the whole menu. */
  myFrequency?: MyFrequency | null
}) {
  const pathname = usePathname()
  const profileHref = `/people/${profile.handle}`
  // The rail's link list. PREFERRED source: the DB-backed `left_rail` menu (lib/menus),
  // resolved per-viewer here (active / ghost; hidden dropped) via menuToSections — its
  // order, grouping, icons, and modes drive the rail. SAFE FALLBACK: when that menu is
  // empty (unseeded / all-hidden), fall back to the legacy menu_config key order, then to
  // the full code rail (NAV_AREAS) — so the rail can never vanish. `menuDriven` tells
  // NavLinkList which gating path to use (mode-by-item for DB, itemAccess for the fallback).
  // Profile is injected into the home anchor (beside Feed) since its href is viewer-specific.
  // DB-driven ONLY when the menu came from real DB rows (a seeded left_rail surface), NOT
  // the code fallback (isDefault). Pre-migration / unseeded, getMenu returns the NAV_AREAS
  // default, where we keep the PROVEN legacy gating (menuAreaKeys + itemAccess / telescope /
  // area_permissions) rather than the simpler minAccess/mode path, so the rail's access
  // control stays unchanged until an operator seeds it from /admin/menu.
  const dbRailSections =
    leftMenu && !leftMenu.isDefault
      ? menuToSections(leftMenu, { viewerRole: menuViewerRole, staffRole, operatesSpaces })
      : []
  const menuDriven = dbRailSections.length > 0
  const navSections = menuDriven
    ? dbRailSections
    : sectionsFromKeys(menuAreaKeys)
  const role = (profile.community_role ?? 'member') as CommunityRole
  const effectiveRealRole = realRole ?? role
  // Nav gating role: a visitor preview gates as a logged-out visitor (null).
  const gateRole: CommunityRole | null = previewVisitor ? null : role
  const { theme, setTheme } = useTheme()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [lastPath, setLastPath] = useState(pathname)

  // ── The rails' three-position ladder (DAWN § "Rails", lib/layout/rail-fold) ───────────────
  //
  // Auto follows the room; Open and Strip are STANDING instructions. What this replaces was a
  // `{ path, collapsed }` override that only the RIGHT rail had and that was keyed on the
  // pathname — so it reset itself on every navigation, which is the opposite of standing.
  //
  // The instruction is SUBSCRIBED TO, not copied into state: localStorage is an external system,
  // and `useSyncExternalStore` is the API that has a server snapshot as a first-class concept —
  // which is precisely this problem's shape. The server renders `railFold` (the cookie) or Auto;
  // the client then renders what is actually stored, and a fold made in another tab arrives here
  // too. Copying it into `useState` inside an effect would be a cascading render on every mount
  // (and `react-hooks/set-state-in-effect` fails the build on it, correctly).
  const seededFolds = useMemo<RailFolds>(
    () => ({ ...DEFAULT_RAIL_FOLDS, ...railFold }),
    [railFold],
  )
  const serverFolds = useCallback(() => seededFolds, [seededFolds])
  const folds = useSyncExternalStore(subscribeRailFolds, railFoldsSnapshot, serverFolds)

  // One press of a rail's foot glyph. Writes through to localStorage + the cookie mirror, so the
  // instruction survives a reload and (once the layout passes `railFold`) the very first paint.
  const cycleFold = (side: RailSide, autoStrip: boolean) =>
    setRailFolds({ ...folds, [side]: nextRailFold(folds[side], autoStrip) })

  // The shell-level admin bar (ADR-128, rebuilt; owner revision 2026-06-21; unified in ADMIN-RAIL
  // Phase 2). The AdminBar owns open/persistence + the grab-handle resize + the `open-admin-bar`
  // event (the old `open-settings` event retired with the SettingsDrawer), and reports its live
  // { open, width, resizing } up here. The shell sizes
  // the RAIL COLUMN to that width, so the bar slides over the rail at rest (covering it, nothing reflows) and,
  // as the grab handle widens it, the rail column grows and the CENTER CONTENT COMPRESSES to
  // match. It never spills past the content's right column (it is its own pushing column).
  const [settings, setSettings] = useState<AdminBarState>({ open: false, width: 288, resizing: false })

  // Expose the reserved admin-rail width as a CSS variable on the document root, so a viewport-fixed
  // overlay (the Space page's floating Publish button) can sit in the CONTENT area, clear of the rail,
  // and follow it as the operator resizes / opens / closes the panel. 0 when the rail is closed.
  useEffect(() => {
    const w = settings.open ? settings.width : 0
    document.documentElement.style.setProperty('--admin-rail-w', `${w}px`)
  }, [settings.open, settings.width])

  // Close the mobile nav drawer when the route changes (covers back/forward). The old
  // right-edge stats drawer is retired (stats moved into the left drawer).
  if (lastPath !== pathname) {
    setLastPath(pathname)
    if (drawerOpen) setDrawerOpen(false)
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
    // Community (/network) is the Network-hub root; its sibling /network/contacts
    // (My Contacts) is its own rail item, so match /network EXACTLY — otherwise the
    // generic prefix rule below would also light up Community on the Contacts page.
    if (href === '/network')  return pathname === '/network'
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

  // Full-viewport EDITOR takeover: a builder that owns the whole viewport with its OWN top bar (desktop)
  // + thumb-zone control dock (mobile), so the shell hides its desktop header AND its mobile bottom tab
  // bar + side drawers. NOTE (ADR-522 follow-up): the member Spotlight Puck editor that used to match here
  // is retired, so isFullViewportEditor currently matches nothing — this stays as the one declared
  // extension point (page-chrome.ts) for any future viewport takeover, so the shell never path-sniffs.
  const editorTakeover = isFullViewportEditor(pathname)

  // Full-WIDTH editor (the Space landing editor): the builder fills the whole content width — both
  // rails + the page gutters are dropped like a takeover — but the site header STAYS (owner directive,
  // 2026-07). So it shares the takeover's LAYOUT effects (no rails, edge-to-edge, no breadcrumbs) while
  // the header guard below keys on `editorTakeover` ALONE, so the header is never hidden here.
  const fullWidthEditor = isFullWidthEditor(pathname)
  const edgeToEdge = editorTakeover || fullWidthEditor

  // What AUTO means on this route: the immersive build surfaces (the Journey course builder)
  // arrive folded — "folding gives the space to the canvas, which is why the editors arrive
  // folded" — and everything else arrives open, because both rails are primarily open. One
  // declarative source (page-chrome's railStartsCollapsed), now read by BOTH rails: DAWN's
  // editor screens show the rails folded, plural.
  const autoStrip = railStartsCollapsed(pathname)

  // The right rail. `railCollapsed` keeps its name (and its 56 / 288 widths) — only what
  // decides it changed: a standing instruction instead of a per-path scratch value.
  const railCollapsed = showSidebar && resolveRailFold(folds.right, autoStrip) === 'strip'
  const toggleRail = () => cycleFold('right', autoStrip)

  // The global MEMBER left rail is swapped out on workspace routes (today: /admin/*),
  // which mount their OWN left nav in their layout (the admin sidebar). Suppressing
  // the member rail here is what prevents a double left rail. Governed declaratively
  // by page-chrome.ts (leftRailFor) — the shell never path-sniffs.
  // A full-viewport editor takeover also drops the LEFT nav (the editor owns the whole viewport with
  // its own top bar), so the desktop <Puck> reads truly full-screen like the mobile dock does.
  const showLeftRail = leftRailFor(pathname) === 'global' && !editorTakeover && !fullWidthEditor

  // The LEFT rail's fold. Production could not fold the menu on desktop at all: NavLinkList has
  // carried a working `compact` (icon-strip) path for a long time and nothing ever passed it —
  // a dead path with a live implementation. It is wired here rather than reimplemented.
  //
  // The narrow-window yield is NOT decided here. The rail is `hidden md:flex`, so below that the
  // menu leaves the layout entirely and arrives as the overlay drawer — the responsive rule wins
  // over any stored position, without this component having to measure a viewport the server
  // cannot see (measuring it is how you ship the flash).
  const leftStrip = showLeftRail && resolveRailFold(folds.left, autoStrip) === 'strip'
  const toggleLeftRail = () => cycleFold('left', autoStrip)

  // The member sitemap footer (canvas, end of the center column, scrolls with the
  // page). Shown only on real MEMBER content pages: skip stripped shells
  // (hideAppNav), the admin workspace (leftRailFor → 'none'), and Focus/takeover
  // surfaces (railFor → 'none': on-air/scan/settings/compose). Stream/Index/
  // Dashboard and scoped-detail pages all keep it. One declarative rule, read from
  // the same page-chrome map the rails use — pages never toggle it.
  const showFooter = !hideAppNav && showLeftRail && effectiveRail !== 'none'

  // Admin contextual sub-nav (NAV-SYSTEM-REDESIGN §6): the flat text-link row of the active Studio
  // world's sub-pages now lives at the top of the admin layout's own sticky band (AdminSubNav in
  // app/(main)/admin/layout.tsx), not here — the shell no longer renders an admin sub-header, and
  // the `admin_header` MegaBar's second dropdown layer is retired. We still track whether the route
  // is under /admin so the shell suppresses its own AdminBar column there (the admin layout
  // mounts the bar over its info-rail column instead).
  const isAdminRoute = pathname === '/admin' || pathname.startsWith('/admin/')

  // Light → Dark → System → Light. Gated on having an account (owner, 2026-09-11): the shell only
  // renders for a signed-in member, so this is belt-and-braces rather than the load-bearing gate —
  // resolveDarkMode refuses dark without the account marker whatever is stored. It is here so the
  // control cannot show a member a mode the renderer will then decline to give them.
  function cycleTheme() {
    if (!canChooseMode(hasAccount())) return
    if (theme === 'light') setTheme('dark')
    else if (theme === 'dark') setTheme('system')
    else setTheme('light')
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
      data-structure={structure}
      data-occasion={occasion === 'none' ? undefined : occasion}
      className="flex min-h-dvh flex-col overflow-x-clip bg-canvas"
    >
      {/* Skip link — first focusable element in the authed shell, visually hidden until a keyboard
          user tabs to it, so they can jump past the header + rails to <main id="main"> (WCAG 2.4.1
          Bypass Blocks). Placed before the top bar so it wins tab order even on an editor takeover. */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-[60] focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2 focus:text-body-sm focus:font-semibold focus:text-text focus:shadow-pop"
      >
        Skip to content
      </a>

      {/* ── Top bar ───────────────────────────────────────── */}
      {/* In iOS standalone PWA the webview extends under the status bar (viewport-fit=cover +
          black-translucent). Pad the bar by env(safe-area-inset-top) and grow its height to
          match, so its bg-surface/90 fills behind the status bar and the buttons clear the notch. */}
      {/* Hidden on a full-viewport editor takeover: the editor mounts its OWN top bar and owns the
          whole viewport (the Space landing + Spotlight builders), so the site header is dropped. */}
      {!editorTakeover && (
      <header
        // The chrome band (DAWN 2026-08-03, owner-adopted): the top bar is painted with the
        // tinted frame tokens so the frame reads as frame against the lightened canvas,
        // instead of a translucent white strip. Skins retune both tokens.
        className="sticky top-0 shrink-0 flex items-stretch bg-chrome backdrop-blur-sm border-b border-chrome-border z-30"
        style={{ height: 'var(--app-header-h)', paddingTop: 'env(safe-area-inset-top)' }}
      >

        {/* Engraved, interactive wordmark. Leads the bar — on mobile the menu now
            lives in the bottom tab bar, so the wordmark anchors the top-left. */}
        <BrandMark name={brandName} logoUrl={brandLogoUrl} />

        {/* The header mega-menu beside the logo — the SAME `header` surface the splash /
            site use, so the whole product shares one editable site nav. Vertically centered
            on the header line and at the rail link's color, so it reads as a peer of the
            other header items. Its panel aligns to the page CONTENT COLUMN, reserving the
            right rail width only when that rail is shown. Desktop only. */}
        {!hideAppNav && (
          <div className="ml-1 hidden items-center md:flex">
            <PrimaryNav
              variant="light"
              panelAlign="content"
              rightRail={showSidebar}
              leftFolded={leftStrip}
              rightFolded={railCollapsed}
              headerMenu={headerMenu}
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

        {/* Right cluster: search · [mindless · friends · notifications] · account.
            Three groups, each set off by a hairline so the icons read as one
            tidy block of community actions and the account stays distinct. The
            top right is the SYSTEM dock (three-docks law, DAWN 2026-08-03):
            the settings that outlive a page. Score (the streak) lives in the
            Vault dock, bottom right; you-and-what-you-run lives at the rail's
            foot — nothing is offered twice.
            pr keeps the avatar off the screen edge below lg (the lg block is
            flush-right by design for the rail alignment). */}
        {/* 🔴 `shrink-0`, NOT `min-w-0`, and the swap is the fix rather than a preference.
            `min-w-0` said "this cluster may be squeezed below its contents" — and because the
            cluster is `justify-end`, being squeezed pushes its icons out through its LEFT edge,
            over the wordmark beside it. The mark could not shrink to make room (its width comes
            from `aspect-ratio`, an intrinsic floor), so the deficit had nowhere else to go: at
            390px the search glyph sat on top of the mark's last letters, and at 360px the whole
            icon row did. Now the cluster keeps its contents' width at every viewport and the
            BRAND absorbs the deficit (components/layout/brand-mark.tsx), which is the only child
            that can give ground without anything becoming unreachable.
            `flex-1` stays: it is what grows the cluster to meet `lg:min-w-72` and keep the
            account block aligned to the right rail. */}
        <div className="flex flex-1 shrink-0 items-center justify-end gap-1 pl-1 pr-2 sm:pl-2.5 md:gap-2 md:pl-4 lg:pr-0">

          {/* Demo-content toggle — sits to the LEFT of Search (desktop). Members
              hide/show seeded demo content for themselves; sized to match Search. */}
          {demoMode && hasDemoContent && <DemoToggle initialHidden={demoHidden} />}

          {/* "Report a bug" lives at the TOP of the right rail now (see right-sidebar.tsx),
              not in the header. The account menu keeps its own "Report a bug" entry below. */}

          {/* Search pill — opens the live overlay. Desktop */}
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            title="Search (⌘K)"
            className="hidden sm:flex items-center gap-2 rounded-pill border border-border bg-surface-elevated/70 pl-3 pr-2 py-1.5 text-body-sm text-muted hover:text-text hover:border-border-strong hover:bg-chrome-hover transition-colors"
          >
            <Search className="w-4 h-4" />
            <span>Search</span>
            <kbd className="text-3xs leading-none rounded px-1.5 py-1 border border-border bg-surface text-muted">
              ⌘K
            </kbd>
          </button>

          {/* Search icon — opens the live overlay. Mobile
              🔴 `shrink-0` is a TOUCH TARGET fix, not a layout preference (WCAG 2.5.5, 24px).
              This was the ONLY flex item in the header's right cluster without a size floor, so
              at 390px it absorbed the whole row's deficit on its own and collapsed to its icon's
              min-content width: axe measured it at 21.3 × 34 and failed it on /feed, /settings
              and the Space console. 21.25px is exactly `w-5` (the icon) at the app's 106.25%
              root, and 34px is exactly the `h-8` it kept — the button was being squeezed flat in
              one axis while its declared size stayed honest in the other. The fix is to render
              the size the design already chose (34px, the same as the Friends link beside it),
              not to hardcode a new floor past the `--tap-min` axis. */}
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            aria-label="Search"
            title="Search"
            className="sm:hidden flex shrink-0 items-center justify-center w-8 h-8 rounded-pill text-muted hover:text-text hover:bg-chrome-hover transition-colors"
          >
            <Search className="w-5 h-5" />
          </button>

          {/* Right action block. On lg+ it's exactly the right rail's width (w-72) and
              sits flush to the viewport's right edge, so its LEADING divider (the "|"
              between Search and these actions) lines up with the right column's left
              border. Below lg (no right rail) it's a natural-width right-aligned cluster. */}
          <div className="flex items-center justify-end gap-1 sm:ml-1 sm:border-l sm:border-border sm:pl-1.5 md:gap-2 lg:ml-0 lg:min-w-72 lg:justify-start lg:pl-3 lg:pr-4">
            {/* Community actions: mindless · friends · messages · notifications · daily streak. */}
            {/* Mindless — the global practice timer overlay, openable from anywhere.
                🔴 DESKTOP ONLY (owner, 2026-08-16: "We don't need the mindless icon in the menu on
                mobile"). It is not a taste call about clutter, it is the header's WIDTH BUDGET. The
                mobile bar has one flexible child — the wordmark — so every pinned control in this
                cluster is subtracted from the brand before anything else gives way, and the lotus
                plus its gap is ~42px of a ~360px line. Removing it is what buys the mark back its
                full 163px at 390 and 360 (components/layout/brand-mark.tsx).
                Nothing becomes unreachable: the timer is the whole point of The Quest tab in the
                bottom bar, and every practice card opens it directly. This is the one header
                control on a phone whose destination is already a primary tab. */}
            <span className="hidden md:inline-flex">
              <MindlessLaunch />
            </span>
            {/* Friends — all sizes (mobile reaches Messages via the button on /network/friends). */}
            <HoverTip label="Friends">
              <Link
                href="/network/friends"
                aria-label="Friends"
                className="flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-pill text-muted hover:text-text hover:bg-chrome-hover transition-colors"
              >
                <Users className="w-5 h-5" />
              </Link>
            </HoverTip>
            {/* Bug Alert — janitor-only, and only while support tickets are open. A large, hard-to-miss
                red pill (icon + "Bug" + count) that jumps straight to the support queue, so a bug report
                never sits unseen. The count is resolved janitor-only server-side (0 otherwise), and we
                re-gate on the web_role here for defense-in-depth. */}
            {isJanitor(webRole) && openSupportTickets > 0 && (
              <HoverTip label={`${openSupportTickets} open support ${openSupportTickets === 1 ? 'ticket' : 'tickets'}`} className="inline-flex">
                <Link
                  href="/admin/support"
                  aria-label={`Bug Alert: ${openSupportTickets} open support ${openSupportTickets === 1 ? 'ticket' : 'tickets'}. Open the support queue`}
                  className="inline-flex items-center gap-1.5 rounded-pill bg-danger px-3 py-1.5 text-body-sm font-bold text-on-danger shadow-sm ring-1 ring-danger/40 transition-transform hover:scale-105 motion-safe:animate-pulse"
                >
                  <Bug className="h-4 w-4" />
                  <span className="hidden sm:inline">Bug</span>
                  <span className="inline-flex min-w-5 items-center justify-center rounded-pill bg-on-primary/20 px-1.5 text-meta leading-5">
                    {openSupportTickets}
                  </span>
                </Link>
              </HoverTip>
            )}
            {/* Messages moved out of the header into the persistent chat dock (the
                right-edge launcher). The dock now owns DMs, rooms, and the unread badge. */}
            {/* Notifications — shown on all sizes, tooltip on hover. */}
            <HoverTip label="Notifications">
              <NotificationBell initialUnread={unreadCount} />
            </HoverTip>
            {/* The streak chip is NOT here (three-docks law, DAWN 2026-08-03): it lives in
                the Vault dock, bottom right (components/sidebar/game-stats-dock.tsx). The
                top bar is the system, and the system does not keep score. */}

            {/* Account — its own divider, pushed to the far right of the block on lg+.
                The divider and its two paddings are ~19px, and below sm they were buying a hairline
                at the wordmark's expense. The account avatar is already visually distinct (a filled
                initials disc among outline glyphs), so the rule has nothing left to explain on a
                phone; from sm up, where the room exists, it is unchanged. */}
            <div className="flex items-center gap-1.5 ml-1 sm:ml-2 sm:border-l sm:border-border sm:pl-2.5 md:gap-2 lg:ml-auto">
              <AccountDropdown
                profile={profile}
                profileHref={profileHref}
                themeLabel={themeLabel}
                ThemeIcon={ThemeIcon}
                cycleTheme={cycleTheme}
                menu={profileMenu}
                viewerRole={menuViewerRole}
                staffRole={staffRole}
                canReceivePayouts={canReceivePayouts}
              />
            </div>
          </div>
        </div>
      </header>
      )}

      {/* The operator announcement strip, directly below the header (hidden on a chromeless editor
          takeover). A SLOT, not a component: the layout does the read (ADR-1030 -- reading it here
          behind Suspense reserved no height and shifted the whole page when it landed) and passes
          the rendered bar in, or nothing at all when no announcement is set. */}
      {!editorTakeover && banner}

      {/* ── Admin contextual sub-nav (NAV-SYSTEM-REDESIGN §6) ── */}
      {/* The old admin MegaBar sub-header (a second dropdown layer) is GONE. On /admin* the active
          Studio world's sub-pages now render as a FLAT horizontal text-link row (AdminSubNav) at the
          TOP of the admin layout's own sticky band, directly above the search bar (one opaque
          container, §6a) — see app/(main)/admin/layout.tsx. The shell renders no admin sub-header. */}

      {/* ── Body ──────────────────────────────────────────── */}
      {/* The scroll-end dock reveal is retired: the stats dock is now the floating
          Vault dock (bottom right, click-to-open) and the left profile card opens
          only on its chevron — nothing rises on scroll. */}
      {/* Both rails now live IN normal flow inside the one shared page scroll, so the
          LEFT nav scrolls up with the content exactly like the right rail (its profile
          card sits at the bottom of the column and rides up with the page). */}
      {/* px-safe pads the body by env(safe-area-inset-left/right) so the rails + page
          gutters clear a side-notch in landscape (0 in portrait / off-device). */}
      <div className="flex min-w-0 flex-1 px-safe">
        <div
          data-feed-scroll
          className={`min-w-0 flex-1 ${editorTakeover ? '' : 'pb-[var(--tab-bar-clearance)] md:pb-0'}`}
        >
          {/* The page-admin context wraps the whole content row (not just <main>) so the
              settings drawer — mounted in the right-rail slot — can read the viewer's
              role / staffRole / webRole gates alongside the page body. */}
          <PageAdminProvider value={{ role: gateRole, staffRole, webRole, caps: new Set(caps), appOverrides }}>
          {/* The shared entity-layout store (ADR-516 Phase C member / Phase D space) wraps BOTH the page body
              and the admin rail so the in-rail builder and the owner's LiveProfileGrid preview share one
              client store — edits repaint the page instantly, no round-trip. EntityLayoutMount picks the
              store for the route (space on a Space profile root, member elsewhere). Inert until the owner
              seeds it. */}
          <EntityLayoutMount>
          {/* A full-viewport editor takeover drops the max-width, gutters, and min-height so the
              editor (which owns its own top bar + full-height layout) sits truly edge-to-edge. */}
          <div className={edgeToEdge
            ? 'flex w-full items-stretch'
            : 'mx-auto flex w-full max-w-[105rem] items-stretch gap-8 lg:gap-10 px-4 sm:px-6 lg:px-8 min-h-[calc(100vh-3.5rem)]'}>

            {/* Left nav — NEVER scrolls out of view. Pinned under the header
                (sticky top-14) with its window ending exactly where the fixed
                bottom-left profile box begins (the 8rem in the max-h), so the
                menu's bottom always sits against that box while the content
                column scrolls past. A menu taller than the window scrolls
                INTERNALLY instead of riding the page. */}
            {showLeftRail && (
              // ── NO FILL. The rail is the SAME GROUND as the page ────────────────────────────
              //
              // OWNER, 2026-08-05, off a live screenshot of /feed: the rail read as a distinct
              // cream band beside the content, and he does not want that. So `bg-chrome` comes
              // off — the rail now takes whatever the page is standing on, in every theme, which
              // is the one way to be sure no skin is left with a visible band (the fill was the
              // only thing making one; nothing in globals.css paints a rail).
              //
              // WHAT DEFINES THE EDGE NOW: the hairline, and only the hairline. `border-r
              // border-chrome-border` STAYS — with the tone gone there is nothing else to say
              // where the frame ends and the page begins, and an ambiguous boundary was the
              // reported bug the fill was introduced to fix in the first place. One hairline is
              // the minimum that keeps the rail a track; the fill was the part that made it a
              // band. BOTH RAILS take the same treatment (the right rail's asides below) so the
              // two sides of the grid can never read differently.
              //
              // FOLDED, the rail is a visible STRIP, never a missing track: same column, same
              // hairline edge, `w-14` instead of `w-48` — the same class step the RIGHT rail's
              // folded strip has always used, so both sides of the grid fold to one measure.
              // Written as two whole class strings rather than an interpolated width, because
              // Tailwind generates utilities by scanning source text for complete class names;
              // and the OPEN spelling stays literally `hidden md:flex w-48 shrink-0`, which is
              // the geometry lib/layout/shell-metrics.ts publishes to the out-of-shell claim page
              // and reads back out of this file as its drift guard.
              //
              // (`relative` came off both spellings with the mid-edge handle: it existed only to
              // be that handle's containing block. The fold TICK is positioned against the account
              // dock at the foot instead, which is already `sticky` and therefore already a
              // containing block of its own — see components/layout/rail-fold-control.tsx.)
              <aside
                className={
                  // NO RULE (owner, 2026-08-06). The hairline that used to define this edge is
                  // gone: the rail and the content share the page's ground, and the nav's own
                  // inset is what separates them. Removed on BOTH branches together — a strip
                  // with a rule and an open rail without one is the same edge disagreeing with
                  // itself depending on a fold.
                  leftStrip
                    ? 'hidden md:flex w-14 shrink-0 flex-col'
                    : 'hidden md:flex w-48 shrink-0 flex-col'
                }
              >
                {/* The menu + profile footer live in NORMAL FLOW and scroll WITH the page
                    (no sticky pin, no inner scrollbar): the menu rides up as you scroll and
                    the profile card sits at the bottom of the column, revealed as you reach
                    the end of the page — like the right rail's dock. */}
                {/* No outer px here: items carry their own px-3, so their hover boxes sit flush
                    to the column edge — matching the right rail's cards, so the outer margin reads
                    the same on both sides. Folded, the rows are centred 44px squares, so the
                    column takes a small symmetric inset instead. */}
                <nav className={leftStrip ? 'flex-1 px-1.5 py-3' : 'flex-1 py-3 space-y-1'}>
                  <NavLinkList isActive={isActive} role={gateRole} extraSections={extraSections} hideAppNav={hideAppNav} permissions={permissions} navAccess={navAccess} staffRole={staffRole} operatesSpaces={operatesSpaces} sections={navSections} menuDriven={menuDriven} myFrequency={myFrequency} compact={leftStrip} />
                </nav>
                {/* Bottom-left profile card — the account dock at the rail's FOOT (three-docks
                    law): the admin canvas corner-tab skin (rounded top, hairline, canvas-tinted
                    blur), sticky to the column bottom. Mirrors components/admin/
                    admin-profile-card.tsx's wrapper. */}
                {/* A TAB AGAIN, and the SAME tab as the right side (owner, 2026-08-05: "the
                    profile box takes the same radius and styles as the right rail tab").
                    Character for character the DockBar crest — `border-x border-t
                    border-chrome-border bg-chrome/95 backdrop-blur-sm` on the role radii — with
                    the corners MIRRORED: DockBar rounds `tl-card` where it meets open canvas and
                    `tr-control` where it dies against the viewport edge, so the left tab rounds
                    `tl-control` at the edge and `tr-card` into the canvas.
                    It reads as a tab again for a reason that only just became true: it stopped
                    being one when the rail took `bg-chrome`, because a chrome tint on chrome
                    ground is a 1.000:1 "tab" that nothing but its hairline described. The rail
                    has no fill now, so the same tint lifts it off the page exactly the way the
                    right one does. */}
                <div className="sticky bottom-0 z-10 rounded-tl-control rounded-tr-card border-x border-t border-chrome-border bg-chrome/95 px-2 pt-1 backdrop-blur-sm">
                  {/* The LEFT rail's fold TICK, on this tab's top-RIGHT corner — the corner
                      nearest the seam it moves (the rail's right hairline). A child of the tab,
                      not a sibling parked near it: `sticky` is already a containing block, so the
                      tick rides the tab up when the quick-actions panel rises and can never be
                      painted underneath it. That is the structural answer to the failure the FOOT
                      control shipped with, which was a `sticky` control against a `fixed` bar. */}
                  <RailFoldTick
                    side="left"
                    showing={leftStrip ? 'strip' : 'open'}
                    onPress={toggleLeftRail}
                  />
                  {leftStrip ? (
                    // Folded, the account dock keeps its PLACE (the rail's foot is you and what
                    // you run) but not its panel: one avatar that still reaches the profile. The
                    // full dock's links all live in the top-right account menu too, so nothing
                    // becomes unreachable by folding — and the name is on the link, not a tooltip.
                    <Link
                      href={profileHref}
                      aria-label={`Your profile, ${profile.display_name}`}
                      title={profile.display_name}
                      // Same head height as every other dock head, folded or not: a tab that
                      // changed height when you folded the menu would make the two bottom
                      // corners disagree on which line the page ends at.
                      // `relative` is not decoration. The fold tick is absolutely positioned over
                      // this tab's top-right corner, and a POSITIONED sibling later in the tree
                      // paints — and therefore hit-tests — above it. Without this, the tick's
                      // tap-target floor would overlap the avatar and win, so a member aiming at
                      // their own profile would fold the menu instead.
                      className={`relative mx-auto flex ${DOCK_HEAD_H_CLASS} w-9 items-center justify-center`}
                      data-tour-anchor="avatar"
                    >
                      {profile.avatar_url ? (
                        <Image
                          src={avatarSrc(profile.avatar_url)}
                          alt=""
                          width={36}
                          height={36}
                          style={avatarFocusStyle(profile.avatar_url)}
                          className="h-9 w-9 rounded-pill object-cover"
                        />
                      ) : (
                        <span className="flex h-9 w-9 items-center justify-center rounded-pill bg-primary text-2xs font-bold text-on-primary select-none">
                          {getInitials(profile.display_name)}
                        </span>
                      )}
                    </Link>
                  ) : (
                    <>
                      {!hideAppNav && role === 'member' && <UpgradeCrew />}
                      <ProfileCard profile={profile} role={role} realRole={effectiveRealRole} profileHref={profileHref} previewVisitor={previewVisitor} operatorContext={operatorContext} availableContexts={availableContexts} />
                    </>
                  )}
                  {/* The fold control used to sit HERE as a row IN this tab, at the foot, under
                      everything it affects — and it painted under the dock bar. It is a tick on
                      this tab's own top corner now (RailFoldTick, the first child of this box),
                      which is the same corner without being the same mistake: a child of the tab
                      cannot be underneath it. One control per rail, never two. */}
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
              {/* A full-viewport editor takeover drops the page padding + breadcrumbs so the editor
                  (its own top bar / thumb-zone dock) fills the column edge to edge. */}
              <main id="main" tabIndex={-1} className={`flex-1 min-w-0 ${edgeToEdge ? '' : 'py-6'}`} data-tour-anchor="content">
                {/* Some routes render their OWN breadcrumb, with the entity's REAL name, and the
                    generic pathname-derived one stands down for them — otherwise the page carries a
                    doubled trail whose lower-fidelity half titleizes the slug and so announces a
                    renamed entity under its old name (LIVE-132). Which routes those are lives in
                    lib/layout/page-chrome.ts, not in a regex here: chrome decisions belong in the
                    registry the shell reads. */}
                {!edgeToEdge && !ownsBreadcrumb(pathname) && <Breadcrumbs />}
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
                // lg:ml-3 widens the content↔right-rail gap by 0.75rem so it matches the LEFT gap:
                // the nav items inset their text by px-3, so content sits ~3.25rem from the nav text
                // but only ~2.5rem from the flush right-rail cards. This nudge evens the two sides
                // without touching the shared gap token (lg:gap-10, ADR-404) or the card width.
                className={`relative hidden shrink-0 justify-end lg:ml-3 lg:flex ${
                  settings.resizing ? '' : 'transition-[width] duration-200 ease-out motion-reduce:transition-none'
                }`}
                style={{ width: settings.open ? settings.width : railCollapsed ? 56 : 288 }}
              >
                {railCollapsed ? (
                  // Mini rail — the global community rail collapsed to a thin strip. It shows ICONS
                  // for the rail's items (the Quest stats); clicking any reopens the rail. The
                  // collapse/expand TOGGLE sits at the BOTTOM. The rail is never removed.
                  // No fill, same as the left rail (owner, 2026-08-05): the strip is the page's
                  // own ground with a hairline for its edge.
                  //
                  // NO FOLD CONTROL IN HERE, and that is deliberate rather than an omission. The
                  // right rail's tick rides its TAB, and the tab that survives a fold is the chat
                  // tab in the bottom corner (components/layout/dock-bar.tsx) — so putting a
                  // second one on the strip would be two controls for one fold. The three icons
                  // below already reopen the rail on click, as they always have.
                  //
                  // NO RULE (owner, 2026-08-06: "there are no vertical rail lines involved").
                  // Removed on both right-rail branches together for the same reason the left
                  // pair was: an edge that exists in the strip and not in the open rail is the
                  // same edge disagreeing with itself depending on a fold.
                  <aside className="flex w-14 shrink-0 flex-col items-center py-6">
                    <div className="flex flex-col items-center gap-1.5">
                      {([['Quest', Zap], ['Gems', Gem], ['Streak', Flame]] as const).map(([label, Icon]) => (
                        <button
                          key={label}
                          type="button"
                          onClick={toggleRail}
                          title={`${label}, open the rail`}
                          aria-label={`${label}, open the rail`}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-control text-muted transition-colors hover:bg-chrome-hover hover:text-text"
                        >
                          <Icon className="h-5 w-5" aria-hidden />
                        </button>
                      ))}
                    </div>
                  </aside>
                ) : (
                  // Mirrors the left rail exactly: NO fill (owner, 2026-08-05 — the rails must
                  // read as the same surface as the page) and, since 2026-08-06, NO HAIRLINE
                  // either (owner: "there are no vertical rail lines involved"). Both rails, both
                  // branches, one rule — the content column's own gutter is what separates them
                  // now. (`relative` came off with the mid-edge handle it existed for; the fold
                  // tick lives on the dock tab at the foot of this column instead.)
                  // `data-rail-column` is a CAMERA HOOK, not styling and not behaviour: it is the
                  // one stable box around the rail's panels. This <aside> stretches to the flex
                  // row's height (set by the content column beside it), so its bounding box does
                  // not move when a panel inside it resizes — which is exactly what the visual
                  // suite needs and what masking each panel could never give. See the note on the
                  // member-shell surfaces in test/e2e/surfaces.ts for the measurement. Removing
                  // this attribute makes those three surfaces go red, not silently green.
                  <aside data-rail-column className="flex w-72 shrink-0 flex-col py-6">
                    {sidebar}
                    {/* The rail's end. DockBar measures this to know when to stop being pinned to
                        the window and come to rest against the last rail card instead. Zero-height
                        and aria-hidden: it is a ruler, not content.

                        LAST in the rail, with nothing after it. It used to have to sit after the
                        foot fold-control, which was rail content — a sentinel above it told the
                        bar the rail ended one control early and the bar came to rest on top of
                        the affordance it should have been under. The fold control is not rail
                        content at all now (it is a tick on the dock tab's corner), so the sentinel
                        is simply the end of the rail again.

                        It also lives ONLY here, in the OPEN rail. That is what makes the Vault's
                        rail-end auto-open inert while folded: no sentinel, no rail end, nothing
                        to auto-open a segment that is not on screen (dock-bar.ts RAIL_END_OPENS). */}
                    <div id={RAIL_END_SENTINEL_ID} aria-hidden className="h-0" />
                  </aside>
                )}
                {/* The AdminBar slides over THIS column (absolute, full height) on the
                    `open-admin-bar` event, reporting its width up so the column sizes to match. */}
                <AdminBar onStateChange={setSettings} />
              </div>
            )}
            {/* No member rail here (Focus surfaces, railFor 'none'): STILL mount the
                AdminBar in a zero-width relative column so the page Settings button works
                everywhere (its mobile half portals to <body> from here). The column grows to the bar
                width and the desktop panel slides in over it when opened. ADMIN routes are EXCLUDED:
                they render their own info-rail column (AdminRailDrawerColumn) which mounts the bar over
                that rail, so mounting it here too would be a second, conflicting bar. */}
            {!showSidebar && !isAdminRoute && (
              <div
                className={`relative hidden shrink-0 justify-end lg:flex ${
                  settings.resizing ? '' : 'transition-[width] duration-200 ease-out motion-reduce:transition-none'
                }`}
                style={{ width: settings.open ? settings.width : 0 }}
              >
                <AdminBar onStateChange={setSettings} />
              </div>
            )}
          </div>
          </EntityLayoutMount>
          {/* Mobile settings surface (< lg): the AdminBar mounted in the rail column above self-hosts
              its mobile half through a portal to <body> (it escapes the hidden lg:flex column), so there
              is no separate mobile mount here — exactly one AdminBar renders per route (the live rail
              column: the member rail, the Focus zero-width column, or the admin info-rail column). */}
          </PageAdminProvider>
        </div>

      </div>

      {/* ── Live search overlay (⌘K or the header search) ─────────────────── */}
      {searchOpen && <SearchOverlay onClose={() => setSearchOpen(false)} viewer={{ role: gateRole, staffRole, operatesSpaces }} />}

      {/* Page-specific admin now lives inline at the top of the content
          (PageAdminBar in <main>), replacing the old right-edge admin drawer. */}

      {/* ── Mobile bottom tab bar ─────────────────────────── */}
      {/* The five-tab phone bar (HYG-033: Menu · Feed · Zap · Events · Marketplace)
          from the registry, flanking the raised Zap center action, with the Menu edge arrow.
          Circles and The Quest stay in the drawer. Profile ("You") stays the top-right
          account avatar. Hidden on a full-viewport editor takeover so it never sits over
          the editor's control dock. */}
      {/* The bottom-right Vault tab. A shell sibling, deliberately: the rail column is lg:flex
          and this must render from md. `showSidebar` is the arbitration with the operator page
          dock, which occupies these exact coordinates on /admin. Outside the editor-takeover
          guard below because it is not part of the mobile tab bar -- it is hidden md:block, so
          it never renders at the width the tab bar occupies.

          `folded` is the SAME `railCollapsed` the rail column above is sized by -- passed down,
          never re-derived. The bar spans the OPEN rail's 288px, so under a 56px strip it
          overhung the content column by ~232px. ADR-946 answered that by hiding the whole bar;
          the owner has since amended it (2026-08-05) -- the VAULT segment goes with the rail and
          the CHAT tab stays, with the bar shrinking to fit it, so the overhang is gone without
          Messages going with it. Both halves of that still yield at lg only, because the md-lg
          band has no right rail and therefore no fold tick to bring anything back with. See the
          comment above DockBar for the full trade.
          `onFold` is what puts the rail's fold TICK on this tab's corner: one control per rail,
          on the tab, and the operator bar on /admin passes none because its rail cannot fold.
          The bar closes whatever was open on the way out, through each segment's own close(). */}
      {showSidebar && !editorTakeover && (
        <DockBar vault={dock} folded={railCollapsed} onFold={toggleRail} />
      )}

      {!editorTakeover && (
        <MobileTabBar
          isActive={isActive}
          viewer={{ role: gateRole, staffRole, operatesSpaces }}
          onOpenMenu={() => setDrawerOpen((o) => !o)}
          menuOpen={drawerOpen}
          hideAppNav={hideAppNav}
        />
      )}

      {/* ── Mobile left drawer (the full menu) ────────────── */}
      {!editorTakeover && (
        <MobileLeftDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          role={gateRole}
          identityRole={role}
          operatorContext={operatorContext}
          availableContexts={availableContexts}
          profile={profile}
          profileHref={profileHref}
          isActive={isActive}
          extraSections={extraSections}
          hideAppNav={hideAppNav}
          permissions={permissions}
          navAccess={navAccess}
          staffRole={staffRole}
          operatesSpaces={operatesSpaces}
          sections={navSections}
          menuDriven={menuDriven}
          myFrequency={myFrequency}
          mobileStats={mobileStats}
        />
      )}

    </div>
    </MovementProvider>
    </MindlessProvider>
  )
}
