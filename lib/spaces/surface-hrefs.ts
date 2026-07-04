// The Space-surface → sub-page href map. Lifted out of the /manage console (ADR-441 EM1-3) into this
// PURE module (no React, no server action) so BOTH the console (a Server Component) AND the standardized
// admin rail's Space link-rows (a client component, components/layout/settings-panel.tsx) can import it
// without dragging the console's server dependencies (deleteSpace, DangerDelete) into the client bundle.
//
// The console re-exports `hrefForSurface` from here, so its unit test (console.test.ts) and every existing
// caller are unchanged. See app/(main)/spaces/[slug]/manage/console.tsx.

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
    case 'space.mode':
      return `${base}/manage/mode`
    case 'space.layout':
      return `${base}/manage/layout`
    case 'space.offerings':
      // The ONE adaptive commerce surface (the deeper Offerings merge): it stacks whichever of
      // availability / memberships / donations / enrollment / tickets / check-in apply to this type.
      return `${base}/settings/offerings`
    case 'space.people':
      return `${base}/settings/members`
    case 'space.engage.crm':
      return `${base}/crm`
    case 'space.autonomy':
      // The Vera autonomy dial renders inline in the rail; its full home is the CRM cockpit page.
      return `${base}/crm`
    case 'space.services':
      // The storefront services editor (item 10): CRUD the store items + their pricing + visibility.
      return `${base}/settings/services`
    case 'space.reach':
      return `${base}/settings/qr`
    case 'space.comms':
      return `${base}/settings/email`
    case 'space.insights':
      // Analytics live alongside the QR codes surface today (no standalone insights sub-page yet).
      return `${base}/settings/qr`
    case 'space.billing':
      return `${base}/settings/billing`
    case 'space.danger':
      return null
    default:
      return null
  }
}
