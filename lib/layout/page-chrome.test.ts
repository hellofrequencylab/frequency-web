import { describe, it, expect } from 'vitest'
import { railFor } from './page-chrome'

describe('railFor — the single source of truth for page chrome', () => {
  it('keeps the global rail on browse / stream / index pages', () => {
    for (const p of [
      '/feed',
      '/circles',
      '/channels',
      '/events',
      '/people',
      '/people/ada', // profiles intentionally use the global rail
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
    ]) {
      expect(railFor(p), p).toBe('global')
    }
  })

  it('suppresses the global rail on scoped entity-detail pages (they render their own)', () => {
    expect(railFor('/circles/sunrise-sit')).toBe('scoped')
    expect(railFor('/channels/breathwork')).toBe('scoped')
    // the index itself is not scoped
    expect(railFor('/circles')).toBe('global')
    expect(railFor('/channels')).toBe('global')
  })

  it('uses Focus (no rail) for compose / edit / settings / operator surfaces', () => {
    for (const p of [
      '/settings',
      '/settings/account', // other settings stay Focus
      '/marketing',
      '/marketing/analytics',
      '/crm',
      '/outreach',
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
