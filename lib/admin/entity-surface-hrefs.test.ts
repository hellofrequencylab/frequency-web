import { describe, it, expect } from 'vitest'
import { hrefForEntitySurface } from './entity-surface-hrefs'
import { ADMIN_MODULES } from './modules/registry'

// hrefForEntitySurface is the core/personal twin of hrefForSurface (the Space map). It resolves the
// destination for a core/personal editor App classified `render: 'link'` (ADR-514 Phase C/D).

describe('hrefForEntitySurface', () => {
  it('resolves the personal feature-workflow link-outs to their /settings/* page', () => {
    expect(hrefForEntitySurface('account.privacy', { kind: 'global' })).toBe('/settings/account')
    expect(hrefForEntitySurface('account.billing', { kind: 'global' })).toBe('/settings/billing')
  })

  it('resolves personal link-outs on ANY page scope (the "You" set shows everywhere, not just global)', () => {
    // On an entity page the page scope is the entity, but a personal destination is scope-independent, so
    // it must still resolve (else Billing / Account and privacy would vanish from the "You" section there).
    expect(hrefForEntitySurface('account.billing', { kind: 'circle', id: 'sunrise-sit' })).toBe('/settings/billing')
    expect(hrefForEntitySurface('account.privacy', { kind: 'event', id: 'x' })).toBe('/settings/account')
  })

  it('also maps the inline personal surfaces (so a future flip to link resolves) ', () => {
    expect(hrefForEntitySurface('account.profile', { kind: 'global' })).toBe('/settings/profile')
    expect(hrefForEntitySurface('account.notifications', { kind: 'global' })).toBe('/settings/notifications')
    expect(hrefForEntitySurface('account.connections', { kind: 'global' })).toBe('/settings/connections')
    expect(hrefForEntitySurface('account.appearance', { kind: 'global' })).toBe('/settings/appearance')
  })

  it('EVERY personal module classified `render: "link"` resolves to a non-null href (no dead rows)', () => {
    const linkPersonal = ADMIN_MODULES.filter((m) => m.scopes.includes('global') && m.render === 'link')
    expect(linkPersonal.length).toBeGreaterThan(0)
    for (const m of linkPersonal) {
      expect(hrefForEntitySurface(m.id, { kind: 'global' }), m.id).not.toBeNull()
    }
  })

  it('fail-safe: an unknown id or a core-entity id resolves to null (draws nothing, never a dead row)', () => {
    // No core-entity surface is classified `link` today (each renders its inline module), so none resolves.
    expect(hrefForEntitySurface('circle.people', { kind: 'circle', id: 'sunrise-sit' })).toBeNull()
    expect(hrefForEntitySurface('event.people', { kind: 'event', id: 'x' })).toBeNull()
    expect(hrefForEntitySurface('nope', null)).toBeNull()
  })
})
