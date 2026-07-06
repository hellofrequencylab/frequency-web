// The Space-surface → sub-page href map. Lifted out of the /manage console (ADR-441 EM1-3) into this
// PURE module (no React, no server action) so BOTH the console (a Server Component) AND the standardized
// admin rail's Space link-rows (a client component, components/layout/settings-panel.tsx) can import it
// without dragging the console's server dependencies (deleteSpace, DangerDelete) into the client bundle.
//
// The console re-exports `hrefForSurface` from here, so its unit test (console.test.ts) and every existing
// caller are unchanged. See app/(main)/spaces/[slug]/manage/console.tsx.

import { PANEL_SURFACE_TO_ID, isPanelId } from '@/components/spaces/workspace/surface-panels'
import { spaceModuleById, type SpaceModule } from '@/lib/admin/modules/space-modules'

/** Map a Space surface id to the sub-page it opens, given the Space slug. Danger has no href (the console
 *  renders its delete control inline; the rail falls back to the /manage console); an unmapped id is
 *  skipped (defensive, should not happen).
 *
 *  EVERY href here must target a NON-redirecting sub-page. The /settings INDEX redirects every console
 *  type back to /manage (isConsoleSpaceType), so a section pointed at the bare index would loop
 *  /settings -> /manage -> the console. Basics therefore opens its own /settings/basics editor (the
 *  profile form), not the index. PURE, so the no-loop guarantee is unit-tested (console.test.ts). */
export function hrefForSurface(id: string, slug: string): string | null {
  const base = `/spaces/${slug}`
  switch (id) {
    case 'space.basics':
      // The dedicated basics editor, NOT the /settings index (which redirects console types to /manage,
      // looping "Open basics" straight back to this console).
      return `${base}/settings/basics`
    case 'space.branding':
      // Identity & Branding is a rail-inline section with no standalone page yet; the console links it to
      // the basics editor, which still carries those fields. Non-looping.
      return `${base}/settings/basics`
    case 'space.settings':
      // The lower Settings section (rating + visibility) is rail-inline; link the console card to the basics
      // editor, which still carries visibility. Non-looping.
      return `${base}/settings/basics`
    case 'space.mode':
      return `${base}/manage/mode`
    case 'space.layout':
      return `${base}/manage/layout`
    case 'space.offerings':
      // The ONE adaptive commerce surface (the deeper Offerings merge): it stacks whichever of
      // availability / memberships / donations / enrollment / tickets / check-in apply to this type.
      // No longer a rail row (the rail split into the seven independent surfaces below — ADR-544b), but
      // kept mapped: the adaptive page still exists and Mode next-best-actions still reference this id.
      return `${base}/settings/offerings`
    // The independent commerce surfaces (modular menu P1b, ADR-544b). The five that had a standalone
    // /settings/* redirect stub now deep-link straight to the unified Offerings surface anchored to their
    // section (ADR-552 Phase 4 deleted the stubs); Enrollment keeps its own /settings/enroll page. Store
    // is space.services below. Ids mirror the module catalog.
    case 'space.booking':
      return `${base}/settings/offerings#availability`
    case 'space.memberships':
      return `${base}/settings/offerings#memberships`
    case 'space.donations':
      return `${base}/settings/offerings#donations`
    case 'space.enroll':
      return `${base}/settings/enroll`
    case 'space.tickets':
      return `${base}/settings/offerings#tickets`
    case 'space.checkin':
      return `${base}/settings/offerings#checkin`
    case 'space.people':
      return `${base}/settings/members`
    case 'space.engage.crm':
      return `${base}/crm`
    case 'space.autonomy':
      // The Vera autonomy dial renders inline in the rail; its full home is the CRM cockpit page.
      return `${base}/crm`
    case 'space.pipeline':
      // The stage preview renders inline in the rail; its full editor is the CRM board's Pipeline view.
      return `${base}/crm?view=pipeline`
    case 'space.services':
      // The storefront services editor (item 10): CRUD the store items + their pricing + visibility.
      return `${base}/settings/services`
    case 'space.reach':
      return `${base}/settings/qr`
    case 'space.comms':
      return `${base}/settings/email`
    case 'space.insights':
      // Analytics live alongside the QR codes surface today (no standalone insights sub-page yet), but
      // Insights gets its OWN href anchored to the Scans section (ADR-520 P3) so it does NOT dedupe against
      // the QR codes bank button (they used to collapse to one) and both stay reachable.
      return `${base}/settings/qr#scans`
    case 'space.billing':
      return `${base}/settings/billing`
    case 'space.danger':
      return null
    default:
      return null
  }
}

/** The RAIL's Space-surface href: a surface that maps to an INLINE panel (PANEL_SURFACE_TO_ID) opens the
 *  Space page with `?panel=<id>` so it renders in the profile body (hero + menu persist — Stage D1),
 *  instead of navigating to its standalone route. Every other surface (incl. CRM) falls through to its
 *  normal full route via hrefForSurface, so the /manage console + the bottom bank are UNCHANGED (they keep
 *  importing hrefForSurface). Only the rail's Space link-rows call this. Nullable like hrefForSurface (a
 *  non-panel surface with no route — Danger — stays null so the caller's /manage fallback applies). */
export function panelHrefForSurface(id: string, slug: string): string | null {
  const panel = PANEL_SURFACE_TO_ID[id]
  if (panel) return `/spaces/${slug}?panel=${panel}`
  return hrefForSurface(id, slug)
}

/** A new-module id (lib/admin/modules/space-modules.ts) → the on-page inline panel it opens, keyed by
 *  PANEL id (the id the profile body renders — SURFACE_PANELS). Only the modules that have an on-page panel
 *  today appear here; every other module (the 7 split commerce services, Insights, Danger) has no entry and
 *  falls through to its `deepLink`. The legacy CRM surface id was `space.engage.crm`; the module id is
 *  `space.crm`, so this map re-anchors it to the same `crm` panel. Members / Store / QR / Email / Billing
 *  keep their existing panel ids. PURE. */
const MODULE_PANEL_ID: Record<string, string> = {
  'space.people': 'members', // Members
  'space.crm': 'crm', // CRM (the bounded board panel — legacy surface id was space.engage.crm)
  'space.services': 'services', // Store
  'space.reach': 'qr', // QR codes
  'space.comms': 'email', // Email
  'space.billing': 'billing', // Plan and usage
  // The six independent commerce service modules now open on-page too (P2, ADR-545): each maps to its own
  // service panel so the console + rail open the manager inline instead of deep-linking to /settings/*.
  'space.booking': 'booking', // Booking (availability)
  'space.memberships': 'memberships', // Memberships
  'space.donations': 'donations', // Donations
  'space.enroll': 'enroll', // Enrollment
  'space.tickets': 'tickets', // Tickets
  'space.checkin': 'checkin', // Check in
}

/** THE MANAGE-CONSOLE href for a P1 module (docs/MODULAR-MENU.md — P1): prefer the module's ON-PAGE panel
 *  when one exists (so the console keeps the Stage-D5 no-regression `?panel=` behavior), else fall through
 *  to the module's own deep-editing route (`deepLink`). Nullable like panelHrefForSurface: Danger has no
 *  panel and no deepLink, so it stays null (the caller renders its inline delete control instead). PURE, so
 *  the console's unit test can lock the no-regression mapping. */
export function panelHrefForModule(module: SpaceModule, slug: string): string | null {
  const panel = MODULE_PANEL_ID[module.id]
  if (panel && isPanelId(panel)) return `/spaces/${slug}?panel=${panel}`
  return module.deepLink ? module.deepLink(slug) : null
}

/** THE RAIL's Space link-row href by MODULE ID (modular menu P3b, ADR-546b). The standardized admin rail
 *  now resolves its Space rows from the module manifest (lib/apps/catalog.ts SPACE_EDITOR_APPS ← SPACE_MODULES),
 *  so a row carries the module id (`space.crm`, not the legacy surface id `space.engage.crm`). This looks the
 *  module up and delegates to `panelHrefForModule` (panel-first, deep-link fallback), so the rail keeps the
 *  Stage-D5 on-page `?panel=` behavior with no per-id special-casing. Nullable: Danger has no panel + no
 *  deepLink, so it stays null (the caller falls back to the /manage console); an unknown id is null. PURE. */
export function panelHrefForModuleId(id: string, slug: string): string | null {
  const mod = spaceModuleById(id)
  return mod ? panelHrefForModule(mod, slug) : null
}
