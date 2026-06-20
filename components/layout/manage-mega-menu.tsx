'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutGrid, Plus, Compass, Building2, Crown } from 'lucide-react'
import { HoverTip } from '@/components/ui/hover-tip'
import { spaceTypeLabel } from '@/components/spaces/space-type'
import { getManagedSpaces } from '@/lib/spaces/managed-actions'
import type { ManagedSpace } from '@/lib/spaces/managed'

// ── The header mega-menu LAUNCHER (WEBSITE-CHANGES-PLAN §6 E.3 / E.4, decision D3 = launcher only) ──
//
// The missing GLOBAL entry to entity / Space management. A "Manage" trigger sits beside the wordmark;
// clicking it folds out a wide panel listing the viewer's OWNED / MANAGED Spaces (each deep-linking to
// its /spaces/<slug>/settings hub, with a type chip), plus "New Space" and "Browse directory". This is
// a PURE LAUNCHER: no persistent active-Space context, no cookie — it just routes you into a Space's
// back-end. The operator/admin world stays in the left rail (D3); this never touches it.
//
// BEHAVIOR (E.4): open on CLICK (not hover). Fade-on-disengage — the panel closes on outside-click,
// Esc, AND pointer-leave with a ~400ms exit delay (so a brief overshoot doesn't snap it shut). WCAG
// 1.4.13: dismissible (Esc / click-away), keyboard reachable (Tab through the links, Esc to close),
// and the trigger carries aria-haspopup/aria-expanded. Reuses the PrimaryNav Dropdown's outside-click
// + Esc pattern; the pointer-leave delay is the "fades when not engaged" layer on top.
//
// The managed-Spaces list is loaded LAZILY on first open via the getManagedSpaces server action
// (tenancy-safe + fail-safe to [] in lib/spaces/managed.ts), so the header never blocks on it. The
// panel renders a "create your first Space" empty state when the viewer manages none.
//
// Tokens only; copy carries no em or en dashes (CONTENT-VOICE).

// The exit delay before a pointer-leave actually closes the panel (E.4 = ~300-500ms). A re-enter
// within the window cancels the close, so the menu "fades when not engaged" without snapping shut on
// a brief overshoot.
const EXIT_DELAY_MS = 400

function ManageMegaMenuInner() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  // `spaces === null` = not yet loaded; the effect kicks the lazy fetch on first open. The fetch
  // resolves into state via its callbacks; a ref guards against firing it twice.
  const [spaces, setSpaces] = useState<ManagedSpace[] | null>(null)
  const fetchedRef = useRef(false)
  // Close the panel on navigation (a link inside it routed away). The render-time pathname compare
  // mirrors the app shell's drawer-close pattern (useState, not a ref, so it's lint-clean).
  const [lastPath, setLastPath] = useState(pathname)
  const ref = useRef<HTMLDivElement>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  if (lastPath !== pathname) {
    setLastPath(pathname)
    if (open) setOpen(false)
  }

  const cancelClose = useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
  }, [])

  const close = useCallback(() => {
    cancelClose()
    setOpen(false)
  }, [cancelClose])

  // Fade-on-disengage: a pointer-leave starts the exit timer; a re-enter (cancelClose) aborts it.
  const scheduleClose = useCallback(() => {
    cancelClose()
    closeTimer.current = setTimeout(() => setOpen(false), EXIT_DELAY_MS)
  }, [cancelClose])

  // Lazy-load the viewer's managed Spaces on first open (the server action is tenancy-safe + fail-safe
  // to []). The `fetchedRef` guard fires the action at most once; state is only set from the async
  // callbacks (never synchronously in the effect body), so a re-open never re-fetches.
  useEffect(() => {
    if (!open || fetchedRef.current) return
    fetchedRef.current = true
    let alive = true
    getManagedSpaces()
      .then((list) => {
        if (alive) setSpaces(list)
      })
      .catch(() => {
        if (alive) setSpaces([])
      })
    return () => {
      alive = false
    }
  }, [open])

  // Outside-click + Esc dismissal (WCAG 1.4.13), the PrimaryNav Dropdown pattern.
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, close])

  // Clear any pending timer on unmount.
  useEffect(() => cancelClose, [cancelClose])

  return (
    <div
      ref={ref}
      className="relative flex items-stretch"
      onPointerLeave={scheduleClose}
      onPointerEnter={cancelClose}
    >
      <HoverTip label="Manage your Spaces">
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label="Manage your Spaces"
          onClick={() => setOpen((o) => !o)}
          className={`flex items-center gap-1.5 h-8 sm:h-9 px-2 sm:px-2.5 rounded-full text-sm font-semibold transition-colors ${
            open
              ? 'text-text bg-surface-elevated'
              : 'text-muted hover:text-text hover:bg-surface-elevated'
          }`}
        >
          <LayoutGrid className="h-5 w-5" aria-hidden />
          <span className="hidden md:inline">Manage</span>
        </button>
      </HoverTip>

      {open && (
        <div
          role="menu"
          aria-label="Manage your Spaces"
          className="absolute left-0 top-full mt-2 w-[22rem] max-w-[calc(100vw-1.5rem)] rounded-2xl border border-border bg-surface shadow-pop p-2 z-50"
        >
          {/* My Spaces — the viewer's owned / managed Spaces, each deep-linking to its settings hub. */}
          <p className="px-2 pt-1 pb-1.5 text-3xs font-semibold uppercase tracking-wider text-subtle">
            Your Spaces
          </p>

          {spaces === null ? (
            <div className="space-y-1 px-1 pb-1">
              {[0, 1].map((i) => (
                <div key={i} className="h-12 rounded-xl bg-surface-elevated animate-pulse" />
              ))}
            </div>
          ) : spaces.length > 0 ? (
            <div className="max-h-[19rem] overflow-y-auto pb-1">
              {spaces.map((space) => (
                <Link
                  key={space.id}
                  href={space.settingsHref}
                  role="menuitem"
                  onClick={close}
                  className="flex items-center gap-2.5 rounded-xl px-2 py-2 transition-colors hover:bg-surface-elevated"
                >
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-elevated text-subtle"
                    aria-hidden
                  >
                    <Building2 className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-semibold text-text">{space.name}</span>
                      {space.isOwner && (
                        <Crown
                          className="h-3 w-3 shrink-0 text-primary-strong"
                          aria-label="You own this space"
                        />
                      )}
                    </span>
                    <span className="block truncate text-xs text-muted">
                      {spaceTypeLabel(space.type)}
                    </span>
                  </span>
                  <span className="shrink-0 rounded-full bg-surface-elevated px-2 py-0.5 text-2xs font-semibold text-muted">
                    {space.isOwner ? 'Owner' : 'Manager'}
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            // Empty state — the viewer manages no Spaces yet (E.3: "create your first Space").
            <div className="px-2 pb-2 pt-1">
              <p className="text-sm font-medium text-text">Create your first Space.</p>
              <p className="mt-0.5 text-xs text-muted">
                A Space is your own home for a practice, business, or organization.
              </p>
            </div>
          )}

          {/* Actions — always present: stand up a new Space, or browse the directory. */}
          <div className="mt-1 border-t border-border pt-1">
            <Link
              href="/spaces/new"
              role="menuitem"
              onClick={close}
              className="flex items-center gap-2.5 rounded-xl px-2 py-2 text-sm font-semibold text-text transition-colors hover:bg-surface-elevated"
            >
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-bg text-primary-strong"
                aria-hidden
              >
                <Plus className="h-4 w-4" />
              </span>
              New Space
            </Link>
            <Link
              href="/spaces"
              role="menuitem"
              onClick={close}
              className="flex items-center gap-2.5 rounded-xl px-2 py-2 text-sm font-medium text-text transition-colors hover:bg-surface-elevated"
            >
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-elevated text-subtle"
                aria-hidden
              >
                <Compass className="h-4 w-4" />
              </span>
              Browse directory
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}

/** The header launcher for entity / Space management. Desktop + tablet; the mobile drawer reaches the
 *  same surfaces through the rail, so this is hidden below md to keep the tight phone header clean. */
export function ManageMegaMenu() {
  return (
    <div className="hidden md:flex items-stretch">
      <ManageMegaMenuInner />
    </div>
  )
}
