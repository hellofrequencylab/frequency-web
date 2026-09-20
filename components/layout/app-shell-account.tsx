'use client'

// Account dock + header dropdown extracted from app-shell.tsx (LIVE-412).
// The shell still owns layout chrome; this file is the "you" island.

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { User, Gift, Bug, Palette, ChevronUp } from 'lucide-react'
import { getInitials } from '@/lib/utils'
import { type ThemeMode } from '@/lib/theme/mode'
import { readStoredMode, syncMode, writeStoredMode } from '@/lib/theme/apply-mode'
import { avatarSrc, avatarFocusStyle } from '@/lib/images/avatar-focus'
import { ViewAsControl } from '@/components/layout/view-as-control'
import { ContextSwitcher } from '@/components/layout/context-switcher'
import { ContextBadge } from '@/components/layout/context-badge'
import { DOCK_HEAD_H_CLASS } from '@/components/layout/dock-bar'
import type { AvailableContext, OperatorContext } from '@/lib/context/operator-context'
import { type CommunityRole, RoleBadge } from '@/lib/community-roles'
import type { StaffRole } from '@/lib/staff'
import { defaultMenu } from '@/lib/menus/defaults'
import type { MenuAccess, ResolvedItem, ResolvedMenu } from '@/lib/menus/types'
import { flattenCategoryTree, type MenuViewer } from '@/components/layout/menu-role'
import { railIconFor } from '@/components/layout/nav-icons'
import { SignOutForm } from './sign-out-form'
import { canSeeAccountItem, type Profile } from './app-shell-nav'

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
