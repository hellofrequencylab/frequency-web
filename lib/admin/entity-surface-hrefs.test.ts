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

  it('maps the moved account surfaces so the bottom bank resolves their href (ADR-515 Phase 2)', () => {
    // Appearance / Notifications / Connections are `placement: 'bank'` now — the bank resolver reads their
    // /settings/* href from here. Profile stays inline, but keeps a mapping so a future flip is a no-op.
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

  it('resolves event/hub/nexus core-entity surfaces to their owner manage console (ADR-515 bank seam)', () => {
    // These consoles are full owner workspaces, so a `placement: 'bank'` surface resolves its bank href here.
    expect(hrefForEntitySurface('event.people', { kind: 'event', id: 'x' })).toBe('/events/x/manage')
    expect(hrefForEntitySurface('hub.insights', { kind: 'hub', id: 'north' })).toBe('/hubs/north/manage')
    expect(hrefForEntitySurface('nexus.people', { kind: 'nexus', id: 'core' })).toBe('/nexuses/core/manage')
  })

  it('fail-safe: an unknown id, a thin-console entity, or no slug resolves to null (never a dead row)', () => {
    // Circle + practice consoles are thin, so their surfaces are NOT wired to a bank console href.
    expect(hrefForEntitySurface('circle.people', { kind: 'circle', id: 'sunrise-sit' })).toBeNull()
    expect(hrefForEntitySurface('practice.insights', { kind: 'practice', id: 'p1' })).toBeNull()
    // No slug ⇒ nothing to key on.
    expect(hrefForEntitySurface('event.people', { kind: 'event' })).toBeNull()
    expect(hrefForEntitySurface('nope', null)).toBeNull()
  })
})
