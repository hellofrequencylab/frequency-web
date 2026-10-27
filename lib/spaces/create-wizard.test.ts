import { describe, it, expect } from 'vitest'
import { operatorStartHref } from '@/lib/site'
import { SPACE_MANIFEST } from '@/lib/studio/entities/space'
import { withLookStep, chosenWizardTheme, WIZARD_THEMES, createWizardSteps, parseIntents, parsePlanHint, planWantsBilling, setupFinishFor, suggestModeForIntents, WIZARD_PLANS } from './create-wizard'

describe('parsePlanHint', () => {
  it('reads every plan /pricing sells', () => {
    for (const p of WIZARD_PLANS) expect(parsePlanHint(p)).toBe(p)
  })
  it('falls back to free for unknown, missing or array input', () => {
    expect(parsePlanHint('nope')).toBe('free')
    expect(parsePlanHint(undefined)).toBe('free')
    expect(parsePlanHint(['business', 'x'])).toBe('business')
  })
})

describe('plan landing', () => {
  it('only a paid hint sends the owner to billing', () => {
    expect(planWantsBilling('free')).toBe(false)
    expect(planWantsBilling('collective')).toBe(true)
    expect(setupFinishFor('a', 'business', '/x')).toBe('/spaces/a/settings/billing?plan=business')
    expect(setupFinishFor('a', undefined, '/x')).toBe('/x')
  })
})

describe('createWizardSteps', () => {
  it('reads model and identity off the manifest, between plan and start', () => {
    expect(createWizardSteps(SPACE_MANIFEST).map((s) => s.key)).toEqual(['intents', 'model', 'identity', 'start'])
  })
  it('drops a step the manifest no longer declares', () => {
    const m = { ...SPACE_MANIFEST, sections: SPACE_MANIFEST.sections.filter((s) => s.key !== 'identity') }
    expect(createWizardSteps(m).map((s) => s.key)).toEqual(['intents', 'model', 'start'])
  })
})

describe('the /pricing hand-off', () => {
  it('every link /pricing builds is a plan the wizard reads back', () => {
    for (const p of WIZARD_PLANS) {
      expect(parsePlanHint(new URL(operatorStartHref(p), 'https://x.test').searchParams.get('plan'))).toBe(p)
    }
  })
})

describe('the picks', () => {
  it('keeps only known picks, deduped, in catalog order', () => {
    expect(parseIntents(['events', 'nope', 'bookings', 'events', 7])).toEqual(['bookings', 'events'])
    expect(parseIntents(undefined)).toEqual([])
  })
  it('suggests a setup from the first pick that has one, and donations wins', () => {
    const avail = ['business:appointments', 'business:ticketed', 'nonprofit:donations']
    expect(suggestModeForIntents(['events', 'bookings'], avail)).toBe('business:appointments')
    expect(suggestModeForIntents(['events', 'donations'], avail)).toBe('nonprofit:donations')
    expect(suggestModeForIntents(['community', 'email'], avail)).toBeNull()
    expect(suggestModeForIntents([], avail)).toBeNull()
  })
})

describe('the look step (LIVE-1531)', () => {
  it("sits between the name and the start, as the wizard's own step", () => {
    expect(withLookStep(createWizardSteps(SPACE_MANIFEST)).map((s) => s.key)).toEqual(['intents', 'model', 'identity', 'look', 'start'])
  })
  it('offers every Mega Theme with a pitch', () => {
    expect(WIZARD_THEMES.map((t) => t.id)).toEqual(['frequency', 'bold', 'wildheart', 'network', 'temple', 'midnight', 'designer'])
    for (const t of WIZARD_THEMES) expect(t.hint.length, t.id).toBeGreaterThan(0)
  })
  it("sends the owner's pick, else the theme a /themes page named, else none", () => {
    expect(chosenWizardTheme('temple', 'midnight')).toBe('temple')
    expect(chosenWizardTheme(null, 'midnight')).toBe('midnight')
    expect(chosenWizardTheme('neon', null)).toBeNull()
  })
})
