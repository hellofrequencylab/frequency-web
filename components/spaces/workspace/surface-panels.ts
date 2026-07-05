// INLINE WORKSPACE — the panel registry (Stage D1). A Space profile edits ITS OWN surfaces on the
// page: the persistent hero + tab menu live in the (profile) route-group layout, and a `?panel=<id>`
// soft-navigation swaps ONLY the profile body (App Router layouts do not re-render on a query change),
// so the hero + menu (and their state) stay put — "everything edits on the page, never navigates away".
//
// This module is PURE + server-safe (no React, no server-only imports), so it can be shared by the
// Server-Component page/body AND the client admin rail (lib/spaces/surface-hrefs.ts → settings-panel).
//
// Adding a surface later is ONE row: register it in SURFACE_PANELS (keyed by its panel id) and, if the
// rail should open it inline, add its SPACE_SURFACES id → panel id here in PANEL_SURFACE_TO_ID.

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
  services: {
    label: 'Services',
    fullHref: (slug) => `/spaces/${slug}/settings/services`,
  },
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

/** Translate a SPACE_SURFACES id (what the admin rail knows) → a panel id (what the page renders). Only
 *  the surfaces that open inline appear here; every other surface (Insights shares the QR anchor, Danger has
 *  no route) has no entry, so the rail falls through to its normal full route. D1 panel-ized `space.people`
 *  (Members); D2 added the service managers; D5 adds `space.engage.crm` (the bounded CRM board). */
export const PANEL_SURFACE_TO_ID: Record<string, string> = {
  'space.people': 'members',
  'space.offerings': 'offerings',
  'space.services': 'services',
  'space.reach': 'qr',
  'space.comms': 'email',
  'space.billing': 'billing',
  'space.engage.crm': 'crm',
}
