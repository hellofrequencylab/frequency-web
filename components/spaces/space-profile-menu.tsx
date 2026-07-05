'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { ChevronDown, ArrowUpRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SURFACE_PANELS, isPanelId } from '@/components/spaces/workspace/surface-panels'
import type { SpaceProfileTab } from '@/components/spaces/space-profile-tabs'

// THE PERSISTENT SPACE MENU + INLINE FOLD-OUT. Rendered as a direct child of the profile page root
// (DetailTemplate's `stickyNav` slot), so the menu bar pins under the global header and stays in view
// for the whole scroll, and the fold-out sits directly beneath it as page content.
//
// The page + anchor tabs are Links (soft-nav; active via usePathname). The operator's Manage / CRM are
// NOT links here: each is a TOGGLE that slides open a compact panel UNDER the menu on the SAME page (no
// navigation), revealing the manager or a CRM snapshot. The panel is intentionally CRAMPED (a capped,
// scrollable height) so it reads as a quick in-place preview and nudges the operator toward the full
// workspace / their own website. The heavy surfaces are server-rendered and handed in as `manageNode` /
// `crmNode`; they are owner-gated upstream (a visitor gets neither, so no toggles show).
type Panel = 'manage' | 'crm'

export function SpaceProfileMenu({
  tabs,
  manageNode = null,
  crmNode = null,
}: {
  tabs: SpaceProfileTab[]
  /** The manager console, server-rendered; present only for a manager. */
  manageNode?: React.ReactNode
  /** The compact CRM snapshot, server-rendered; present only for a manager of a CRM-capable space. */
  crmNode?: React.ReactNode
}) {
  const pathname = usePathname()
  const [open, setOpen] = useState<Panel | null>(null)

  // The open inline WORKSPACE panel (Stage D4). A `?panel=<id>` soft-nav swaps only the profile body while
  // this menu stays put, so the operator is on a workspace surface — NOT viewing Home — yet the pathname is
  // still the index. Read the query so the menu reflects that: Home drops its active styling and a small
  // "you are editing" affordance names the open surface. Only an owner ever renders a live panel, so gate on
  // an admin control being present (a visitor's stray `?panel` is ignored and Home stays active for them).
  const searchParams = useSearchParams()
  const isOwner = manageNode != null || crmNode != null
  const rawPanel = searchParams.get('panel') ?? undefined
  const openPanelLabel = isOwner && isPanelId(rawPanel) ? SURFACE_PANELS[rawPanel].label : null

  const indexHref = tabs[0]?.href
  const isActive = (tab: SpaceProfileTab): boolean => {
    if (tab.href.includes('#')) return false
    // Home is the index route; when a workspace panel is open the operator is on that surface, so Home must
    // not read as active even though the pathname is unchanged.
    if (tab.href === indexHref) return pathname === tab.href && openPanelLabel == null
    return pathname === tab.href || pathname.startsWith(`${tab.href}/`)
  }

  const itemClasses = (active: boolean) =>
    cn(
      'whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
      active ? 'bg-primary-bg text-primary-strong' : 'text-muted hover:bg-surface-elevated hover:text-text',
    )

  const toggle = (panel: Panel) => setOpen((cur) => (cur === panel ? null : panel))

  const admin: { panel: Panel; label: string; node: React.ReactNode; full: string }[] = [
    manageNode ? { panel: 'manage' as const, label: 'Manage', node: manageNode, full: `${indexHref}/manage` } : null,
    crmNode ? { panel: 'crm' as const, label: 'CRM', node: crmNode, full: `${indexHref}/crm` } : null,
  ].filter(Boolean) as { panel: Panel; label: string; node: React.ReactNode; full: string }[]

  return (
    <>
      {/* The menu bar: pinned under the global header. A rule ABOVE it, and NONE under it (per design),
          over an opaque canvas backdrop so content scrolls cleanly beneath. */}
      <div className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-20 border-t border-border bg-canvas/95 backdrop-blur-sm">
        <nav className="flex items-center gap-1 overflow-x-auto py-2">
          {tabs.map((tab) => {
            const active = isActive(tab)
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={itemClasses(active)}
              >
                {tab.label}
              </Link>
            )
          })}
          {admin.length > 0 && (
            <span className="ml-auto flex items-center gap-1 border-l border-border pl-2">
              {admin.map((a) => {
                const isOpen = open === a.panel
                return (
                  <button
                    key={a.panel}
                    type="button"
                    onClick={() => toggle(a.panel)}
                    aria-expanded={isOpen}
                    className={cn(itemClasses(isOpen), 'inline-flex items-center gap-1')}
                  >
                    {a.label}
                    <ChevronDown
                      className={cn('h-3.5 w-3.5 transition-transform motion-reduce:transition-none', isOpen && 'rotate-180')}
                      aria-hidden
                    />
                  </button>
                )
              })}
            </span>
          )}
        </nav>
      </div>

      {/* The open-panel affordance (Stage D4): when a `?panel=<id>` workspace surface is open, name it right
          under the menu so the current surface stays legible (Home no longer reads active). aria-current marks
          it as the location the operator is on. Owner-gated (openPanelLabel is null otherwise). */}
      {openPanelLabel && (
        <div className="flex items-center gap-2 py-2 text-sm">
          <span className="text-muted">You are editing</span>
          <span
            aria-current="page"
            className="inline-flex items-center rounded-lg bg-primary-bg px-2.5 py-1 font-medium text-primary-strong"
          >
            {openPanelLabel}
          </span>
        </div>
      )}

      {/* The slide-open fold-out: a capped, scrollable, intentionally CRAMPED reveal directly under the
          menu, on the same page. Both nodes stay mounted (owner-only) so opening/closing animates via a
          max-height transition; only the open one expands. A footer nudges toward the full workspace. */}
      {admin.map((a) => {
        const isOpen = open === a.panel
        return (
          <div
            key={a.panel}
            className={cn(
              'overflow-hidden transition-[max-height] duration-300 ease-in-out motion-reduce:transition-none',
              isOpen ? 'max-h-[30rem] border-b border-border' : 'max-h-0',
            )}
            aria-hidden={!isOpen}
          >
            <div className="relative max-h-[26rem] overflow-y-auto px-0.5 py-4">
              {a.node}
            </div>
            <FoldOutFooter label={a.label} href={a.full} />
          </div>
        )
      })}
    </>
  )
}

// The cramped-preview footer: a quiet nudge that this is a quick in-place view, with the door to the
// full surface. The tight panel above plus this line inspire the operator toward the full workspace /
// their own website. Plain voice, no em dashes.
function FoldOutFooter({ label, href }: { label: string; href: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-surface px-4 py-2.5">
      <p className="text-xs text-muted">A quick in-place view. Your full website gives every tool room to breathe.</p>
      <Link
        href={href}
        className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold text-primary-strong transition-colors hover:bg-primary-bg"
      >
        Open full {label}
        <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
      </Link>
    </div>
  )
}
