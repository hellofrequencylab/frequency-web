import { describe, it, expect } from 'vitest'
import {
  buildOnboardingSteps,
  DEFAULT_ONBOARDING_STEPS,
  type AuthoredOnboardingStep,
  type OnboardingStepKey,
} from './steps'

const ALL_FALSE: Record<OnboardingStepKey, boolean> = { avatar: false, circle: false, practice: false, log: false }
const done = (over: Partial<Record<OnboardingStepKey, boolean>> = {}) => ({ ...ALL_FALSE, ...over })

describe('buildOnboardingSteps — no authored slides → default funnel', () => {
  it('returns all four defaults in default order', () => {
    const steps = buildOnboardingSteps(null, ALL_FALSE)
    expect(steps.map((s) => s.key)).toEqual(['avatar', 'circle', 'practice', 'log'])
    expect(steps[0].headline).toBe(DEFAULT_ONBOARDING_STEPS.avatar.headline)
  })
  it('treats an empty / untagged list as no authoring', () => {
    expect(buildOnboardingSteps([], ALL_FALSE)).toHaveLength(4)
    expect(buildOnboardingSteps([{ title: 'Hi' }, { title: 'Yo' }], ALL_FALSE)).toHaveLength(4)
  })
  it('fills done from the map, never from input', () => {
    const steps = buildOnboardingSteps(null, done({ avatar: true, log: true }))
    expect(steps.find((s) => s.key === 'avatar')!.done).toBe(true)
    expect(steps.find((s) => s.key === 'circle')!.done).toBe(false)
    expect(steps.find((s) => s.key === 'log')!.done).toBe(true)
  })
})

describe('buildOnboardingSteps — authored slides override copy + order', () => {
  const authored: AuthoredOnboardingStep[] = [
    { criterion: 'circle', title: 'Find your people', body: 'Circles first.', ctaLabel: 'Browse', ctaHref: '/c' },
    { criterion: 'avatar', title: 'Put a face on' },
  ]

  it('uses authored order and only authored criteria', () => {
    const steps = buildOnboardingSteps(authored, ALL_FALSE)
    expect(steps.map((s) => s.key)).toEqual(['circle', 'avatar'])
  })
  it('uses authored copy where present', () => {
    const [circle] = buildOnboardingSteps(authored, ALL_FALSE)
    expect(circle.label).toBe('Find your people')
    expect(circle.headline).toBe('Find your people')
    expect(circle.blurb).toBe('Circles first.')
    expect(circle.cta).toBe('Browse')
    expect(circle.href).toBe('/c')
  })
  it('falls back per-field to the default when a field is blank', () => {
    const avatar = buildOnboardingSteps(authored, ALL_FALSE)[1]
    expect(avatar.label).toBe('Put a face on') // authored title
    expect(avatar.blurb).toBe(DEFAULT_ONBOARDING_STEPS.avatar.blurb) // default fallback
    expect(avatar.cta).toBe(DEFAULT_ONBOARDING_STEPS.avatar.cta)
    expect(avatar.href).toBe(DEFAULT_ONBOARDING_STEPS.avatar.href)
  })
  it('dedupes a repeated criterion (first wins)', () => {
    const dupe: AuthoredOnboardingStep[] = [
      { criterion: 'log', title: 'First' },
      { criterion: 'log', title: 'Second' },
    ]
    const steps = buildOnboardingSteps(dupe, ALL_FALSE)
    expect(steps).toHaveLength(1)
    expect(steps[0].label).toBe('First')
  })
  it('ignores untagged / unknown-criterion slides but keeps tagged ones', () => {
    const mixed = [
      { title: 'no criterion' },
      { criterion: 'practice' as OnboardingStepKey, title: 'Pick one' },
      { criterion: 'bogus' as unknown as OnboardingStepKey, title: 'junk' },
    ]
    const steps = buildOnboardingSteps(mixed, done({ practice: true }))
    expect(steps.map((s) => s.key)).toEqual(['practice'])
    expect(steps[0].done).toBe(true)
  })
  it('treats whitespace-only fields as blank (falls back)', () => {
    const ws: AuthoredOnboardingStep[] = [{ criterion: 'circle', title: '   ', body: '  ' }]
    const [s] = buildOnboardingSteps(ws, ALL_FALSE)
    expect(s.label).toBe(DEFAULT_ONBOARDING_STEPS.circle.label)
    expect(s.blurb).toBe(DEFAULT_ONBOARDING_STEPS.circle.blurb)
  })
})
