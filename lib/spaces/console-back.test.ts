import { describe, expect, it } from 'vitest'
import { SPACE_HUB_SECTION_LABEL } from '@/lib/admin/modules/space-hub'
import { consoleBack, consoleBackFor } from './console-back'

describe('consoleBack', () => {
  it('names every tab exactly as the hub does', () => {
    for (const [tab, label] of Object.entries(SPACE_HUB_SECTION_LABEL)) {
      expect(consoleBack('s', tab as keyof typeof SPACE_HUB_SECTION_LABEL).label).toBe(label)
    }
  })
  it('names the parent tab, and Home is the bare console', () => {
    expect(consoleBack('s', 'programs')).toEqual({ href: '/spaces/s/manage?section=programs', label: 'Content & Programs' })
    expect(consoleBack('s', 'dashboard')).toEqual({ href: '/spaces/s/manage', label: 'Home' })
  })
  it('falls back to the legacy hub for a Space with no console', () => {
    expect(consoleBackFor({ type: 'business', slug: 's' }, 'resonance').href).toBe('/spaces/s/manage?section=resonance')
    expect(consoleBackFor({ type: 'root', slug: 's' }, 'resonance')).toEqual({ href: '/spaces/s/settings', label: 'Manage' })
  })
})
