import { describe, expect, it } from 'vitest'
import { consoleBack, consoleBackFor } from './console-back'

describe('consoleBack', () => {
  it('names the parent tab, and Home is the bare console', () => {
    expect(consoleBack('s', 'programs')).toEqual({ href: '/spaces/s/manage?section=programs', label: 'Content & Programs' })
    expect(consoleBack('s', 'dashboard')).toEqual({ href: '/spaces/s/manage', label: 'Home' })
  })
  it('falls back to the legacy hub for a Space with no console', () => {
    expect(consoleBackFor({ type: 'business', slug: 's' }, 'resonance').href).toBe('/spaces/s/manage?section=resonance')
    expect(consoleBackFor({ type: 'root', slug: 's' }, 'resonance')).toEqual({ href: '/spaces/s/settings', label: 'Manage' })
  })
})
