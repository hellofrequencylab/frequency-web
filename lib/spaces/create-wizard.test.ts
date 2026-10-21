import { describe, it, expect } from 'vitest'
import { operatorStartHref } from '@/lib/site'
import { SPACE_MANIFEST } from '@/lib/studio/entities/space'
import { createWizardSteps, parsePlanHint, planWantsBilling, setupFinishFor, WIZARD_PLANS } from './create-wizard'

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
    expect(createWizardSteps(SPACE_MANIFEST).map((s) => s.key)).toEqual(['plan', 'model', 'identity', 'start'])
  })
  it('drops a step the manifest no longer declares', () => {
    const m = { ...SPACE_MANIFEST, sections: SPACE_MANIFEST.sections.filter((s) => s.key !== 'identity') }
    expect(createWizardSteps(m).map((s) => s.key)).toEqual(['plan', 'model', 'start'])
  })
})

describe('the /pricing hand-off', () => {
  it('every link /pricing builds is a plan the wizard reads back', () => {
    for (const p of WIZARD_PLANS) {
      const next = new URL(operatorStartHref(p), 'https://x.test').searchParams.get('next') ?? ''
      expect(parsePlanHint(new URL(next, 'https://x.test').searchParams.get('plan'))).toBe(p)
    }
  })
})
