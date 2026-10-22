import { describe, expect, it } from 'vitest'
import { addOnHref, addOnLabel, resolveAddOn } from './addon-links'
import { catalogConfigByKey, defaultCatalogConfig } from './catalog-config'
import { pricingAddOns } from './pricing-addons'
import { PRICING_DEFAULTS } from './settings'

describe('add-on links', () => {
  it('sends a signed-out visitor to sign-up and back through the route', () => {
    expect(resolveAddOn('network_chapter', { signedIn: false, spaceSlugs: [] })).toBe(
      `/sign-in?next=${encodeURIComponent('/pricing/add/network_chapter')}`,
    )
  })
  it('sends a member with no Space to Create a Space', () => {
    expect(resolveAddOn('custom_domain', { signedIn: true, spaceSlugs: [] })).toBe('/spaces/new')
  })
  it('lands on the page inside the one Space they run', () => {
    expect(resolveAddOn('network_sites', { signedIn: true, spaceSlugs: ['hof'] })).toBe('/spaces/hof/settings/websites')
    expect(resolveAddOn('custom_domain', { signedIn: true, spaceSlugs: ['hof'] })).toBe('/spaces/hof/manage/layout')
  })
  it('asks which Space when they run several', () => {
    expect(resolveAddOn('vera_ai', { signedIn: true, spaceSlugs: ['a', 'b'] })).toBe('/spaces/operating')
  })
  it('sends Crew to the upgrade page and the Independent Network to email', () => {
    expect(resolveAddOn('crew', { signedIn: true, spaceSlugs: [] })).toBe('/upgrade')
    expect(addOnHref('independent_network')).toMatch(/^mailto:/)
  })
  it('gives every paid add-on a button', () => {
    const { paid } = pricingAddOns({ values: PRICING_DEFAULTS, catalog: catalogConfigByKey(defaultCatalogConfig()) })
    for (const row of paid) expect(addOnLabel(row.key), row.key).not.toBeNull()
  })
})
