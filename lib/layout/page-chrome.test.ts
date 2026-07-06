import { describe, it, expect } from 'vitest'
import {
  railFor,
  leftRailFor,
  adminScopeFor,
  railArchetypeFor,
  isFullWidthEditor,
  isFullViewportEditor,
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
      '/channels/breathwork', // channel detail now uses the global rail too (folds its scope content inline)
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
      '/programs',
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

  it('has no scoped entity-detail pages — both Circle and Channel detail ride the global rail', () => {
    // Nothing renders an in-body scope rail anymore: Circle and Channel detail both
    // fold their scope content into the main column and use the GLOBAL rail (like
    // events). The indexes are global too.
    expect(railFor('/channels/breathwork')).toBe('global')
    expect(railFor('/circles/sunrise-sit')).toBe('global')
    expect(railFor('/circles')).toBe('global')
    expect(railFor('/channels')).toBe('global')
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
