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
}

/** The panels a Space profile can render INLINE, keyed by panel id. D1 ships ONE: Members. CRM is never
 *  a panel (it stays full-width at its own route), so it is intentionally absent. */
export const SURFACE_PANELS: Record<string, SurfacePanel> = {
  members: {
    label: 'Members',
    fullHref: (slug) => `/spaces/${slug}/settings/members`,
  },
}

/** Whether an id is a known inline panel (the page guards on this before rendering the panel body). */
export function isPanelId(id: string | undefined): id is string {
  return id != null && Object.prototype.hasOwnProperty.call(SURFACE_PANELS, id)
}

/** Translate a SPACE_SURFACES id (what the admin rail knows) → a panel id (what the page renders). Only
 *  the surfaces that open inline appear here; every other surface (incl. CRM) has no entry, so the rail
 *  falls through to its normal full route. D1: only `space.people` (Members) is panel-ized. */
export const PANEL_SURFACE_TO_ID: Record<string, string> = {
  'space.people': 'members',
}
