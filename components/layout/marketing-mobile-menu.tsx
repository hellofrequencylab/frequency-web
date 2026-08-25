'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { ChevronDown, Menu, X } from 'lucide-react'
import { BETA_CTA_LABEL, BETA_CTA_HREF } from '@/lib/site'
import { defaultMenu } from '@/lib/menus/defaults'
import { categoryTriggers } from '@/lib/menus/project'
import { canSeeMenuEl, canSeeMenuItem, flattenCategoryTree } from '@/components/layout/menu-role'
import type { MenuViewer } from '@/components/layout/menu-role'
import type { ResolvedItem, ResolvedMenu } from '@/lib/menus/types'

// Mobile nav for the public marketing header. The desktop PrimaryNav is
// `hidden md:flex`, so phones had no way to reach How-it-works / The Lab /
// Pricing / About / Discover — only the Join CTA. This hamburger opens a
// full-width sheet with the full site nav + sign-in/join.
//
// ── WHAT THIS SHEET DRAWS, AND WHY IT CHANGED (LIVE-106, 2026-08-24) ─────────────────
// It draws the SAME `header` menu the desktop mega bar draws, through the SAME
// panel-or-link projection (lib/menus/project.ts::categoryTriggers) and the SAME viewer
// gate (canSeeMenuItem). Two defects made that necessary, and both were invisible from
// the desktop:
//
//   1. It used to map the registry's parentless TRIGGER nodes flat, one link each. A
//      trigger that opens a dropdown carries its destinations as CHILDREN, so every child
//      was simply absent on a phone. Measured on 2026-08-24: 13 destinations had no path
//      below md — /discover/partners, /discover/practices, the Spaces directory, all five
//      /for/* conversion pages, /pricing, /what-is-frequency, /help, /privacy and /terms.
//   2. It took no menu prop at all, so it rendered the CODE default while PrimaryNav
//      beside it rendered the DB-backed menu. An operator editing the marketing menu saw
//      the change on desktop and never on a phone: the Menu manager quietly did not mean
//      what it said on the surface where most visitors read it.
//
// So the sheet is now a projection, not a parallel list. A dropdown category becomes a
// COLLAPSIBLE group holding every item the desktop panel holds (children flattened in, so
// a sub-grouped column can never vanish); a single-link category stays a plain link with
// the category's own label and its one item's href, exactly as the bar renders it.
//
// The standalone "Discover" block that used to sit under the nav is GONE: all five of its
// links (/discover, /discover/circles, /discover/events, /discover/journeys,
// /discover/topics) are rows of the header menu itself, so it was a second, hand-kept copy
// of five destinations — the kind of copy that drifts the moment an operator edits one.

/** One row of the sheet: a collapsible group, or (when it holds one destination) a link. */
export type SheetGroup = {
  key: string
  label: string
  hasPanel: boolean
  /** The trigger's own destination, for a single-link category. */
  href?: string
  /** Every destination the desktop panel holds, gated for this viewer. */
  items: { label: string; href: string }[]
}

/** The sheet's whole content model, as a pure function of the menu and the viewer.
 *
 *  EXPORTED so it can be measured rather than described: the phone sheet only mounts on a tap,
 *  and this repo has no browser in `pnpm test`, so a source assertion would be the only thing
 *  left to hold — and the defect this replaces was invisible to source assertions for months.
 *  marketing-mobile-menu.test.ts drives this directly and checks the sheet's destination set
 *  against the desktop bar's, which is the property that actually matters. */
export function sheetGroups(menu: ResolvedMenu, viewer: MenuViewer): SheetGroup[] {
  return categoryTriggers(menu)
    .filter((t) => canSeeMenuEl(t.category, viewer, 'category'))
    .map((t) => ({
      key: t.category.id,
      label: t.label,
      hasPanel: t.hasPanel,
      href: t.href,
      // flattenCategoryTree folds a category's CHILD columns in, so a sub-grouped panel
      // (the shape the admin header uses) never loses its rows on a phone.
      items: flattenCategoryTree(t.category, (it) => canSeeMenuItem(it, viewer)).map((it) => ({
        label: it.label,
        href: it.href,
      })),
    }))
    .filter((g) => g.items.length > 0 || !!g.href)
}

export function MarketingMobileMenu({
  light,
  headerMenu,
}: {
  light: boolean
  /** The resolved `header` menu (server-fetched, threaded through MarketingHeader).
   *  Falls back to the code default, exactly like PrimaryNav, so the sheet never breaks. */
  headerMenu?: ResolvedMenu
}) {
  const [open, setOpen] = useState(false)
  const [openGroups, setOpenGroups] = useState<readonly string[]>([])
  const titleId = useId()
  const groupId = useId()
  const openButtonRef = useRef<HTMLButtonElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  // The public marketing header is always a logged-out 'visitor' for menu purposes (the
  // same token PrimaryNav passes), so the sheet hides exactly what the bar hides.
  const groups = useMemo(
    () => sheetGroups(headerMenu ?? defaultMenu('header'), { viewerRole: 'visitor' }),
    [headerMenu],
  )

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    // Move focus into the sheet so keyboard/screen-reader users land on the
    // dialog rather than being left behind on the (now-hidden) page.
    closeButtonRef.current?.focus()
    const trigger = openButtonRef.current
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
      // Return focus to the trigger when the sheet closes.
      trigger?.focus()
    }
  }, [open])

  // Closing the sheet also collapses every group, so reopening it always shows the same
  // scannable list of sections rather than whatever was expanded three pages ago.
  const close = () => {
    setOpen(false)
    setOpenGroups([])
  }

  const link = (item: Pick<ResolvedItem, 'href' | 'label'>, className: string) => (
    <Link key={item.href} href={item.href} onClick={close} className={className}>
      {item.label}
    </Link>
  )

  return (
    // `shrink-0` because this is the ONLY navigation a visitor has below md. It rides three
    // fixed headers whose one flexible child is the wordmark (see marketing-header.tsx); a
    // shrinkable menu button would be the header's escape valve and could be squeezed to nothing.
    <div className="shrink-0 md:hidden">
      <button
        ref={openButtonRef}
        type="button"
        aria-label="Open menu"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className={`rounded-lg p-2 transition-colors ${
          light ? 'text-text hover:bg-surface-elevated' : 'text-on-ink hover:bg-on-ink/10'
        }`}
      >
        <Menu className="h-6 w-6" aria-hidden />
      </button>

      {open && (
        <div className="fixed inset-0 z-[60]">
          <div
            className="absolute inset-0 bg-ink/40 backdrop-blur-sm"
            onClick={close}
            aria-hidden
          />
          {/* top-0 means the sheet starts at the very top edge — in a standalone PWA that
              is UNDER the status bar / notch, so pad the top by the safe-area inset (plus a
              base) or the "Menu" label + Close button get clipped. Cap height + scroll so a
              long nav never runs off the bottom past the home indicator. */}
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            // `px-safe [--px-safe-gutter:1rem]` replaces `px-4 … px-safe`. The two were a pair
            // that could never both apply: px-safe set padding-inline to a bare env() inset,
            // which is 0px in portrait, so the sheet rendered with its label, every nav row and
            // both buttons flush against the left edge of the screen. One utility, one gutter,
            // and the notch still clears in landscape.
            className="absolute inset-x-0 top-0 max-h-[100dvh] overflow-y-auto rounded-b-2xl bg-surface pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-pop px-safe [--px-safe-gutter:1rem]"
            style={{ paddingTop: 'calc(1rem + env(safe-area-inset-top))' }}
          >
            <div className="mb-3 flex items-center justify-between">
              <span
                id={titleId}
                className="text-2xs font-bold uppercase tracking-wider text-muted"
              >
                Menu
              </span>
              <button
                ref={closeButtonRef}
                type="button"
                aria-label="Close menu"
                onClick={close}
                className="-mr-1 rounded-lg p-2 text-muted transition-colors hover:bg-surface-elevated"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>

            <nav className="flex flex-col" aria-label="Site">
              {groups.map((group, i) => {
                // A group with one visible destination is a link, not a disclosure: a
                // collapse that opens onto a single row is a tap the visitor pays for
                // nothing. It carries the ITEM's label so the row says where it lands.
                if (group.items.length <= 1) {
                  const only = group.items[0]
                  const target = group.hasPanel
                    ? only
                    : { href: group.href ?? only?.href, label: group.label }
                  if (!target?.href) return null
                  return link(
                    { href: target.href, label: target.label },
                    'border-b border-border py-3 text-body font-semibold text-text',
                  )
                }

                const isOpen = openGroups.includes(group.key)
                // Indexed, not keyed on the category id: those are DB uuids or synthetic ids with
                // colons in them, and this string is an `id` attribute an aria-controls points at.
                const panelId = `${groupId}-${i}`
                return (
                  <div key={group.key} className="border-b border-border">
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      aria-controls={panelId}
                      onClick={() =>
                        setOpenGroups((prev) =>
                          prev.includes(group.key)
                            ? prev.filter((k) => k !== group.key)
                            : [...prev, group.key],
                        )
                      }
                      className="flex w-full items-center justify-between py-3 text-left text-body font-semibold text-text"
                    >
                      {group.label}
                      <ChevronDown
                        className={`h-5 w-5 shrink-0 text-muted transition-transform ${isOpen ? 'rotate-180' : ''}`}
                        aria-hidden
                      />
                    </button>
                    {/* Rendered even when collapsed, and hidden by CLASS rather than unmounted, so
                        the element `aria-controls` names always exists: an aria-controls pointing at
                        an id that is not in the document is a dangling reference, and assistive tech
                        resolves it to nothing. Deliberately the `hidden` UTILITY and not the `hidden`
                        ATTRIBUTE: the attribute's `display:none` is a UA-sheet rule, which any
                        author-sheet `display` (here `flex`) beats on origin. Tailwind v4's preflight
                        happens to re-declare it `!important` and would have saved us, but a panel
                        that stays open when preflight is trimmed is not a thing to rely on. Either
                        way `display:none` is what keeps the collapsed links out of the tab order and
                        the accessibility tree, which is what a disclosure owes. */}
                    <div id={panelId} className={`flex-col pb-2 pl-3 ${isOpen ? 'flex' : 'hidden'}`}>
                      {group.items.map((item) => link(item, 'py-2.5 text-body text-text'))}
                    </div>
                  </div>
                )
              })}
            </nav>

            <div className="mt-4 flex flex-col gap-2">
              <Link
                href="/sign-in"
                onClick={close}
                className="rounded-control border border-border py-2.5 text-center text-body font-semibold text-text transition-colors hover:bg-surface-elevated"
              >
                Sign in
              </Link>
              <Link
                href={BETA_CTA_HREF}
                onClick={close}
                className="rounded-xl bg-primary py-2.5 text-center text-body font-bold text-on-primary transition-colors hover:bg-primary-hover"
              >
                {BETA_CTA_LABEL}
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
