import { describe, it, expect } from 'vitest'
import { railFor, leftRailFor } from './page-chrome'

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
      '/events/sunrise-sit',
      '/events/some-slug',
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
    // The directory (/spaces) is an Index page — it keeps the global community rail.
    expect(railFor('/spaces')).toBe('global')
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
    expect(railFor('/spaces/demo-practitioner/settings/availability')).toBe('global')
    expect(railFor('/spaces/demo-practitioner/settings/memberships')).toBe('global')
    expect(railFor('/spaces/demo-practitioner/settings/members')).toBe('global')
    expect(railFor('/spaces/demo-practitioner/settings/qr')).toBe('global')
    expect(railFor('/spaces/demo-practitioner/settings/crm')).toBe('global')
    expect(railFor('/spaces/demo-event-space/settings/checkin')).toBe('global')
    expect(railFor('/spaces/demo-business/settings/email')).toBe('global')
  })

  it('keeps the global rail on the events index and the slug ICS sub-route (only the bare Invite slug is no-rail)', () => {
    // The Invite slug is no-rail, but the index keeps the global rail and the
    // single-segment regex never swallows /events or a deeper /events/[slug]/* path.
    expect(railFor('/events')).toBe('global')
    expect(railFor('/events/sunrise-sit/event.ics')).toBe('global')
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
})
