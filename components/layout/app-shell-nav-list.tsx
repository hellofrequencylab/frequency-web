'use client'

// Rail row list extracted from app-shell.tsx (LIVE-412). Desktop rail and mobile
// drawer both render this. Helpers live in app-shell-nav.ts.

import type { ElementType } from 'react'
import Link from 'next/link'
import { GhostLink } from '@/components/layout/ghost-link'
import { MyFrequencyMenu } from '@/components/layout/my-frequency-menu'
import type { MyFrequency } from '@/lib/nav/my-frequency'
import type { CommunityRole } from '@/lib/community-roles'
import type { NavAccess } from '@/lib/nav-areas'
import type { StaffRole } from '@/lib/staff'
import type { AccessLevel } from '@/lib/core/access-matrix'
import {
  NAV_SECTIONS,
  TELESCOPE_SECTIONS,
  itemAccess,
  type NavSectionGroup,
} from './app-shell-nav'

// ── Shared nav items (used by desktop sidebar and mobile drawer) ──────────────

export type NavSection = {
  label: string | null
  items: { href: string; label: string; Icon: ElementType }[]
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
