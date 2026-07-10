// INLINE WORKSPACE — the panel registry (Stage D1). A Space profile edits ITS OWN surfaces on the
// page: the persistent hero + tab menu live in the (profile) route-group layout, and a `?panel=<id>`
// soft-navigation swaps ONLY the profile body (App Router layouts do not re-render on a query change),
// so the hero + menu (and their state) stay put — "everything edits on the page, never navigates away".
//
// This module is PURE + server-safe (no React, no server-only imports), so it can be shared by the
// Server-Component page/body AND the client admin rail (lib/spaces/surface-hrefs.ts → settings-panel).
//
// Adding a surface later is ONE row: register it in SURFACE_PANELS (keyed by its panel id) and, if the
// rail should open it inline, add its space surface id → panel id here in PANEL_SURFACE_TO_ID.

/** One inline panel: the member-facing label (its heading) + the standalone "full page" route it maps
 *  to (the same full-admin sub-page the console + deep links keep using). */
export interface SurfacePanel {
  label: string
  /** The standalone route this panel mirrors — the "Open full page" escape hatch + the deep link. */
  fullHref: (slug: string) => string
  /** BOUNDED panel (Stage D5): the surface is wide / horizontally scrolling (e.g. the CRM board), so the
   *  panel body wraps it in an `overflow-x-auto` container to horizontal-scroll WITHIN the panel instead
   *  of breaking out full-screen. Omitted (falsy) for the narrow service managers. */
  bounded?: boolean
}

/** The panels a Space profile can render INLINE, keyed by panel id. D1 shipped Members; D2 added the
 *  remaining service managers (Offerings, Services, QR codes, Email, Plan and usage); D5 adds CRM as a
 *  BOUNDED panel (the wide board horizontal-scrolls WITHIN the panel; its "Open full page" link covers the
 *  full-width route + the deep ?contact= / ?stage= sub-views). Insights (shares the QR route/anchor) and
 *  Danger (no route) stay absent. This registry stays PURE (label + fullHref + bounded flag only); the
 *  panel BODY components are dispatched in space-body-panel.tsx (a Server Component), so no server-only
 *  body import ever leaks into the client bundle that imports PANEL_SURFACE_TO_ID. */
export const SURFACE_PANELS: Record<string, SurfacePanel> = {
  members: {
    label: 'Members',
    fullHref: (slug) => `/spaces/${slug}/settings/members`,
  },
  offerings: {
    label: 'Offerings',
    fullHref: (slug) => `/spaces/${slug}/settings/offerings`,
  },
  // The six INDEPENDENT commerce service panels (modular menu P2, ADR-545): each opens its chrome-free
  // manager INLINE, matching Members/Store/QR/Email/Billing. Labels come from the module catalog
  // (lib/admin/modules/space-modules.ts). "Open full page" targets the same /settings/* route the module
  // deep-links to (which lands on the unified Offerings surface anchored to this section). Narrow managers,
  // so no `bounded` flag.
  booking: {
    label: 'Booking',
    fullHref: (slug) => `/spaces/${slug}/settings/offerings#availability`,
  },
  memberships: {
    label: 'Memberships',
    fullHref: (slug) => `/spaces/${slug}/settings/offerings#memberships`,
  },
  donations: {
    label: 'Donations',
    fullHref: (slug) => `/spaces/${slug}/settings/offerings#donations`,
  },
  enroll: {
    label: 'Enrollment',
    fullHref: (slug) => `/spaces/${slug}/settings/enroll`,
  },
  tickets: {
    label: 'Tickets',
    fullHref: (slug) => `/spaces/${slug}/settings/offerings#tickets`,
  },
  checkin: {
    label: 'Check in',
    fullHref: (slug) => `/spaces/${slug}/settings/offerings#checkin`,
  },
  // 'services' (the retired JSON Store) panel removed (ADR-596, Phase 9): the Store became the Shop
  // console at /settings/shop. space.services now deep-links there (no inline panel), so closing this
  // inline path prevents reaching the dead JSON editor and split-braining the catalog.
  qr: {
    label: 'QR codes',
    fullHref: (slug) => `/spaces/${slug}/settings/qr`,
  },
  email: {
    label: 'Email',
    fullHref: (slug) => `/spaces/${slug}/settings/email`,
  },
  billing: {
    label: 'Plan and usage',
    fullHref: (slug) => `/spaces/${slug}/settings/billing`,
  },
  crm: {
    label: 'CRM',
    fullHref: (slug) => `/spaces/${slug}/crm`,
    // The CRM board is wide / horizontally scrolling; keep it bounded inside the panel (Stage D5).
    bounded: true,
  },
}

/** Whether an id is a known inline panel (the page guards on this before rendering the panel body). */
export function isPanelId(id: string | undefined): id is string {
  return id != null && Object.prototype.hasOwnProperty.call(SURFACE_PANELS, id)
}

/** Translate a space surface id (what the admin rail knows) → a panel id (what the page renders). Only
 *  the surfaces that open inline appear here; every other surface (Insights shares the QR anchor, Danger has
 *  no route) has no entry, so the rail falls through to its normal full route. D1 panel-ized `space.people`
 *  (Members); D2 added the service managers; D5 adds the bounded CRM board, keyed by the module id `space.crm`. */
export const PANEL_SURFACE_TO_ID: Record<string, string> = {
  'space.people': 'members',
  'space.offerings': 'offerings',
  // 'space.services' now deep-links to the Shop console (no inline panel) — Phase 9, ADR-596.
  'space.reach': 'qr',
  'space.comms': 'email',
  'space.billing': 'billing',
  'space.crm': 'crm',
  // The seven independent commerce surfaces (ADR-544b split) now open INLINE too (P2, ADR-545): Store
  // (space.services) already mapped above; these six map each to its own service panel so the rail row
  // renders the manager in the profile body instead of deep-linking to /settings/*.
  'space.booking': 'booking',
  'space.memberships': 'memberships',
  'space.donations': 'donations',
  'space.enroll': 'enroll',
  'space.tickets': 'tickets',
  'space.checkin': 'checkin',
}
