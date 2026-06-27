'use client'

import { Settings } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { QrShareDropdown } from '@/components/qr/qr-share-dropdown'
import { meetsAccess } from '@/lib/nav-areas'
import { usePageAdmin } from '@/components/layout/page-admin-context'
import { isStaff } from '@/lib/core/roles'

// The on-page admin control (ADR-128 rebuild, Workstream D). It is now a thin TRIGGER
// row that sits on the divider under a page title. It no longer hosts the settings
// panel inline: the NON-share settings moved into the shell-level SettingsDrawer
// (opened here via the `open-settings` window event, D.6), and QR/Share split into the
// QrShareDropdown shown to ANY signed-in role on a shareable page (D.1).
//
// Three gates are preserved exactly:
//   • manager  = meetsAccess('host', role) || staffRole != null  → "Settings" button
//   • operator = isStaff(webRole)                                 → "Settings" button
//   • share    = isShareable(path)                                → "QR & Share" dropdown
// Each underlying surface still re-gates server-side; this row only decides which
// affordances appear.

// Entity detail routes that carry a slug segment (not the bare list route) — these are
// the shareable pages that get a QR/link kit.
const SHAREABLE_PREFIXES = [
  'events',
  'circles',
  'channels',
  'people',
  'hubs',
  'nexuses',
] as const

function isShareable(pathname: string): boolean {
  const m = pathname.match(/^\/([^/]+)\/([^/]+)/)
  if (!m) return false
  return (SHAREABLE_PREFIXES as readonly string[]).includes(m[1])
}

// Rendered by the page TEMPLATES in place of their header divider. With `asDivider`
// (the default for PageHeading) it DRAWS the hairline rule and puts the controls inline
// on it — one line, not two. Fed by PageAdminProvider (no per-template prop threading).
// When the viewer has nothing to do here it still draws the bare rule (asDivider) or
// nothing (legacy callers that own their own divider).
export function PageAdminBar({ asDivider = false }: { asDivider?: boolean } = {}) {
  const { role, staffRole, webRole } = usePageAdmin()
  const pathname = usePathname()

  // Two manager tiers feed the Settings drawer: page MANAGERS (host+ / staff — each
  // module re-gates server-side) and platform OPERATORS (web_role admin/janitor, who
  // get the page-level "Page" group on every page). Either unlocks the Settings button.
  const manager = meetsAccess('host', role) || staffRole != null
  const isOperator = isStaff(webRole)
  const shareable = isShareable(pathname)
  // Entity DETAIL pages render their OWN "Edit X" button in the header (which opens the same drawer
  // and is gated on entity OWNERSHIP, not this bar's community-role manager gate — so it shows for a
  // plain-member host/owner the gear would miss). Suppress this bar's duplicate Settings trigger
  // there so a page has exactly ONE settings button. QR & Share stays.
  const isEntityDetail = /^\/(circles|events|practices)\/[^/]+$/.test(pathname)
  // Member PROFILES (/people/<handle>) route their settings to the dedicated Settings RAIL
  // ("Edit profile" → /settings/profile for the owner; /admin/members for operators) and have NO
  // on-page drawer modules — so this trigger would open an EMPTY drawer. Suppress it; QR & Share stays.
  const isProfile = /^\/people\/[^/]+$/.test(pathname)

  // When acting AS the page's divider, always at least draw the rule; otherwise (a
  // legacy caller that owns its divider) render nothing when there is nothing to show.
  const bareRule = asDivider ? <div className="mb-5 border-b border-border sm:mb-6" /> : null
  if (!manager && !isOperator && !shareable) return bareRule

  // The Settings trigger — dispatches `open-settings`, which the shell-level
  // SettingsDrawer toggles (D.6). Shown to managers + operators.
  const settingsTrigger = (manager || isOperator) && !isEntityDetail && !isProfile ? (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event('open-settings'))}
      className="inline-flex shrink-0 items-center gap-1 rounded-md bg-canvas px-1.5 py-0.5 text-xs font-semibold text-muted transition-colors hover:text-text"
    >
      <Settings className="h-3.5 w-3.5" aria-hidden />
      Settings
    </button>
  ) : null

  // The QR & Share dropdown — shown to ANY signed-in role on a shareable page (D.1).
  // The per-role split (manager designer vs read-only kit) lives inside it.
  const shareControl = shareable ? <QrShareDropdown manager={manager} /> : null

  const controls = (
    <div className="flex shrink-0 items-center gap-2">
      {shareControl}
      {settingsTrigger}
    </div>
  )

  // As the page divider: the hairline rule fills the row and the controls sit INLINE
  // on it (one line, not two).
  if (asDivider) {
    return (
      <div className="mb-5 sm:mb-6">
        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-border" />
          {controls}
        </div>
      </div>
    )
  }

  // Legacy callers that own their own divider: the controls sit just under it,
  // right-aligned, with no rule of their own.
  return (
    <div className="-mt-3 mb-5 sm:mb-6">
      <div className="flex justify-end">{controls}</div>
    </div>
  )
}
