'use client'

// LIVE-412 / ADR-1466. Chrome islands extracted from app-shell.tsx so the composer
// stays under the 1800-line ratchet. Still on the shell's static client graph.

import Link from 'next/link'
import Image from 'next/image'
import { useState, useEffect, useRef } from 'react'
import {
  User,
  Zap,
  X,
  ChevronUp,
  Bug,
  Gift,
  Palette,
  Menu,
} from 'lucide-react'
import { getInitials } from '@/lib/utils'
import { type ThemeMode } from '@/lib/theme/mode'
import { readStoredMode, syncMode, writeStoredMode } from '@/lib/theme/apply-mode'
import { avatarSrc, avatarFocusStyle } from '@/lib/images/avatar-focus'
import { HoverTip } from '@/components/ui/hover-tip'
import { ViewAsControl } from '@/components/layout/view-as-control'
import { ContextSwitcher } from '@/components/layout/context-switcher'
import { ContextBadge } from '@/components/layout/context-badge'
import { DOCK_HEAD_H_CLASS } from '@/components/layout/dock-bar'
import type { AvailableContext, OperatorContext } from '@/lib/context/operator-context'
import { RoleBadge, type CommunityRole } from '@/lib/community-roles'
import type { NavAccess } from '@/lib/nav-areas'
import { calmSpine, canSee, type NavViewer, type SpineTab } from '@/lib/nav/registry'
import type { AccessLevel } from '@/lib/core/access-matrix'
import type { StaffRole } from '@/lib/staff'
import { defaultMenu } from '@/lib/menus/defaults'
import type { MenuAccess, ResolvedItem, ResolvedMenu } from '@/lib/menus/types'
import { flattenCategoryTree, type MenuViewer } from '@/components/layout/menu-role'
import { GhostLink } from '@/components/layout/ghost-link'
import { Wordmark } from '@/components/layout/wordmark'
import { MyFrequencyMenu } from '@/components/layout/my-frequency-menu'
import type { MyFrequency } from '@/lib/nav/my-frequency'
import { railIconFor } from '@/components/layout/nav-icons'
import { SignOutForm } from './sign-out-form'
import { LotusIcon } from '@/components/on-air/icons'
import { useMindless } from '@/components/on-air/mindless'
import {
  canSeeAccountItem,
  itemAccess,
  NAV_SECTIONS,
  TELESCOPE_SECTIONS,
  type NavSectionGroup,
  type Profile,
} from '@/components/layout/app-shell-nav'

// ── Theme hook ────────────────────────────────────────────────────────────────

// The shell's account-menu toggle. The DECISION (what light/dark resolves to) is not here — it is
// lib/theme/mode.ts, which app/layout.tsx's pre-paint bootstrap restates in ES5 and mode.test.ts
// holds the two copies together. This hook only owns the member's CHOICE: read it, write it, and
// hand the re-resolution back to the shared applier.
//
// Two things it deliberately no longer does:
//   · resolve dark itself (`mode === 'dark' || (system && sysDark)`) — that expression existed in
//     four files and is now in one;
//   · own the OS-preference listener. ThemeModeSync in the root layout holds it, so it fires for a
//     member on a public page too, which is exactly where this one never reached.
export function useTheme() {
  const [theme, setThemeState] = useState<ThemeMode>(() => readStoredMode())

  function setTheme(next: ThemeMode) {
    setThemeState(next)
    writeStoredMode(next)
    // Re-resolve rather than apply `next` directly: on a surface the public-community lock covers,
    // the member's choice is stored but not shown, and syncMode is the one thing that knows that.
    syncMode()
  }

  return { theme, setTheme }
}

// ── Profile card (the rail's foot — the account dock) ─────────────────────────
// Public-facing identity: avatar · name · role badge, the view-as control, and the
// operator-context switcher.
//
// Three-docks law (DAWN 2026-08-03): the rail's foot is YOU and what you run. Since
// 2026-08-06 (ADR-954) the "what you run" half lives in MY FREQUENCY at the top of this
// same rail, where a member actually looks — so this card no longer re-renders the
// `profile` menu's link list. That was the same set of links as the top-right account
// dropdown, at the bottom of a rail nobody scrolls to, and the card's own first rule is
// that a control appears in exactly one dock.
//
// What is left is what only this dock can say: who you are, and which hat you are wearing.
// System acts (appearance, sign out) live in the top-right account menu; score lives in the
// Vault dock, bottom right. Nothing is offered twice.

export function ProfileCard({
  profile,
  role,
  realRole,
  profileHref,
  previewVisitor = false,
  operatorContext,
  availableContexts = [],
}: {
  profile: Profile
  role: CommunityRole
  /** True DB role (ignores any view-as override) — gates the janitor control. */
  realRole: CommunityRole
  profileHref: string
  /** Janitor previewing as a logged-out visitor — show a "Visitor" chip. */
  previewVisitor?: boolean
  /** The server-resolved operator-identity context (FRAMING ONLY — never a gate). Frames the chip
   *  + powers the context switcher. Defaults to personal when omitted. */
  operatorContext?: OperatorContext
  /** The contexts the caller may switch into (server-derived from real authority). */
  availableContexts?: AvailableContext[]
}) {
  // The effective context for the chip's framing — personal when none was resolved.
  const context: OperatorContext = operatorContext ?? { kind: 'personal' }
  // The `profile` menu's link list used to be re-rendered HERE as well as in the top-right
  // account dropdown. It is not any more: My Frequency carries "you, and what you run" at the
  // top of this same rail, and DAWN's three-docks card says a control appears in exactly one
  // dock. The resolver + gate imports that fed the duplicate list went with it; the top-right
  // AccountDropdown still owns them, which is the point — one renderer, one place.
  // Pinned at the bottom of the (non-scrolling) left rail, so it stays put on a
  // long scroll. The quick-actions panel opens ONLY on tapping the chevron — it
  // never rises on scroll or hover (that was disorienting); it stays put until the
  // member chooses to open it.
  const [manualOpen, setManualOpen] = useState(false)
  const open = manualOpen

  return (
    <div>
      {/* Compact identity bar — the LEFT tab's head, and now literally the same height as the
          right one: both wear DOCK_HEAD_H_CLASS (components/layout/dock-bar.tsx).
          This comment used to claim it was "matched in height to the right stats bar" while the
          two were 72px and 48px — the owner saw the difference in a screenshot. A shared class
          is the only version of that claim that cannot go stale, and dock-bar.test.ts fails if
          either side hardcodes a height instead of importing it.
          The avatar drops 44px → 38px (`h-9 w-9`, the same square the folded strip shows) so the
          name and its role badge still have their two lines inside the shorter head. */}
      <div className={`flex ${DOCK_HEAD_H_CLASS} items-center gap-2.5 px-1.5`}>
        <Link href={profileHref} className="shrink-0" data-tour-anchor="avatar">
          {profile.avatar_url ? (
            <Image
              src={avatarSrc(profile.avatar_url)}
              alt={profile.display_name}
              width={36}
              height={36}
              style={avatarFocusStyle(profile.avatar_url)}
              className="w-9 h-9 rounded-pill object-cover"
            />
          ) : (
            <div className="w-9 h-9 rounded-pill bg-primary text-on-primary text-body-sm font-bold flex items-center justify-center select-none">
              {getInitials(profile.display_name)}
            </div>
          )}
        </Link>
        <div className="flex-1 min-w-0">
          <Link href={profileHref}>
            <p className="text-body-sm font-semibold text-text truncate leading-tight">
              {profile.display_name}
            </p>
          </Link>
          {previewVisitor ? (
            <span className="mt-1 inline-block rounded-pill bg-surface-elevated px-2 py-0.5 text-3xs font-semibold leading-tight text-muted">
              Visitor
            </span>
          ) : (
            // The real role badge stays; the context badge sits beside it as an ADDITIONAL,
            // clearly-labelled FRAMING signal (operator → the Space brand, admin → an Admin mark).
            <span className="mt-1 flex flex-wrap items-center gap-1">
              <RoleBadge role={role} />
              <ContextBadge context={context} available={availableContexts} />
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setManualOpen((v) => !v)}
          aria-expanded={open}
          aria-label={open ? 'Collapse profile menu' : 'Expand profile menu'}
          // `relative` so this keeps every pixel of its own target. The rail's fold tick is
          // absolutely positioned over the tab's top-right corner and its tap-target floor
          // (32px on a mouse, 44 coarse, up to 56 on the kids generations) reaches down into
          // this corner of the head; a positioned sibling later in the tree hit-tests above an
          // absolutely positioned one, so the chevron wins the overlap and the tick keeps the
          // rest. Two neighbouring controls, neither able to steal the other's press.
          className="relative shrink-0 p-1.5 rounded-md text-subtle hover:text-primary-strong hover:bg-chrome-hover transition-colors"
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
            {/* Operator-identity context switcher ("You're in") — renders only when the caller has
                more than the personal context (server-derived). FRAMING ONLY: it grants no power. */}
            <ContextSwitcher context={context} available={availableContexts} />
            <Link
              href={profileHref}
              className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-body-sm font-medium text-text hover:bg-chrome-hover transition-colors"
            >
              <User className="w-4 h-4 text-muted shrink-0" />
              View profile
            </Link>
            {/* ── THE LINK LIST IS GONE, AND THAT IS THE POINT ────────────────────────────
                This used to re-render the whole `profile` menu here: You / Membership /
                Commerce / Community / Support, the same links as the top-right account
                dropdown, at the far bottom of a rail nobody scrolls to.

                MY FREQUENCY now carries "you, and what you run" at the TOP of this same rail
                (components/layout/my-frequency-menu.tsx), which is where DAWN's three-docks
                card puts that content and where a member actually looks. Keeping the list here
                too would put the same links twice on one rail, four inches apart, against that
                card's first rule: "a control appears in exactly one dock."

                What stays is what only this dock can say: who you are, your standing, and the
                view-as / operator-context controls that belong to the person, not the page. */}
            <p className="px-2 pt-1.5 pb-1 text-2xs leading-relaxed text-muted">
              Your Spaces and Circles are in My Frequency, top of the menu. Appearance and sign
              out are in the account menu, top right.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Account dropdown (top-right) ──────────────────────────────────────────────
// Admin layer: account settings, billing, notifications, theme, sign out.
// Always shows initials. Keeps it feeling functional/admin vs. personal.

export function AccountDropdown({
  profile,
  profileHref,
  themeLabel,
  ThemeIcon,
  cycleTheme,
  menu,
  viewerRole,
  staffRole = null,
  canReceivePayouts = false,
}: {
  profile: Profile
  profileHref: string
  themeLabel: string
  ThemeIcon: React.ElementType
  cycleTheme: () => void
  /** The resolved `profile` menu (lib/menus); its active items render as the editable
   *  account links (grouped into labeled sections) between the fixed Profile/Invite top
   *  and the Report/theme/Sign out bottom. Falls back to the code default. */
  menu?: ResolvedMenu
  /** Viewer token for resolving each item's mode + gate. */
  viewerRole: MenuAccess
  /** Fine-grained staff role — the second axis canSeeMenuItem unions in. */
  staffRole?: StaffRole | null
  /** Real payouts eligibility (host+ OR live partner persona) — gates the "Receive payments"
   *  account link on the true capability instead of the host-tier proxy. */
  canReceivePayouts?: boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    // Esc closes it. The docks law is that all three share one dismissal contract (Esc OR an
    // outside click); the Vault dock already honoured both and this one only had the click, so
    // a keyboard user who opened the system menu had no way back out of it.
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleOutside)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleOutside)
      document.removeEventListener('keydown', handleKey)
    }
  }, [])

  const resolvedMenu = menu ?? defaultMenu('profile')
  const menuViewer: MenuViewer = { viewerRole, staffRole }
  // Each account section (category) → a muted section header + its gated items, child
  // categories flattened in (flattenCategoryTree, so sub-group links still render); any
  // leftover ungrouped rootItems still render (safety). canSeeMenuItem is the shared
  // two-axis union gate — no permission gate changes, only where the list is grouped.
  const accountSections = resolvedMenu.categories
    .map((cat) => ({ label: cat.label, items: flattenCategoryTree(cat, (it) => canSeeAccountItem(it, menuViewer, canReceivePayouts)) }))
    .filter((s) => s.items.length > 0)
  const looseAccountLinks = resolvedMenu.rootItems.filter((it) => canSeeAccountItem(it, menuViewer, canReceivePayouts))
  const renderAccountLink = (it: ResolvedItem) => {
    const Icon = railIconFor(it.icon)
    return (
      <Link
        key={it.id}
        href={it.href}
        onClick={() => setOpen(false)}
        className="flex items-center gap-2.5 px-3 py-2 text-body-sm text-text hover:bg-surface-elevated transition-colors"
      >
        <Icon className="w-4 h-4 text-subtle" />
        {it.label}
      </Link>
    )
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Account menu"
        aria-expanded={open}
        className="flex items-center justify-center w-8 h-8 rounded-pill bg-surface-elevated text-muted text-2xs font-semibold ring-1 ring-border hover:text-text hover:ring-border-strong transition-colors select-none shrink-0"
      >
        {getInitials(profile.display_name)}
      </button>

      {open && (
        // The SYSTEM dock's popover (three-docks law): opens from the top-right corner
        // toward the interior. `.glass` + `.lift-3` on the cue-pop beat — the shared dock
        // popover shell, so the system dock and the Vault dock read as one language.
        // The shared dock popover shell: `.glass` + `.lift-3`, arriving on the cue-pop beat.
        // All three docks are supposed to look like one another; this one was flat `bg-surface`
        // with the `shadow-menu` literal, so the system dock read as a different language from
        // the Vault dock it sits diagonally across from.
        // `.glass` is unlayered, so it beats a Tailwind border/background utility outright —
        // it owns both here, and adding them back would be dead text of exactly the kind
        // check:bridge exists to catch.
        // 🔴 `max-h-[80vh]` PUT THE SIGN OUT ROW BEHIND THE TAB BAR, and the z-index cannot save it.
        // This header is `sticky … z-30`, and a positioned element with a z-index CREATES A STACKING
        // CONTEXT — so this panel's `z-50` only orders it against its siblings inside the header. The
        // mobile tab bar is `z-40` in the ROOT context (see MobileTabBar), which puts the whole bar,
        // and the raised Zap catch that stands 22px proud of it, on top of this menu.
        //
        // Measured at the 17px root: the panel opens at 68px (`--app-header-h` + `mt-2`), so on a
        // 320x568 iPhone SE its bottom lands at 522 against a catch that starts at 486 — 36px of menu
        // behind the bar, which is exactly the Sign out row. At 390x844 it is 15px. Only 360x800
        // happened to clear.
        //
        // `vh` compounded it: on a phone that is the LARGE viewport (URL bar out of the way), so the
        // panel was already measured against ~15px more than the member could see before the tab bar
        // was counted at all. Same cap as the notifications sheet, built from the same two tokens
        // rather than from literals that happen to agree today.
        <div className="glass lift-3 animate-cue-pop absolute right-0 top-full mt-2 w-60 rounded-card py-1 z-50 max-h-[80dvh] max-sm:max-h-[calc(100dvh-var(--app-header-h)-var(--tab-bar-clearance)-1rem)] overflow-y-auto">

          {/* Header */}
          <div className="px-3 py-2.5 border-b border-border">
            <p className="text-2xs font-semibold uppercase tracking-wider text-muted mb-0.5">
              Account
            </p>
            <p className="text-body-sm font-semibold text-text truncate">
              {profile.display_name}
            </p>
            <p className="text-meta text-subtle truncate">@{profile.handle}</p>
          </div>

          {/* Account links — the editable `profile` menu (ADR-390), a prioritized, grouped
              list (You · Membership · Commerce · Community · Support — docs/MOBILE-NAV-PLAN.md
              §2). Gated items are HIDDEN unless the viewer qualifies (canSeeMenuItem). Fixed
              chrome is WOVEN into the matching groups: View profile + Appearance in You, Invite
              friends in Community, Report a bug in Support. Any ungrouped rootItems render first
              for safety; fallbacks below catch a custom DB menu that renamed a group. */}
          {looseAccountLinks.length > 0 && (
            <div className="border-t border-border py-1">
              {looseAccountLinks.map(renderAccountLink)}
            </div>
          )}
          {accountSections.map((s) => (
            <div key={s.label ?? 'section'} className="border-t border-border py-1">
              {s.label ? (
                <p className="px-3 pt-1 pb-0.5 text-2xs font-semibold uppercase tracking-wider text-muted">
                  {s.label}
                </p>
              ) : null}
              {s.label === 'You' && (
                <Link
                  href={profileHref}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2.5 px-3 py-2 text-body-sm text-text hover:bg-surface-elevated transition-colors"
                >
                  <User className="w-4 h-4 text-subtle" />
                  View profile
                </Link>
              )}
              {s.items.map(renderAccountLink)}
              {s.label === 'You' && (
                <>
                  <button
                    onClick={() => { cycleTheme() }}
                    className="flex items-center gap-2.5 px-3 py-2 text-body-sm text-text hover:bg-surface-elevated w-full text-left transition-colors"
                  >
                    <ThemeIcon className="w-4 h-4 text-subtle" />
                    {themeLabel}
                  </button>
                  {/* 🔴 THERE WAS NO APPEARANCE LINK, while three comments in this file said there
                      was. They all describe "Appearance" as fixed chrome woven into the You group,
                      and what is actually woven in is the light/dark CYCLE button above — a
                      different control with a different job. Grepping `/settings#appearance` across
                      the app finds the href in a route-map and in tests, and in no menu.
                      So the three-axis picker (palette, feel, seasonal accent) was reachable only by
                      opening Settings and scrolling past Profile, which on a phone is most of a
                      screen of scrolling to reach a surface the account menu claims to offer.
                      The cycle button stays: mode is the thing people change often and it is worth a
                      one-tap control. This is the way to everything else it cannot express. */}
                  <Link
                    href="/settings#appearance"
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-2.5 px-3 py-2 text-body-sm text-text hover:bg-surface-elevated transition-colors"
                  >
                    <Palette className="w-4 h-4 text-subtle" />
                    Appearance
                  </Link>
                </>
              )}
              {s.label === 'Community' && (
                <button
                  type="button"
                  onClick={() => { setOpen(false); window.dispatchEvent(new Event('open-invite')) }}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-body-sm text-text hover:bg-surface-elevated transition-colors"
                >
                  <Gift className="w-4 h-4 text-primary-strong" />
                  Invite friends · earn Zaps
                </button>
              )}
              {s.label === 'Support' && (
                <button
                  type="button"
                  onClick={() => { setOpen(false); window.dispatchEvent(new CustomEvent('open-support', { detail: { type: 'bug' } })) }}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-body-sm text-text hover:bg-surface-elevated transition-colors"
                >
                  <Bug className="w-4 h-4 text-subtle" />
                  Report a bug
                </button>
              )}
            </div>
          ))}

          {/* Fallback chrome — only when a custom DB menu dropped/renamed a standard group, so
              View profile / Appearance / Invite / Report a bug never vanish. Inert on defaults. */}
          {!accountSections.some((s) => s.label === 'You') && (
            <div className="border-t border-border py-1">
              <Link
                href={profileHref}
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 px-3 py-2 text-body-sm text-text hover:bg-surface-elevated transition-colors"
              >
                <User className="w-4 h-4 text-subtle" />
                View profile
              </Link>
              <button
                onClick={() => { cycleTheme() }}
                className="flex items-center gap-2.5 px-3 py-2 text-body-sm text-text hover:bg-surface-elevated w-full text-left transition-colors"
              >
                <ThemeIcon className="w-4 h-4 text-subtle" />
                {themeLabel}
              </button>
            </div>
          )}
          {!accountSections.some((s) => s.label === 'Community') && (
            <div className="border-t border-border py-1">
              <button
                type="button"
                onClick={() => { setOpen(false); window.dispatchEvent(new Event('open-invite')) }}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-body-sm text-text hover:bg-surface-elevated transition-colors"
              >
                <Gift className="w-4 h-4 text-primary-strong" />
                Invite friends · earn Zaps
              </button>
            </div>
          )}
          {!accountSections.some((s) => s.label === 'Support') && (
            <div className="border-t border-border py-1">
              <button
                type="button"
                onClick={() => { setOpen(false); window.dispatchEvent(new CustomEvent('open-support', { detail: { type: 'bug' } })) }}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-body-sm text-text hover:bg-surface-elevated transition-colors"
              >
                <Bug className="w-4 h-4 text-subtle" />
                Report a bug
              </button>
            </div>
          )}

          {/* Sign out */}
          <div className="border-t border-border py-1">
            <SignOutForm buttonClassName="flex items-center gap-2.5 px-3 py-2 text-body-sm text-danger hover:bg-danger-bg w-full text-left transition-colors" />
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

export function NavLinkList({
  isActive,
  role,
  onNavigate,
  extraSections,
  hideAppNav = false,
  permissions,
  navAccess,
  staffRole = null,
  operatesSpaces = false,
  sections = NAV_SECTIONS,
  compact = false,
  menuDriven = false,
  myFrequency = null,
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
  /** Does the viewer own/run at least one Space? Gates any item with requiresOperatedSpaces. */
  operatesSpaces?: boolean
  /** Which area sections to render. Defaults to the full rail (NAV_SECTIONS). */
  sections?: NavSectionGroup[]
  /** Icon-only column (the micro edge menu): no labels, no section headers. */
  compact?: boolean
  /** Sections came from the DB-backed menu (lib/menus): each item carries its
   *  already-resolved `mode` (active / ghost; hidden was dropped upstream), so render
   *  by mode and SKIP the legacy itemAccess + telescope gating (no double-gate). */
  menuDriven?: boolean
  /** The member's own things (lib/nav/my-frequency). Rendered as the disclosure directly under
   *  the home anchor. Omitted (a visitor preview, or a failed read) simply drops the row. */
  myFrequency?: MyFrequency | null
}) {
  // `emphasize` = the home anchor (Feed): always the brand's dark brown and bold,
  // active or not, so it reads as the rail's permanent "home".
  // A nested Admin tool (ADR-848): indented under its box and hung off a hairline, the same
  // treatment the Space rail uses for its twelve boxes. Never applied in `compact` (the icon-only
  // edge column has no room for a hierarchy, and the tooltip already names the destination).
  // (The `nestClass` indent went with the nesting pass — see the note in the section map below.
  //  Every rail row is depth 0 now, so an indent helper would only ever return the empty string.)

  // The row. `rounded-control` (not a literal step) so a skin retunes the rail with the rest
  // of the controls — Midnight sharpens it, the kids generations round it right off.
  //
  // `py-2` is a DELIBERATE divergence from DAWN's 0.42rem, and the one place this rail does not
  // chase the mock. 0.42rem is 7.14px here, which puts a row at ~31px — under the 32px density
  // floor `--tap-min` defends, before a coarse pointer even asks for 44. The mock is a static
  // capture with no pointer to satisfy; accessibility floors are not a style to match. It costs
  // ~1.4px a row against the reference and is worth it.
  // The WEIGHT LADDER is DAWN's (ui_kits/app/nav-rail.jsx NavRow): a resting row is 600 and the
  // active row is 800, because the active row is meant to be "the one amber moment" in the rail
  // and colour alone was carrying it. The home anchor keeps its own 700 brand treatment.
  const itemClass = (active: boolean, emphasize = false) =>
    `flex items-center gap-2.5 px-3 py-[0.42rem] rounded-control text-body-sm transition-colors ${
      emphasize
        ? `font-bold text-[var(--brand-mark)] ${active ? 'bg-primary-bg' : 'hover:bg-surface'}`
        : active
          ? 'bg-primary-bg text-primary-strong font-extrabold'
          : 'text-muted font-semibold hover:bg-surface hover:text-text'
    }`

  // The group label is an EYEBROW, and eyebrows are tracked at 0.18em (`--tracking-eyebrow`).
  // `tracking-wider` is 0.05em — 3.6× tighter than the token on the one element whose whole job
  // is to look deliberately spaced. Size stays `text-2xs` (DAWN's rail overrides the eyebrow
  // utility's own size the same way), so this moves tracking only and cannot reflow the rail.
  const sectionLabelClass =
    'px-3 pt-1 pb-1.5 text-2xs font-semibold uppercase tracking-eyebrow text-muted'

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
        // DB-driven sections skip this: effectiveMode already resolved each item (hidden
        // dropped, empty groups dropped upstream), so the menu's minAccess + role modes own it.
        const adminSection = !menuDriven && TELESCOPE_SECTIONS.has(section.label ?? '')
        const gatedItems = adminSection
          ? section.items.filter((it) => itemAccess(it, role, staffRole, permissions, navAccess, operatesSpaces) === 'full')
          : section.items
        // ── THE RAIL RENDERS THE MENU'S OWN ORDER, FLAT (owner, 2026-08-06) ──────────────────
        //
        // 🔴 THIS USED TO CALL `nestAdminRows` (ADR-848), and that pass is RETIRED here. It did
        // two things to the Admin section at render time: it INDENTED tools under their Studio
        // world, and — the part that actually bit — it RE-SORTED, hoisting each child up to sit
        // directly beneath its box.
        //
        // So the rail could not agree with the Menu Manager. An operator saw a flat, ordered list
        // in the editor (Dashboard, Leadership, Programs, Growth, Community, Resonance CRM,
        // Market admin, Manage Spaces, ...) and the live rail showed Loom Studio hoisted under
        // Programs, CRM and QR Studio under Growth, four tools under Operations. Dragging a row
        // in the editor moved it in the database and then the renderer put it back. That is not a
        // menu an operator can lay out, which is the whole point of the Manager.
        //
        // The nesting was derived and defensible; it was also a SECOND source of order competing
        // with the one the operator controls. The menu is now the only source: what the Manager
        // shows is what the rail draws. `lib/nav/admin-nesting.ts` and `lib/nav/admin-rail.ts`
        // survive as drift-guard/test-only records of the ADR-850 reconciliation (admin-rail.test.ts
        // + space-rail-coverage.test.ts consume them); nothing at runtime reads them.
        const visibleItems = gatedItems
        if (visibleItems.length === 0) return null
        return (
        <div
          key={section.label ?? `top-${i}`}
          // ── NO HAIRLINES BETWEEN GROUPS. SPACE DOES THE GROUPING. ─────────────────────────
          //
          // OWNER, 2026-08-05, off a live screenshot of /feed: "remove the horizontal lines in
          // the rail menu." Both went — the `border-b` under the home anchor in the open rail and
          // the leading `border-t` before each labelled group in the folded strip.
          //
          // 🔴 A DIVIDER REMOVED WITHOUT COMPENSATION IS NOT A CLEANER MENU, IT IS ONE LONG LIST.
          // The line was carrying real separation, so the gaps grew to carry it instead — measured
          // at this app's 17px root, not eyeballed:
          //
          //   open rail    group gap `mt-4` → `mt-6`, 17px → 25.5px (+50%). Against the 2.125px
          //                `space-y-0.5` between rows INSIDE a group that takes the ratio from 8x
          //                to 12x — and 8x plus a hairline reads as a break where 8x alone reads
          //                as a pause. The home anchor keeps its extra breath as `pb-1`: it ran
          //                pb-2 + mb-1 + the next group's mt-4 = 29.75px and a line, and it now
          //                runs pb-1 + mt-6 = 29.75px exactly. Same distance, no rule.
          //   folded strip group gap `mt-2 pt-2` → `mt-5`, 17px → 21.25px, against the 4.25px
          //                `gap-1` between icons — 4x to 5x. The strip has no labels and no text
          //                to read, so it needs the RATIO to be unmistakable more than the open
          //                rail does, and it has less room to spend on it.
          //
          // 🔴 AND THE FOLDED STRIP'S GROUPS STAY NAMED. Folding drops the visible group label, so
          // the grouping survives for a screen reader as `role="group"` + `aria-label` — that is
          // what carried it before, because a hairline was never an accessible name any more than
          // a tooltip is. Deleting the line therefore costs assistive tech NOTHING: it never had
          // the line. Losing this pair would be the silent half of the owner's instruction going
          // wrong, which is why rail-fold.test.ts pins it.
          className={
            compact
              ? `flex flex-col items-center gap-1 ${i > 0 && section.label ? 'mt-5' : ''}`
              : `space-y-0.5 ${i > 0 ? 'mt-6' : ''} ${isHomeAnchor ? 'pb-1' : ''}`
          }
          role={compact && section.label ? 'group' : undefined}
          aria-label={compact && section.label ? section.label : undefined}
        >
          {!compact && section.label && <p className={sectionLabelClass}>{section.label}</p>}
          {visibleItems.map((item) => {
            const { href, label, Icon } = item

            // DB-driven rail (lib/menus): the item's mode was already resolved for the viewer
            // by effectiveMode (hidden dropped upstream). 'ghost' → a muted GhostLink that opens
            // the upgrade lightbox; 'active' → a normal rail link. No legacy itemAccess gating.
            if (menuDriven && item.mode) {
              const active = isActive(href)
              if (item.mode === 'ghost') {
                if (compact) {
                  return (
                    <GhostLink
                      key={item.key}
                      ghostTier={item.ghostTier}
                      ghostMessage={item.ghostMessage}
                      ariaLabel={label}
                      className="flex h-11 w-11 items-center justify-center rounded-control text-subtle"
                    >
                      <Icon className="h-5 w-5" strokeWidth={2} aria-hidden />
                    </GhostLink>
                  )
                }
                return (
                  <GhostLink
                    key={item.key}
                    ghostTier={item.ghostTier}
                    ghostMessage={item.ghostMessage}
                    ariaLabel={label}
                    className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-body-sm font-medium text-subtle`}
                  >
                    <Icon className="h-[17px] w-[17px] shrink-0" strokeWidth={2} aria-hidden />
                    {label}
                  </GhostLink>
                )
              }
              if (compact) {
                return (
                  <Link
                    key={item.key}
                    href={href}
                    onClick={onNavigate}
                    aria-label={label}
                    title={label}
                    className={`flex h-11 w-11 items-center justify-center rounded-control transition-colors ${
                      active ? 'bg-primary-bg text-primary-strong' : 'text-muted hover:bg-chrome-hover hover:text-text'
                    }`}
                  >
                    <Icon className="h-5 w-5" strokeWidth={active ? 2.5 : 2} />
                  </Link>
                )
              }
              return (
                <Link key={item.key} href={href} onClick={onNavigate} data-tour-anchor={`nav-${item.key}`} className={itemClass(active)}>
                  <Icon className="w-[17px] h-[17px] shrink-0" strokeWidth={2} />
                  {label}
                </Link>
              )
            }

            // The viewer's matrix level on this surface. full → the normal link; limited →
            // a muted "ghost" preview that still clicks through to the gated page (e.g. a
            // visitor on Practices/Library); none → a disabled, non-clickable ghost. Admin
            // sections were pre-filtered to full-access items above.
            const access = itemAccess(item, role, staffRole, permissions, navAccess, operatesSpaces)
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
                    className="flex h-11 w-11 items-center justify-center rounded-control text-subtle opacity-50 cursor-not-allowed select-none"
                  >
                    <Icon className="h-5 w-5" strokeWidth={2} aria-hidden />
                    {/* The open rail names this row with visible text. Folding takes the text
                        away, and `title` is a TOOLTIP, not an accessible name — so the name is
                        carried explicitly. Same reason the reachable rows carry aria-label. */}
                    <span className="sr-only">{label}</span>
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
                  className={`flex h-11 w-11 items-center justify-center rounded-control transition-colors ${
                    active
                      ? 'bg-primary-bg text-primary-strong'
                      : reachable
                        ? 'text-muted hover:bg-chrome-hover hover:text-text'
                        : 'text-subtle hover:bg-chrome-hover'
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
                  className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-body-sm font-medium transition-colors ${
                    // The ACTIVE ghost row is a background on chrome, so it has the same problem
                    // its hover did: `surface-elevated` is 3/255 off the rail's own ground.
                    active ? 'bg-chrome-hover text-muted' : 'text-subtle hover:bg-chrome-hover hover:text-muted'
                  }`}
                >
                  <Icon className="h-[17px] w-[17px] shrink-0" strokeWidth={2} />
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
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-body-sm font-medium text-subtle opacity-50 cursor-not-allowed select-none`}
                >
                  <Icon className="w-[17px] h-[17px] shrink-0" strokeWidth={2} />
                  {label}
                </div>
              )
            }
            const active = isActive(href)
            return (
              <Link key={href} href={href} onClick={onNavigate} data-tour-anchor={`nav-${item.key}`} className={itemClass(active)}>
                <Icon className="w-[17px] h-[17px] shrink-0" strokeWidth={2} />
                {label}
              </Link>
            )
          })}
          {/* MY FREQUENCY closes the home anchor — the seam the flat Profile link used to
              occupy. Inside the group (not after it) so the anchor's own spacing carries it,
              and so a fold keeps it in the same run of squares. */}
          {isHomeAnchor && myFrequency && (
            <MyFrequencyMenu
              data={myFrequency}
              isActive={isActive}
              onNavigate={onNavigate}
              compact={compact}
            />
          )}
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
                  className={`flex h-11 w-11 items-center justify-center rounded-control transition-colors ${
                    active ? 'bg-primary-bg text-primary-strong' : 'text-muted hover:bg-chrome-hover hover:text-text'
                  }`}
                >
                  <Icon className="h-5 w-5" strokeWidth={active ? 2.5 : 2} />
                </Link>
              )
            }
            return (
              <Link key={href} href={href} onClick={onNavigate} className={itemClass(active)}>
                <Icon className="w-[17px] h-[17px] shrink-0" strokeWidth={2} />
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

/** The Vault region revealed inside the drawer's identity card. Named once so the chevron's
 *  `aria-controls` and the region it points at can never drift apart. */
const DRAWER_VAULT_ID = 'fq-drawer-vault'

export function MobileLeftDrawer({
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

// ── Mobile bottom tab bar ─────────────────────────────────────────────────────
// The primary destinations, thumb-reachable along the bottom (the most native
// mobile pattern). The last tab — Menu — opens the full drawer (identity, rewards,
// and the long-tail nav). Keeps full content width: nothing is permanently eaten
// from the side of an already-narrow phone screen.

// The three calm spine destinations (HYG-033: Feed · Events · Marketplace), derived from
// the ONE registry (lib/nav/registry.ts::calmSpine) — no parallel hardcoded list. They
// flank the raised Zap center button. Each tab carries its backing calm NavNode
// (href · gate · icon key); icons still come from AREA_ICONS so the bar stays in lockstep
// with the rail/drawer, and each tab gate-filters through canSee. Order here IS bar order
// (Menu · Feed · Zap · Events · Marketplace). Circles and The Quest live in the drawer.
// Stats moved to the left drawer; Messages moved to the header.

export function MobileTabBar({
  isActive,
  viewer,
  onOpenMenu,
  menuOpen,
  hideAppNav = false,
}: {
  isActive: (href: string) => boolean
  /** The gate identity the spine destinations project through (canSee — the ONE resolver). */
  viewer: NavViewer
  onOpenMenu: () => void
  menuOpen: boolean
  /** Stripped shells (e.g. Studio) hide the app destinations; only the menu arrow remains. */
  hideAppNav?: boolean
}) {
  // The calm spine destinations from the registry, gate-filtered through canSee — the same
  // resolver every surface uses (so a visitor never sees a member-gated tab). Split around
  // the Zap center button: floor(n/2) left of Zap, the rest right (Feed | Zap | Events,
  // Marketplace when the ruled bar is three destinations).
  const tabs = calmSpine().filter((t) => canSee(t.node, viewer))
  const tabsLeft = tabs.slice(0, Math.floor(tabs.length / 2))
  const tabsRight = tabs.slice(Math.floor(tabs.length / 2))

  // Every item — Menu, Zap, and the destination tabs — is flex-1 with the same icon size +
  // stroke weight, so the row reads as one evenly-spaced, uniform set. Active is shown by
  // COLOR only (not a heavier stroke), so weights never differ across the row.
  // 🔴 `min-w-0` IS WHAT MAKES `flex-1` MEAN "an equal fifth". A flex item's default
  // `min-width:auto` floors it at its content width, and here the content is a LABEL. The
  // seven-slot bar summed to 319px against a 320px screen; five slots at 320px are 64px,
  // which is the line Marketplace sits on. `truncate` still clips if a future label overruns;
  // header-fit.test.ts asserts the current labels against that 64px slot.
  const tabClass = (active: boolean) =>
    `flex min-w-0 flex-1 flex-col items-center justify-end gap-1.5 pb-2 text-3xs font-medium transition-colors ${
      active ? 'text-primary-strong' : 'text-muted hover:text-text'
    }`

  const renderTab = (tab: SpineTab) => {
    // Icon key is the node id (AREA_ICONS is keyed by area key, == the node id for spine nodes).
    const Icon = AREA_ICONS[tab.node.icon] ?? Globe
    const active = isActive(tab.node.href)
    return (
      <Link key={tab.node.id} href={tab.node.href} aria-label={tab.label} className={tabClass(active)}>
        <Icon className="h-[22px] w-[22px] shrink-0" strokeWidth={2} />
        {/* ONE line, clipped rather than wrapped or overflowing. The tab's accessible name is the
            full label (aria-label on the Link), so a truncated word never costs a screen-reader
            user the destination — and the icon, not the caption, is what a thumb aims at. */}
        <span className="w-full truncate text-center leading-none">{tab.label}</span>
      </Link>
    )
  }

  // The edge buttons (menu + stats) are plain tabs too — same flex-1 width, icon, and weight.
  const handle =
    'flex min-w-0 flex-1 flex-col items-center justify-end gap-1.5 pb-2 text-3xs font-medium text-muted transition-colors active:text-text'

  return (
    <nav
      className="md:hidden fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t border-border bg-surface/95 backdrop-blur-sm"
      style={{
        height: 'var(--tab-bar-h)',
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
        {menuOpen ? <X className="h-[22px] w-[22px] shrink-0" strokeWidth={2} /> : <Menu className="h-[22px] w-[22px] shrink-0" strokeWidth={2} />}
        <span className="w-full truncate text-center leading-none">Menu</span>
      </button>

      {!hideAppNav && tabsLeft.map(renderTab)}

      {/* Zap — the action button (ADR-230, restored 2026-09-15 by owner ruling; see ADR-1362).
          Member-facing it's Zap; the backend stays Capture (the 'open-capture' event, the
          captures machinery): Zap is the function that captures. The bolt is a LIGHT glyph on
          the orange button in light mode and a DARK glyph on the gold button at night, with a
          soft catch behind it that flips to match (all tokens).

          LIVE-247 briefly made this disc a Create button whose sheet carried the Zap menu as a
          Post row. The structured creates it hosted are NOT stranded by this revert: /events and
          /circles each carry their own compose button (EventCompose, NewCircleCompose) on every
          viewport, and the desktop feed's CreateMenu still renders the whole CREATE_ITEMS list —
          which keeps the role widening that change was also right about. What the sheet cost was
          the one thing this button is for: Zapping in one tap. */}
      {!hideAppNav && (
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent('open-capture', { detail: { mode: 'post' } }))}
          aria-label="Zap, capture a moment"
          className="relative flex min-w-0 flex-1 flex-col items-center justify-end gap-1.5 pb-2 text-3xs font-semibold text-primary-strong"
        >
          {/* The circle sits a touch lower than dead-center on the bar's top edge so
              it reads balanced against the flat tabs (its center is 6px below the
              line); the arch above drops to match, keeping the even 12px margin. */}
          <span aria-hidden className="h-[26px] w-[22px]" />
          {/* The fully-rounded white catch the bolt sits in — a floating disc, not a bar bump.
              The lift is `--tab-bar-lift`, not a 22px literal: this disc is slot 0a of the
              mobile stacking contract (components/sidebar/game-stats-dock.tsx), and the same
              number decides how far the content column has to pad to clear it
              (`--tab-bar-clearance`). Two literals that happened to agree is how the teaser
              pill and the RSVP bar each got painted over. */}
          <span aria-hidden className="absolute left-1/2 top-0 h-14 w-14 -translate-x-1/2 -translate-y-[var(--tab-bar-lift)] rounded-pill border border-border bg-surface" />
          <span className="absolute left-1/2 top-0 flex h-12 w-12 -translate-x-1/2 -translate-y-[18px] items-center justify-center rounded-pill bg-primary shadow-pop">
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
          <span className="w-full truncate text-center leading-none">Zap</span>
        </button>
      )}

      {!hideAppNav && tabsRight.map(renderTab)}
    </nav>
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

export function MindlessLaunch() {
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

