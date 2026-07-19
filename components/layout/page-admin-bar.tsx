'use client'

import { Settings } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { QrShareDropdown } from '@/components/qr/qr-share-dropdown'
import { meetsAccess } from '@/lib/nav-areas'
import { usePageAdmin } from '@/components/layout/page-admin-context'
import { openAdminBar } from '@/components/admin/open-admin-bar'

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
  'circles',
  'channels',
  'hubs',
  'nexuses',
  // Entity detail pages that should share their OWN public code (their entity's image is supplied via
  // ShareImageProvider where the page wires it). Spaces and Events are intentionally NOT here: each
  // carries its own dedicated header share control (SpaceShareButton / EventShareButton — the entity's
  // code + link + attribution + native share), so the generic divider control would be a redundant
  // second share affordance sitting beside it. People (profiles) and Journeys are likewise NOT here:
  // both now carry their OWN "QR & Share" control in the header actions, so the divider control would
  // duplicate it.
  'practices',
  'programs',
  'partners',
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
  const { role, staffRole } = usePageAdmin()
  const pathname = usePathname()

  // ADMIN-RAIL.md Phase 4: the bar is now the site-wide settings menu — ANY signed-in viewer opens it
  // for their personal "You" settings (the personal App set makes its content non-empty everywhere).
  // `role` is null for a signed-out visitor (and for the janitor's view-as-visitor preview), so this
  // is fail-closed: no session ⇒ no bar. Managers/operators additionally get the management spine +
  // operator "Page" group inside the same menu (resolved by useSettingsPanel). The finer manager vs
  // operator split now lives entirely in useSettingsPanel; this trigger only asks "is there a session?"
  const authed = role != null
  const manager = meetsAccess('host', role) || staffRole != null
  const shareable = isShareable(pathname)
  // Entity DETAIL pages render their OWN "Edit X" / "Manage" button in the header (which opens the same
  // drawer and is gated on entity OWNERSHIP, not this bar's community-role manager gate — so it shows for
  // a plain-member host/owner the gear would miss). Suppress this bar's duplicate Settings trigger there
  // so a page has exactly ONE settings button. Covers every entity-detail leaf that mounts its own
  // OpenAdminBarButton: circles/events/practices plus the hub/nexus/channel/journey detail roots (each of
  // those pages now renders its own trigger, so the generic caps-blind cog would otherwise double up).
  // QR & Share stays.
  const isEntityDetail = /^\/(circles|events|practices|hubs|nexuses|channels|journeys)\/[^/]+$/.test(pathname)
  // Member PROFILES (/people/<handle>) route their settings to the dedicated Settings RAIL
  // ("Edit profile" → /settings/profile for the owner; /admin/members for operators) and have NO
  // on-page drawer modules — so this trigger would open an EMPTY drawer. Suppress it; QR & Share stays.
  const isProfile = /^\/people\/[^/]+$/.test(pathname)
  // SPACE PROFILES (/spaces/<slug> + its (profile) children: custom pages, /book) own their settings
  // through the single owner "Customize" button in the identity row, which now opens the STANDARDIZED
  // admin bar (openAdminBar, pointed at the Space scope — ENTITY-MANAGEMENT / PR C), not the retired
  // bespoke customize drawer. This shell cog stays suppressed there so a space has exactly ONE customize
  // control. The owner console routes (manage / settings / crm / edit-page) are NOT profile routes and
  // keep theirs.
  const isSpaceProfile =
    /^\/spaces\/[^/]+/.test(pathname) && !/^\/spaces\/[^/]+\/(manage|settings|crm|edit-page)(\/|$)/.test(pathname)

  // Space profiles draw their OWN hairline ABOVE the nav menu and want NO line UNDER it (owner
  // directive), so this shell divider is suppressed there entirely — no rule, no controls. (This
  // returns before the settingsTrigger below, so that trigger never renders on a Space profile.)
  // It still owns the GAP between the space menu and the first content block: a rule-less spacer at
  // DOUBLE the standard divider gap (the shell divider is mb-5 sm:mb-6; this is 2x), so space pages
  // breathe under the menu without reintroducing a line. Token spacing only, no hardcoded values.
  if (isSpaceProfile) return <div className="h-10 sm:h-12" aria-hidden />

  // Journey pages (/journeys/<slug> and /journeys/<slug>/learn) want NO hairline rule under the header
  // at all (owner directive) — the header carries its own "QR & Share" control, so the divider's rule +
  // share link would both be redundant. Mirror the Space-profile treatment: a rule-less spacer that owns
  // the gap under the header without drawing a line. Token spacing only.
  if (/^\/journeys\/[^/]+/.test(pathname)) return <div className="h-8 sm:h-10" aria-hidden />

  // When acting AS the page's divider, always at least draw the rule; otherwise (a
  // legacy caller that owns its divider) render nothing when there is nothing to show.
  const bareRule = asDivider ? <div className="mb-5 border-b border-border sm:mb-6" /> : null
  if (!authed && !shareable) return bareRule

  // The Settings trigger — opens the shell-level admin bar via the typed `open-admin-bar` event
  // (docs/ADMIN-RAIL.md Phase 1), with no pre-scoped detail so the panel resolves this page's scope
  // caps-blind exactly as before. Shown to ANY signed-in viewer (Phase 4). Still suppressed on the
  // surfaces that mount their OWN settings entry into the same drawer — entity-detail leaves (their
  // "Edit X" button), member profiles (the profile rail), and Space profiles (the Customize button) —
  // so a page never shows two settings triggers; the "You" section is reached from that button there.
  // (Space profiles already returned null above, so they need no guard here.)
  // Also suppressed on SHAREABLE pages: those carry the "QR & Share" control (and their own
  // "Edit details" / Manage button), so the generic Settings link sitting beside it was redundant.
  // It stays on non-shareable pages, which have no other way into the "You" settings menu.
  const settingsTrigger = authed && !shareable && !isEntityDetail && !isProfile ? (
    <button
      type="button"
      onClick={() => openAdminBar()}
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
