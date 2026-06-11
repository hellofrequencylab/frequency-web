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
      '/programs',
      '/partners',
      '/broadcast',
      '/search',
      '/crew',
      // Operator / steward DASHBOARDS keep the uniform slim stats rail like the rest
      // of the app (page-chrome.ts §FOCUS_PREFIXES note — a consistent right column
      // site-wide; the rail is a thin strip, so no double-rail cost). CRM + Marketing
      // moved under /admin (Phase 3) but still ride the global right rail there.
      '/admin/marketing',
      '/admin/marketing/analytics',
      '/admin/crm',
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

  it('uses Focus (no rail) for compose / edit / settings / operator surfaces', () => {
    for (const p of [
      '/settings',
      '/settings/account', // other settings stay Focus
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
      expect(railFor(p), p).toBe('none')
    }
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

  it('swaps the member left rail for the admin sidebar under /admin/*', () => {
    for (const p of [
      '/admin',
      '/admin/programs',
      '/admin/operations',
      '/admin/growth',
      '/admin/circles',
      '/admin/qr',
      '/admin/members',
      '/admin/crm', // CRM moved under admin (Phase 3)
      '/admin/marketing', // Marketing moved under admin (Phase 3)
      '/admin/marketing/analytics',
    ]) {
      expect(leftRailFor(p), p).toBe('none')
    }
  })

  it('does not move the right rail for admin (that is governed separately)', () => {
    // The admin workspace drops the member LEFT rail but the right rail is unchanged:
    // /admin still resolves through railFor like any global page.
    expect(railFor('/admin')).toBe('global')
  })
})
