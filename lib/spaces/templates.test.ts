import { describe, it, expect } from 'vitest'
import {
  SPACE_TEMPLATES,
  SPACE_TEMPLATE_LABEL,
  isSpaceTemplate,
  templateDescriptor,
  templateForSpace,
  templateDescriptorForSpace,
  readTemplateOverride,
  blueprintForSpace,
  type SpaceTemplate,
} from './templates'
import { blueprintForType } from './blueprints'

// PUBLIC-PAGE LAYOUT TEMPLATE contract (ADR-472). Pure data, no IO. Locks the four templates, the
// (type, variant) -> template map, the NP/Org tier gate, the preferences override, default-safety, and
// the descriptor shape, plus the blueprint -> template bridge that re-frames the per-type composition.

describe('the four templates + descriptor shape', () => {
  it('registers exactly the four templates', () => {
    expect([...SPACE_TEMPLATES]).toEqual(['book', 'schedule', 'storefront', 'hub'])
  })

  it('gives every template a plain operator label', () => {
    for (const t of SPACE_TEMPLATES) {
      expect(SPACE_TEMPLATE_LABEL[t]).toBeTruthy()
      // No em dashes in any label (CONTENT-VOICE punctuation rule).
      expect(SPACE_TEMPLATE_LABEL[t]).not.toContain('—')
    }
  })

  it('isSpaceTemplate accepts the four ids and rejects anything else', () => {
    for (const t of SPACE_TEMPLATES) expect(isSpaceTemplate(t)).toBe(true)
    for (const bad of ['Book', 'calendar', '', null, undefined, 7, {}]) {
      expect(isSpaceTemplate(bad as unknown)).toBe(false)
    }
  })

  it('each descriptor declares a hero CTA, ordered stats, a tab order, and an About lead', () => {
    for (const t of SPACE_TEMPLATES) {
      const d = templateDescriptor(t)
      expect(d.template).toBe(t)
      // The CTA routes to one of the five wired profile segments, so it never 404s.
      expect(['about', 'offerings', 'practices', 'community', 'book']).toContain(d.hero.primaryCta.tab)
      expect(d.hero.primaryCta.label).toBeTruthy()
      expect(d.hero.primaryCta.label).not.toContain('—')
      // Up to four hero stats, none with an em dash label.
      expect(d.hero.heroStats.length).toBeGreaterThan(0)
      expect(d.hero.heroStats.length).toBeLessThanOrEqual(4)
      for (const s of d.hero.heroStats) expect(s.label).not.toContain('—')
      // The tab order is the five wired segments.
      expect([...d.tabOrder]).toEqual(['about', 'offerings', 'practices', 'community', 'book'])
      // The About body leads with the getting-started composite empty, then the lead block.
      expect(d.aboutModules[0]).toBe('entity-getting-started')
      expect(d.aboutModules[1]).toBe(d.aboutLead)
    }
  })

  it('the four templates lead with DISTINCT hero CTAs + emphasis + lead blocks (genuinely distinct)', () => {
    const ds = SPACE_TEMPLATES.map(templateDescriptor)
    // Distinct primary CTAs.
    expect(new Set(ds.map((d) => d.hero.primaryCta.label)).size).toBe(4)
    // Distinct headline emphasis hints.
    expect(new Set(ds.map((d) => d.hero.emphasis)).size).toBe(4)
    // The hero stat sets differ across templates (not all four identical).
    const statKeys = ds.map((d) => d.hero.heroStats.map((s) => s.metric).join(','))
    expect(new Set(statKeys).size).toBeGreaterThan(1)
  })

  it('matches the ADR-472 hero stat sets + lead blocks per template', () => {
    expect(templateDescriptor('book').hero.heroStats.map((s) => s.metric)).toEqual([
      'clients',
      'standing',
      'offerings',
      'sessions',
    ])
    expect(templateDescriptor('book').hero.primaryCta).toEqual({ label: 'Book a session', tab: 'book' })
    expect(templateDescriptor('book').aboutLead).toBe('entity-offerings')

    expect(templateDescriptor('schedule').hero.heroStats[0]!.metric).toBe('offerings')
    expect(templateDescriptor('schedule').hero.primaryCta.tab).toBe('offerings')

    expect(templateDescriptor('storefront').hero.primaryCta).toEqual({
      label: 'Browse the catalog',
      tab: 'offerings',
    })
    expect(templateDescriptor('storefront').aboutLead).toBe('entity-offerings')

    // Hub leads with the mission (about), then the impact-first ask (entity-cta).
    expect(templateDescriptor('hub').aboutLead).toBe('entity-about')
    expect(templateDescriptor('hub').aboutModules).toContain('entity-cta')
    expect(templateDescriptor('hub').hero.heroStats[0]!).toEqual({ metric: 'members', label: 'People supported' })
  })
})

describe('templateForSpace (the resolver)', () => {
  it('maps every registered Mode (type, variant) to its template per ADR-472', () => {
    const cases: { type: string; variant: string; expected: SpaceTemplate }[] = [
      // BOOK — time is the product.
      { type: 'practitioner', variant: 'appointments', expected: 'book' },
      { type: 'practitioner', variant: 'programs', expected: 'book' },
      { type: 'business', variant: 'service', expected: 'book' },
      { type: 'coaching', variant: 'packages', expected: 'book' },
      // SCHEDULE — a recurring timetable.
      { type: 'event_space', variant: 'ticketed', expected: 'schedule' },
      { type: 'event_space', variant: 'membership', expected: 'schedule' },
      // STOREFRONT — a catalog.
      { type: 'business', variant: 'product', expected: 'storefront' },
      { type: 'coaching', variant: 'cohort', expected: 'storefront' },
      // HUB — mission + ask + community.
      { type: 'organization', variant: 'donations', expected: 'hub' },
      { type: 'organization', variant: 'programs', expected: 'hub' },
      { type: 'lab', variant: 'cohort', expected: 'hub' },
    ]
    for (const c of cases) {
      expect(templateForSpace({ type: c.type as never, variant: c.variant })).toBe(c.expected)
    }
  })

  it('forces Hub for the Nonprofit and Organization tiers (the tier assignment)', () => {
    // Regardless of type/variant, an NP/Org PLAN lands on Hub with all functions visible.
    expect(templateForSpace({ type: 'practitioner', variant: 'appointments', plan: 'nonprofit' })).toBe('hub')
    expect(templateForSpace({ type: 'business', variant: 'product', plan: 'organization' })).toBe('hub')
    // A legacy plan label that narrows to nonprofit/organization would too; but the live labels are these.
  })

  it('does NOT force Hub for the first-class Business tier (it is Pro-depth commerce, not a Hub)', () => {
    // The `business` PLAN is full-depth commerce, not a nonprofit Hub; the template still comes from Mode.
    expect(templateForSpace({ type: 'business', variant: 'product', plan: 'business' })).toBe('storefront')
    expect(templateForSpace({ type: 'business', variant: 'service', plan: 'business' })).toBe('book')
  })

  it('honors a valid preferences.template override above everything (the preset is never a lock)', () => {
    // Override beats the (type, variant) map…
    expect(
      templateForSpace({ type: 'practitioner', variant: 'appointments', preferences: { template: 'storefront' } }),
    ).toBe('storefront')
    // …and beats even the NP/Org tier gate (the operator switched template).
    expect(
      templateForSpace({ type: 'organization', variant: 'donations', plan: 'organization', preferences: { template: 'book' } }),
    ).toBe('book')
  })

  it('drops an invalid / malformed template override and falls through to the map', () => {
    expect(templateForSpace({ type: 'business', variant: 'product', preferences: { template: 'nope' } })).toBe('storefront')
    expect(templateForSpace({ type: 'business', variant: 'product', preferences: { template: 42 } })).toBe('storefront')
    expect(templateForSpace({ type: 'business', variant: 'product', preferences: 'garbage' })).toBe('storefront')
    expect(templateForSpace({ type: 'business', variant: 'product', preferences: null })).toBe('storefront')
  })

  it('falls back per-type for a null / unknown variant, and is default-safe for an unknown type', () => {
    // Null / unknown variant -> the type fallback.
    expect(templateForSpace({ type: 'practitioner', variant: null })).toBe('book')
    expect(templateForSpace({ type: 'event_space', variant: 'nonsense' })).toBe('schedule')
    expect(templateForSpace({ type: 'partner' })).toBe('storefront') // partner has no Mode rows; type fallback
    // Unknown / null type -> the default-safe template so the page always renders.
    expect(templateForSpace({ type: 'school' as never })).toBe('book')
    expect(templateForSpace({ type: null })).toBe('book')
    expect(templateForSpace({ type: undefined })).toBe('book')
  })

  it('resolves a descriptor for any input (total)', () => {
    const d = templateDescriptorForSpace({ type: null })
    expect(SPACE_TEMPLATES).toContain(d.template)
  })
})

describe('readTemplateOverride', () => {
  it('reads a valid override and rejects everything else', () => {
    expect(readTemplateOverride({ template: 'hub' })).toBe('hub')
    expect(readTemplateOverride({ template: 'book', mode: { toggles: {} } })).toBe('book')
    for (const bad of [{ template: 'nope' }, { template: 1 }, {}, null, undefined, 'x', []]) {
      expect(readTemplateOverride(bad as unknown)).toBeNull()
    }
  })
})

describe('blueprintForSpace (the blueprint -> template bridge)', () => {
  it('returns null when the blueprint is null (unknown type fails closed)', () => {
    expect(blueprintForSpace(null, { type: 'school' as never })).toBeNull()
  })

  it('re-frames a practitioner (book) with the template CTA + stats, keeping tab labels + modules', () => {
    const base = blueprintForType('practitioner')!
    const bridged = blueprintForSpace(base, { type: 'practitioner', variant: 'appointments' })!
    // The template forwards the CTA + hero stats.
    expect(bridged.primaryCta).toEqual({ label: 'Book a session', tab: 'book' })
    expect(bridged.heroStats.map((s) => s.metric)).toEqual(['clients', 'standing', 'offerings', 'sessions'])
    // The blueprint's per-tab labels + module sets are preserved (tab order is the five wired segments).
    expect(bridged.tabs.map((t) => t.id)).toEqual(['about', 'offerings', 'practices', 'community', 'book'])
    // The About tab leads with the template's lead block, after the getting-started empty.
    const about = bridged.tabs.find((t) => t.id === 'about')!
    expect(about.modules[0]).toBe('entity-getting-started')
    expect(about.modules[1]).toBe('entity-offerings')
    // No blueprint About module is dropped by the bridge (the about prose still rides).
    expect(about.modules).toContain('entity-about')
  })

  it('re-frames an organization to Hub (CTA + stats), leading the About body with the mission', () => {
    const base = blueprintForType('organization')!
    const bridged = blueprintForSpace(base, { type: 'organization', variant: 'donations' })!
    expect(bridged.primaryCta).toEqual({ label: 'Get involved', tab: 'book' })
    expect(bridged.heroStats[0]!).toEqual({ metric: 'members', label: 'People supported' })
    const about = bridged.tabs.find((t) => t.id === 'about')!
    // Hub leads the About body with the mission prose (entity-about), then the rest.
    expect(about.modules[0]).toBe('entity-getting-started')
    expect(about.modules[1]).toBe('entity-about')
  })

  it('two Spaces of the same type but different Mode read as different templates', () => {
    const base = blueprintForType('business')!
    const service = blueprintForSpace(base, { type: 'business', variant: 'service' })!
    const product = blueprintForSpace(base, { type: 'business', variant: 'product' })!
    // Service -> Book; Product -> Storefront: distinct CTAs from the SAME per-type blueprint.
    expect(service.primaryCta.label).toBe('Book a session')
    expect(product.primaryCta.label).toBe('Browse the catalog')
  })

  it('never references a module the blueprint does not carry on its About tab', () => {
    // The event_space blueprint has no entity-team on About; the bridge must not introduce one.
    const base = blueprintForType('event_space')!
    const aboutBlueprintModules = new Set(base.tabs.find((t) => t.id === 'about')!.modules)
    const bridged = blueprintForSpace(base, { type: 'event_space', variant: 'ticketed' })!
    const about = bridged.tabs.find((t) => t.id === 'about')!
    for (const m of about.modules) expect(aboutBlueprintModules.has(m)).toBe(true)
  })

  it('honors a template override in the bridge too', () => {
    const base = blueprintForType('practitioner')!
    const bridged = blueprintForSpace(base, {
      type: 'practitioner',
      variant: 'appointments',
      preferences: { template: 'hub' },
    })!
    expect(bridged.primaryCta).toEqual({ label: 'Get involved', tab: 'book' })
  })
})
