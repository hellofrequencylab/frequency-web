import { describe, it, expect } from 'vitest'
import { hrefForEntitySurface } from './entity-surface-hrefs'
import { ADMIN_MODULES } from './modules/registry'

// hrefForEntitySurface is the core/personal twin of hrefForSurface (the Space map). It resolves the
// destination for a core/personal editor App classified `render: 'link'` (ADR-514 Phase C/D).

describe('hrefForEntitySurface', () => {
  it('resolves the personal feature-workflow link-outs to their /settings#<anchor> section', () => {
    // The Settings suite is one page (DAWN 2): sections are direct anchors, not standalone routes.
    expect(hrefForEntitySurface('account.privacy', { kind: 'global' })).toBe('/settings#account')
    expect(hrefForEntitySurface('account.billing', { kind: 'global' })).toBe('/settings#plan')
  })

  it('resolves personal link-outs on ANY page scope (the "You" set shows everywhere, not just global)', () => {
    // On an entity page the page scope is the entity, but a personal destination is scope-independent, so
    // it must still resolve (else Billing / Account and privacy would vanish from the "You" section there).
    expect(hrefForEntitySurface('account.billing', { kind: 'circle', id: 'sunrise-sit' })).toBe('/settings#plan')
    expect(hrefForEntitySurface('account.privacy', { kind: 'event', id: 'x' })).toBe('/settings#account')
  })

  it('maps the moved account surfaces so the bottom bank resolves their href (ADR-515 Phase 2)', () => {
    // Appearance / Notifications / Connections are `placement: 'bank'` now — the bank resolver reads their
    // /settings#<anchor> href from here. Profile stays inline (and keeps its full-page editor route) but
    // keeps a mapping so a future flip is a no-op.
    expect(hrefForEntitySurface('account.profile', { kind: 'global' })).toBe('/settings/profile')
    expect(hrefForEntitySurface('account.notifications', { kind: 'global' })).toBe('/settings#notifications')
    expect(hrefForEntitySurface('account.connections', { kind: 'global' })).toBe('/settings#connections')
    expect(hrefForEntitySurface('account.appearance', { kind: 'global' })).toBe('/settings#appearance')
  })

  it('EVERY personal module classified `render: "link"` resolves to a non-null href (no dead rows)', () => {
    const linkPersonal = ADMIN_MODULES.filter((m) => m.scopes.includes('global') && m.render === 'link')
    expect(linkPersonal.length).toBeGreaterThan(0)
    for (const m of linkPersonal) {
      expect(hrefForEntitySurface(m.id, { kind: 'global' }), m.id).not.toBeNull()
    }
  })

  it('resolves the four communication modules (*.crm, ADR-827) to their message-center homes', () => {
    // The event + circle message centers lead their Manage hubs' Home tab (ADR-828), so those
    // two deep-link to the hub; hub + nexus keep their standalone /crm pages.
    expect(hrefForEntitySurface('event.crm', { kind: 'event', id: 'summer-social' })).toBe('/events/summer-social/manage')
    expect(hrefForEntitySurface('circle.crm', { kind: 'circle', id: 'sunrise-sit' })).toBe('/circles/sunrise-sit/manage')
    expect(hrefForEntitySurface('hub.crm', { kind: 'hub', id: 'north' })).toBe('/hubs/north/crm')
    expect(hrefForEntitySurface('nexus.crm', { kind: 'nexus', id: 'core' })).toBe('/nexuses/core/crm')
  })

  it('regression: a slug-corrected scope yields the slug href (a raw DB-id scope would 404)', () => {
    // Detail pages hand the rail a scope whose id is the DB uuid; the rail must resolve link-row
    // hrefs through the slug-corrected scope (settings-panel slugScope), never the raw uuid scope.
    const uuid = '3b1f5c2e-8a44-4f4e-9c37-0d2f6b7a1e90'
    expect(hrefForEntitySurface('circle.crm', { kind: 'circle', id: uuid })).toBe(`/circles/${uuid}/manage`)
    expect(hrefForEntitySurface('circle.crm', { kind: 'circle', id: 'sunrise-sit' })).toBe('/circles/sunrise-sit/manage')
  })

  it('resolves channel.manage to the Channel Manage hub (ADR-870), by slug or raw id', () => {
    // The one channel `link` row. The manage route accepts the DB id or the slug, so both resolve.
    expect(hrefForEntitySurface('channel.manage', { kind: 'channel', id: 'movement' })).toBe('/channels/movement/manage')
    const uuid = 'aa0f862c-2647-4f8f-96ab-d0bd33c80fee'
    expect(hrefForEntitySurface('channel.manage', { kind: 'channel', id: uuid })).toBe(`/channels/${uuid}/manage`)
    // No slug, nothing to key on; other channel surfaces stay inline (no prefix fallback).
    expect(hrefForEntitySurface('channel.manage', { kind: 'channel' })).toBeNull()
    expect(hrefForEntitySurface('channel.settings', { kind: 'channel', id: 'movement' })).toBeNull()
  })

  it('resolves circle.settings / event.settings to the full-page settings editors (scan2 L9-11)', () => {
    // Both pages existed and were gated, but no builder resolved to them; the event.* prefix fallback
    // sent event.settings to /manage. The explicit cases win over the fallback, slug-keyed, null without one.
    expect(hrefForEntitySurface('circle.settings', { kind: 'circle', id: 'sunrise-sit' })).toBe('/circles/sunrise-sit/settings')
    expect(hrefForEntitySurface('event.settings', { kind: 'event', id: 'summer-social' })).toBe('/events/summer-social/settings')
    expect(hrefForEntitySurface('circle.settings', { kind: 'circle' })).toBeNull()
    expect(hrefForEntitySurface('event.settings', { kind: 'event' })).toBeNull()
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
