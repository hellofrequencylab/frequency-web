import { describe, it, expect } from 'vitest'
import {
  railFor,
  leftRailFor,
  adminScopeFor,
  railArchetypeFor,
  isFullWidthEditor,
  isFullViewportEditor,
  mergeChrome,
  isSafeRoute,
  MANAGED_ROUTES,
} from './page-chrome'

describe('railFor — the single source of truth for page chrome', () => {
  it('keeps the global rail on browse / stream / index pages', () => {
    for (const p of [
      '/feed',
      '/circles',
      '/channels',
      '/events',
      '/people',
      '/people/ada', // profiles intentionally use the global rail
      '/circles/sunrise-sit', // circle detail uses the global community rail (like events)
      // NOTE: /channels/<slug> is deliberately absent — it is the ONE 'scoped' surface now
      // (it renders its own in-body rail). See the dedicated test below.
      '/settings/profile', // the profile editor keeps the rail (ADR-117), unlike other /settings
      '/friends',
      '/messages', // the inbox keeps the rail
      '/connections', // the index keeps the rail
      '/practices',
      '/journeys',
      // Journey routes ride the global rail after the v2 rebuild (ADR-252): the old
      // scoped course-player is retired, so detail/learn/edit keep the standard rail.
      '/journeys/tune-in-b3fnjh',
      '/journeys/tune-in-b3fnjh/learn',
      '/journeys/tune-in-b3fnjh/edit',
      '/partners',
      '/broadcast',
      '/search',
      '/crew',
      // Operator / steward DASHBOARDS keep the uniform slim stats rail like the rest
      // of the app (page-chrome.ts §FOCUS_PREFIXES note — a consistent right column
      // site-wide; the rail is a thin strip, so no double-rail cost). The /admin/*
      // workspace is the exception (full-width, no rail — see its own test below).
      '/outreach',
    ]) {
      expect(railFor(p), p).toBe('global')
    }
  })

  it('keeps the global rail on the Channel detail page too — nothing is scoped (owner reversal, 2026-07-28)', () => {
    // HISTORY, because this expectation flipped twice in one night and the next reader deserves
    // the story. The Channel redesign (ADR-885) briefly scoped /channels/<slug>, reading "give it
    // a right column" as replacing the member rail with the Channel's own. The owner saw it live
    // and corrected it within hours: "You dropped the right rail of the website. Fix that." So
    // the 2026-06-20 directive — the right rail shows on EVERY page — is back to universal. The
    // Channel's activity/upcoming/Circles column survives IN-BODY (DetailTemplate's `sidebar`
    // slot, inside the content area); the shell rail renders beside it. Page facts and site
    // chrome are different things and both belong on screen.
    expect(railFor('/channels/breathwork')).toBe('global')
    expect(railFor('/channels/meld-community-cowork')).toBe('global')
    // A UUID id resolves the same as a slug (the route accepts either).
    expect(railFor('/channels/3f6b2c1a-0000-4000-8000-000000000000')).toBe('global')

    // The INDEX is not a detail page — it keeps the global community rail.
    expect(railFor('/channels')).toBe('global')

    // The Channel's deeper surfaces were never scoped and stay global.
    expect(railFor('/channels/breathwork/manage')).toBe('global')
    expect(railFor('/channels/breathwork/edit')).toBe('global')
    // Any future sub-route inherits the same safe default.
    expect(railFor('/channels/breathwork/manage/circles')).toBe('global')

    // Circles are untouched: circle detail folds its scope content into the main column and
    // keeps the global rail.
    expect(railFor('/circles/sunrise-sit')).toBe('global')
    expect(railFor('/circles')).toBe('global')
  })

  it('keeps the global rail on compose / edit / settings / thread surfaces (owner directive: every page has the right rail)', () => {
    // The right rail now shows site-wide (owner directive, 2026-06-20): the old "Focus
    // surfaces drop the rail" model is retired. Settings, codes, upgrade, compose/edit
    // forms, the event Invite, message threads and the contact book all keep the GLOBAL
    // community rail beside their (still centered) body. Only the genuine full-viewport
    // takeovers and the /admin/* workspace drop it (asserted below).
    for (const p of [
      '/settings',
      '/settings/account',
      '/codes',
      '/upgrade',
      '/g/abc123',
      '/n/node-7',
      '/events/new',
      '/practices/42/edit',
      '/connections/new',
      '/connections/c_123',
      '/messages/r_9', // a thread
      '/messages/r/room-1', // a room thread
    ]) {
      expect(railFor(p), p).toBe('global')
    }
  })

  it('drops the rail ONLY on the full-viewport takeovers (zero app chrome)', () => {
    // The four genuine takeovers read with no app chrome at all: the practice timer, the
    // camera scanner, the auth gate, and the print sheet. These are the only member-side
    // routes without the right rail (the /admin/* workspace is the separate exception,
    // tested below — it mounts its own info rail).
    for (const p of [
      '/on-air',
      '/on-air/breathe',
      '/scan',
      '/sign-in',
      '/print',
      '/print/qr',
    ]) {
      expect(railFor(p), p).toBe('none')
    }
  })

  it('frames every entity-space route — directory, profiles, wizard AND owner settings — with the GLOBAL rail', () => {
    // The member directory (/spaces/directory) is an Index page — it keeps the global community rail.
    expect(railFor('/spaces/directory')).toBe('global')
    // A profile (/spaces/<slug>) and its tabs ride the GLOBAL community rail like the rest of the
    // app (operator request): the context band is an in-body hero card, not a shell rail, so there
    // is no double-rail trap. Nothing is 'scoped' anymore.
    expect(railFor('/spaces/demo-practitioner')).toBe('global')
    expect(railFor('/spaces/demo-practitioner/offerings')).toBe('global')
    expect(railFor('/spaces/demo-practitioner/practices')).toBe('global')
    expect(railFor('/spaces/demo-practitioner/community')).toBe('global')
    expect(railFor('/spaces/demo-practitioner/book')).toBe('global')
    // The provisioning wizard + the owner settings surfaces ALSO keep the global rail now (owner
    // directive, 2026-06-20: the right rail shows on every page). They still compose a centered
    // FocusTemplate body — the rail simply sits beside it.
    expect(railFor('/spaces/new')).toBe('global')
    expect(railFor('/spaces/demo-practitioner/settings')).toBe('global')
    // The unified Offerings surface (the deeper Offerings merge, now the ONE commerce sub-page after
    // ADR-552 Phase 4 deleted the per-service redirect stubs) is a centered Focus body that keeps the
    // global rail beside it, like its sibling settings sub-pages.
    expect(railFor('/spaces/demo-practitioner/settings/offerings')).toBe('global')
    expect(railFor('/spaces/demo-practitioner/settings/members')).toBe('global')
    expect(railFor('/spaces/demo-practitioner/settings/qr')).toBe('global')
    expect(railFor('/spaces/demo-business/settings/email')).toBe('global')
  })

  it('ALWAYS keeps the global rail on the event detail page (and every events route)', () => {
    // The global community rail is a fixed part of the member chrome. The event detail
    // page keeps it like every other member surface — a doubled-column feeling is fixed
    // by making the page's own interior templated, never by dropping the rail.
    expect(railFor('/events/sunrise-sit')).toBe('global')
    expect(railFor('/events/some-slug')).toBe('global')
    expect(railFor('/events')).toBe('global')
    expect(railFor('/events/new')).toBe('global')
    expect(railFor('/events/scan')).toBe('global')
    expect(railFor('/events/drafts')).toBe('global')
    expect(railFor('/events/sunrise-sit/event.ics')).toBe('global')
    expect(railFor('/events/sunrise-sit/manage')).toBe('global')
  })

  it('keeps the global rail on the Pages workspace and its sub-managers (owner directive: not the /admin workspace)', () => {
    // /pages is a member-accessible operator MANAGER (a list of pages to open + edit), not the
    // /admin workspace with its own info rail, so it keeps the GLOBAL community rail like every
    // other member surface (owner directive, 2026-06-20). Only /admin/* and the takeovers drop it.
    expect(railFor('/pages')).toBe('global')
    expect(railFor('/pages/home')).toBe('global')
    expect(railFor('/pages/splash')).toBe('global')
    expect(railFor('/pages/sequences')).toBe('global')
    expect(railFor('/pages/sequences/come-home')).toBe('global')
  })
})

describe('leftRailFor — the global member left rail vs. the admin workspace', () => {
  it('keeps the member left rail everywhere outside the admin workspace', () => {
    for (const p of [
      '/feed',
      '/circles',
      '/channels',
      '/events',
      '/crew',
      '/settings',
      '/outreach',
      '/administrators', // a non-admin path that merely shares the prefix text
    ]) {
      expect(leftRailFor(p), p).toBe('global')
    }
  })

  it('keeps the global member left rail (the one site menu) under /admin/*', () => {
    for (const p of [
      '/admin',
      '/admin/programs',
      '/admin/operations',
      '/admin/growth',
      '/admin/circles',
      '/admin/qr',
      '/admin/members',
      '/admin/crm',
      '/admin/marketing',
      '/admin/marketing/analytics',
    ]) {
      expect(leftRailFor(p), p).toBe('global')
    }
  })

  it('drops only the RIGHT member rail in the admin workspace (the left menu stays)', () => {
    // The admin workspace rides the same left menu as the rest of the site; only the
    // member community RIGHT rail is suppressed (the admin info rail owns the right).
    for (const p of [
      '/admin',
      '/admin/programs',
      '/admin/circles',
      '/admin/members',
      '/admin/crm',
      '/admin/marketing',
      '/admin/marketing/analytics',
    ]) {
      expect(railFor(p), p).toBe('none')
      expect(leftRailFor(p), p).toBe('global')
    }
    // A non-admin path that merely shares the prefix text keeps the global rails.
    expect(railFor('/administrators')).toBe('global')
  })

  it('keeps the global rail on the entity owner consoles AND the Space CRM board', () => {
    // ADR-471 (owner directive: "the right rail shows on every page"): the entity OWNER CONSOLES
    // (/{entity}/[id]/manage, ADR-441/469) are a vertical GRID of section cards, not a horizontal
    // board, so they read correctly beside the community rail and ride the global rail like every
    // other member surface (the rail fills what was an empty right gutter). The Space CRM board now
    // keeps the rail too (owner directive, 2026-07): its default views are vertical and its Pipeline
    // scrolls horizontally within its own column.
    expect(railFor('/circles/sunrise-sit/manage')).toBe('global')
    expect(railFor('/spaces/demo-practitioner/manage')).toBe('global')
    expect(railFor('/spaces/demo-org/manage')).toBe('global')
    expect(railFor('/spaces/demo-practitioner/crm')).toBe('global')
    // The left menu stays on these member-side dashboards.
    expect(leftRailFor('/spaces/demo-practitioner/manage')).toBe('global')
    // The Space SETTINGS cockpit (the legacy 7-tab) keeps the global rail too.
    expect(railFor('/spaces/demo-practitioner/settings')).toBe('global')
  })
})

describe('adminScopeFor — the single admin-scope resolver (LP4 step B0)', () => {
  it('resolves each entity-detail prefix to its scope kind + id (the URL slug)', () => {
    expect(adminScopeFor('/circles/sunrise-sit')).toEqual({ kind: 'circle', id: 'sunrise-sit' })
    expect(adminScopeFor('/hubs/north')).toEqual({ kind: 'hub', id: 'north' })
    expect(adminScopeFor('/nexuses/west')).toEqual({ kind: 'nexus', id: 'west' })
    expect(adminScopeFor('/events/sunrise-sit')).toEqual({ kind: 'event', id: 'sunrise-sit' })
    expect(adminScopeFor('/practices/42')).toEqual({ kind: 'practice', id: '42' })
    expect(adminScopeFor('/channels/breathwork')).toEqual({ kind: 'channel', id: 'breathwork' })
    expect(adminScopeFor('/people/ada')).toEqual({ kind: 'profile', id: 'ada' })
  })

  it('keeps the entity scope on deeper entity sub-routes (prefix, not end-anchored)', () => {
    expect(adminScopeFor('/circles/sunrise-sit/manage')).toEqual({ kind: 'circle', id: 'sunrise-sit' })
    expect(adminScopeFor('/events/sunrise-sit/manage')).toEqual({ kind: 'event', id: 'sunrise-sit' })
  })

  it('returns the operator global scope on non-entity in-app pages (incl. entity LIST routes)', () => {
    for (const p of ['/feed', '/circles', '/events', '/admin', '/admin/menu', '/lead', '/settings', '/pages']) {
      expect(adminScopeFor(p), p).toEqual({ kind: 'global' })
    }
  })

  it('returns null on the full-viewport takeovers (nothing to manage)', () => {
    for (const p of ['/on-air', '/on-air/breathe', '/scan', '/sign-in', '/print', '/print/qr']) {
      expect(adminScopeFor(p), p).toBeNull()
    }
  })
})

describe('railArchetypeFor — the rail SHAPE axis (ADR-516 Phase B)', () => {
  it('marks profile + space profile-root pages as `builder` (the page identity paints)', () => {
    for (const p of [
      '/people/ada',
      '/people/ada/profile-preview',
      '/people/ada/profile-preview/edit',
      '/spaces/demo-practitioner', // the Space profile ROOT
    ]) {
      expect(railArchetypeFor(p), p).toBe('builder')
    }
  })

  it('marks the settings indexes (member + Space) and generic content pages as `hub`', () => {
    for (const p of [
      '/settings',
      '/settings/appearance',
      '/settings/notifications',
      '/settings/connections',
      '/settings/account',
      '/settings/billing',
      '/settings/profile', // the profile editor page — the rail is the Hub, not a second ProfileForm (fix C)
      '/spaces/demo-practitioner/settings',
      '/spaces/demo-practitioner/settings/basics',
      '/spaces/demo-practitioner/manage',
      '/spaces/demo-practitioner/manage/mode',
      // Generic content pages (not an entity detail) default to the Hub, not the inline personal editor.
      '/feed',
      '/circles', // an index
      '/people', // the people index (no handle)
      '/messages',
    ]) {
      expect(railArchetypeFor(p), p).toBe('hub')
    }
  })

  it('marks entity-detail scopes (and Space non-root subpaths) as `manage`', () => {
    for (const p of [
      '/circles/sunrise-sit',
      '/circles/sunrise-sit/manage',
      '/events/sunrise-sit',
      '/hubs/north',
      '/nexuses/west',
      '/practices/42',
      '/channels/breathwork',
      '/journeys/tune-in',
      '/spaces/demo-practitioner/crm', // a Space subpath (NOT the profile root, NOT settings/manage)
      '/spaces/demo-practitioner/offerings', // a Space profile TAB
    ]) {
      expect(railArchetypeFor(p), p).toBe('manage')
    }
  })
})

describe('full-width editors — fullscreen builder, main header KEPT (ADR-508 U4-A)', () => {
  // The marketing page editor (/edit/<slug>) and the Space landing editor (/spaces/<slug>/edit-page)
  // fill the whole content width — both rails drop — but the site header stays (owner directive). So
  // they are full-WIDTH (isFullWidthEditor) but NOT full-VIEWPORT takeovers (which also hide the header).
  it('marks the marketing + space editors as full-width, header-keeping', () => {
    for (const p of ['/edit/home', '/edit/spaces', '/spaces/demo-practitioner/edit-page']) {
      expect(isFullWidthEditor(p), p).toBe(true)
      expect(isFullViewportEditor(p), p).toBe(false) // header is NOT hidden
      expect(railFor(p), p).toBe('none') // both rails dropped
    }
  })

  it('does not treat a normal page as a full-width editor', () => {
    for (const p of ['/edit', '/feed', '/spaces/demo-practitioner', '/pages']) {
      expect(isFullWidthEditor(p), p).toBe(false)
    }
  })

  it('no longer treats the retired Spotlight editor route as an editor takeover (ADR-522)', () => {
    // The Puck Spotlight editor is retired: /settings/profile/spotlight now redirects to the in-rail grid
    // builder and keeps the standard global rail, so it is neither a full-viewport nor a full-width editor.
    expect(isFullViewportEditor('/settings/profile/spotlight')).toBe(false)
    expect(isFullWidthEditor('/settings/profile/spotlight')).toBe(false)
    expect(railFor('/settings/profile/spotlight')).toBe('global')
  })
})

// ── mergeChrome + the MANAGED_ROUTES catalog ────────────────────────────────────────────────────
// Fan-out finding 10.13: six of 36 catalog rows were INERT. Three pointed at redirect stubs
// (/people, /connections, /friends), and three used a `_` slug placeholder against an exact-key
// lookup — so the operator reframed a surface, the row confirmed "Saved", and nothing changed.
//
// The class of bug matters more than the six rows. NOTHING here asserted that a catalog row was
// matchable by mergeChrome AT ALL, so a row could rot the moment a route moved and no test would
// notice. These cover the mechanism and the catalog's own integrity, in that order.

describe('mergeChrome — exact keys, then catalog patterns, then the code default', () => {
  it('falls through to the code default when no override exists', () => {
    expect(mergeChrome('global', {}, '/feed')).toBe('global')
    expect(mergeChrome('none', {}, '/admin')).toBe('none')
  })

  it('lets an exact-route override win over the code default', () => {
    expect(mergeChrome('global', { '/feed': 'none' }, '/feed')).toBe('none')
  })

  it('ignores a stored value that is not a Rail rather than rendering it', () => {
    // The override map is DB-shaped, so a stale/hand-edited row can hold anything. A junk value
    // must degrade to the code default, never reach the shell as a class name.
    expect(mergeChrome('global', { '/feed': 'sidebar' as never }, '/feed')).toBe('global')
    expect(mergeChrome('global', { '/feed': '' as never }, '/feed')).toBe('global')
  })

  // The defect itself: one saved row must frame the surface for EVERY Space.
  it('applies a `_` placeholder row to a real slug, which is the whole of finding 10.13', () => {
    const overrides = { '/spaces/_/crm': 'none' as const }
    expect(mergeChrome('global', overrides, '/spaces/acme/crm')).toBe('none')
    expect(mergeChrome('global', overrides, '/spaces/some-other-space/crm')).toBe('none')
  })

  it('applies the two console Focus rows the same way', () => {
    expect(mergeChrome('global', { '/spaces/_/manage/mode': 'none' }, '/spaces/acme/manage/mode')).toBe('none')
    expect(mergeChrome('global', { '/spaces/_/manage/layout': 'none' }, '/spaces/acme/manage/layout')).toBe('none')
  })

  it('does not let a pattern row bleed onto neighbouring paths', () => {
    // `[^/]+` is one segment, and the patterns are anchored at both ends. Without the `$` a CRM
    // override would also reframe every page BENEATH the board; without the `^` it could match a
    // path that merely ends the right way.
    const overrides = { '/spaces/_/crm': 'none' as const }
    for (const p of [
      '/spaces/acme',
      '/spaces/acme/crm/contacts',
      '/spaces/acme/manage',
      '/spaces/crm',
      '/other/spaces/acme/crm',
    ]) {
      expect(mergeChrome('global', overrides, p), p).toBe('global')
    }
  })

  it('prefers an exact override over a pattern that also matches', () => {
    // Ordering is load-bearing: it is what makes the pattern fallback unable to change any answer
    // that already resolved. A concrete row is the more specific statement and must win.
    const overrides = { '/spaces/_/crm': 'none' as const, '/spaces/acme/crm': 'global' as const }
    expect(mergeChrome('scoped', overrides, '/spaces/acme/crm')).toBe('global')
    expect(mergeChrome('scoped', overrides, '/spaces/other/crm')).toBe('none')
  })

  it('ignores a matching pattern row that has no override saved', () => {
    // Matching the path is not the same as being configured. An unset pattern row must leave the
    // code default alone, or every Space CRM board would silently adopt some default rail.
    expect(mergeChrome('global', {}, '/spaces/acme/crm')).toBe('global')
  })
})

describe('the MANAGED_ROUTES catalog is internally consistent', () => {
  it('every row is either an exactly-matchable route or carries a pattern', () => {
    // THE TEST THAT WAS MISSING. A row whose `route` contains a `_` placeholder cannot be reached
    // by an exact-key lookup, so it is only real if it also carries a `match`. Six rows rotted for
    // want of this assertion.
    for (const r of MANAGED_ROUTES) {
      const isPlaceholder = r.route.split('/').includes('_')
      expect(
        isPlaceholder ? r.match !== undefined : true,
        `${r.route} uses a _ placeholder but has no match pattern, so it can never resolve`,
      ).toBe(true)
    }
  })

  it('every pattern actually matches a concrete instance of its own route', () => {
    // Derive a real path from the row itself rather than hardcoding one, so the pattern is checked
    // against the route it claims to describe — a pattern and a route that drifted apart is
    // exactly the silent failure this catalog keeps producing.
    for (const r of MANAGED_ROUTES) {
      if (!r.match) continue
      const concrete = r.route.replace(/\/_(?=\/|$)/g, '/a-real-slug')
      expect(r.match.test(concrete), `${r.route}: pattern does not match ${concrete}`).toBe(true)
    }
  })

  it('no pattern carries the `g` flag', () => {
    // A global RegExp keeps `lastIndex` between .test() calls, so a shared module-level pattern
    // would alternate true/false on identical inputs and the rail would flicker between renders.
    // Invisible in any single-call test, which is why it is asserted structurally.
    for (const r of MANAGED_ROUTES) {
      if (!r.match) continue
      expect(r.match.global, `${r.route}: pattern must not use the g flag`).toBe(false)
    }
  })

  it('no two patterns match the same path, so catalog order never decides the answer', () => {
    const patterned = MANAGED_ROUTES.filter((r) => r.match)
    for (const r of patterned) {
      const concrete = r.route.replace(/\/_(?=\/|$)/g, '/a-real-slug')
      const matching = patterned.filter((other) => other.match!.test(concrete))
      expect(matching.map((m) => m.route), `${concrete} is claimed by more than one row`).toEqual([r.route])
    }
  })

  it('every route is storable — isSafeRoute accepts it', () => {
    // setRouteChrome refuses to persist an unsafe route, so a catalog row it rejects is a control
    // that cannot save at all.
    for (const r of MANAGED_ROUTES) {
      expect(isSafeRoute(r.route), `${r.route} would be rejected by setRouteChrome`).toBe(true)
    }
  })

  it('no row points at a known redirect stub', () => {
    // The other half of 10.13: /people, /connections and /friends are redirect stubs, so an
    // override saved under them could never match the page the member lands on (/network*).
    // Those three were repointed; this keeps them from being reintroduced.
    const STUBS = ['/people', '/connections', '/friends']
    for (const r of MANAGED_ROUTES) {
      expect(STUBS, `${r.route} is a redirect stub — point the row at its live target`).not.toContain(r.route)
    }
  })

  it('has no duplicate route keys', () => {
    const routes = MANAGED_ROUTES.map((r) => r.route)
    expect(routes).toEqual([...new Set(routes)])
  })
})
