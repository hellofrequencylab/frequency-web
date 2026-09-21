import { describe, it, expect } from 'vitest'
import {
  buildOnboardingSteps,
  staleOnboardingCriteria,
  DEFAULT_ONBOARDING_STEPS,
  DEFAULT_ONBOARDING_ORDER,
  type AuthoredOnboardingStep,
  type OnboardingStepKey,
} from './steps'

const ALL_FALSE: Record<OnboardingStepKey, boolean> = {
  identity: false,
  avatar: false,
  circle: false,
  event: false,
  host: false,
}
const done = (over: Partial<Record<OnboardingStepKey, boolean>> = {}) => ({ ...ALL_FALSE, ...over })

describe('buildOnboardingSteps — no authored slides → default funnel', () => {
  it('returns all defaults in default order, identity first', () => {
    const steps = buildOnboardingSteps(null, ALL_FALSE)
    expect(steps.map((s) => s.key)).toEqual(['identity', 'avatar', 'circle', 'event', 'host'])
    expect(steps[0].headline).toBe(DEFAULT_ONBOARDING_STEPS.identity.headline)
  })
  it('treats an empty / untagged list as no authoring', () => {
    expect(buildOnboardingSteps([], ALL_FALSE)).toHaveLength(5)
    expect(buildOnboardingSteps([{ title: 'Hi' }, { title: 'Yo' }], ALL_FALSE)).toHaveLength(5)
  })
  it('fills done from the map, never from input', () => {
    const steps = buildOnboardingSteps(null, done({ identity: true, avatar: true, host: true }))
    expect(steps.find((s) => s.key === 'identity')!.done).toBe(true)
    expect(steps.find((s) => s.key === 'avatar')!.done).toBe(true)
    expect(steps.find((s) => s.key === 'circle')!.done).toBe(false)
    expect(steps.find((s) => s.key === 'host')!.done).toBe(true)
  })
})

describe('buildOnboardingSteps — authored slides override copy + order', () => {
  const authored: AuthoredOnboardingStep[] = [
    { criterion: 'circle', title: 'Find your people', body: 'Circles first.', ctaLabel: 'Browse', ctaHref: '/c' },
    { criterion: 'avatar', title: 'Put a face on' },
  ]

  it('uses authored order and prepends identity when the funnel never tagged it', () => {
    const steps = buildOnboardingSteps(authored, ALL_FALSE)
    expect(steps.map((s) => s.key)).toEqual(['identity', 'circle', 'avatar'])
  })
  it('uses authored copy where present', () => {
    const circle = buildOnboardingSteps(authored, ALL_FALSE).find((s) => s.key === 'circle')!
    expect(circle.label).toBe('Find your people')
    expect(circle.headline).toBe('Find your people')
    expect(circle.blurb).toBe('Circles first.')
    expect(circle.cta).toBe('Browse')
    expect(circle.href).toBe('/c')
  })
  it('falls back per-field to the default when a field is blank', () => {
    const avatar = buildOnboardingSteps(authored, ALL_FALSE).find((s) => s.key === 'avatar')!
    expect(avatar.label).toBe('Put a face on') // authored title
    expect(avatar.blurb).toBe(DEFAULT_ONBOARDING_STEPS.avatar.blurb) // default fallback
    expect(avatar.cta).toBe(DEFAULT_ONBOARDING_STEPS.avatar.cta)
    expect(avatar.href).toBe(DEFAULT_ONBOARDING_STEPS.avatar.href)
  })
  it('dedupes a repeated criterion (first wins)', () => {
    const dupe: AuthoredOnboardingStep[] = [
      { criterion: 'host', title: 'First' },
      { criterion: 'host', title: 'Second' },
    ]
    const steps = buildOnboardingSteps(dupe, ALL_FALSE)
    expect(steps.map((s) => s.key)).toEqual(['identity', 'host'])
    expect(steps.find((s) => s.key === 'host')!.label).toBe('First')
  })
  it('ignores UNTAGGED slides but keeps tagged ones', () => {
    // An untagged slide is ordinary narrative: it claims nothing, so it contributes no step and
    // the authored funnel is still trustworthy.
    const mixed = [
      { title: 'no criterion' },
      { criterion: 'event' as OnboardingStepKey, title: 'Come along' },
    ]
    const steps = buildOnboardingSteps(mixed, done({ event: true }))
    expect(steps.map((s) => s.key)).toEqual(['identity', 'event'])
    expect(steps.find((s) => s.key === 'event')!.done).toBe(true)
  })
  it('🔴 REFUSES the whole funnel when any slide carries a RETIRED criterion (LIVE-260)', () => {
    // This used to drop the unknown slide and keep the rest, which is how the stored
    // `onboarding-next-steps` walkthrough — four slides, two tagged with the criteria LIVE-259
    // retired — would have rendered a TWO-step checklist over the four-step default, shorter than
    // authored and with nothing saying why. A funnel tagged against an older build is not
    // trustworthy in part, so the known-correct default is used instead.
    const stale = [
      { criterion: 'event' as OnboardingStepKey, title: 'Come along' },
      { criterion: 'practice' as unknown as OnboardingStepKey, title: 'retired key' },
    ]
    const steps = buildOnboardingSteps(stale, done({ event: true }))
    expect(steps.map((s) => s.key)).toEqual([...DEFAULT_ONBOARDING_ORDER])
    // The code-computed done-map still wins, exactly as on the default path.
    expect(steps.find((s) => s.key === 'event')!.done).toBe(true)
  })
  it('names the retired criteria so the fail-safe is not silent', () => {
    expect(staleOnboardingCriteria(null)).toEqual([])
    expect(staleOnboardingCriteria([{ title: 'narrative' }])).toEqual([])
    expect(staleOnboardingCriteria([{ criterion: 'event' as OnboardingStepKey }])).toEqual([])
    expect(
      staleOnboardingCriteria([
        { criterion: 'practice' as unknown as OnboardingStepKey },
        { criterion: 'log' as unknown as OnboardingStepKey },
        { criterion: 'practice' as unknown as OnboardingStepKey },
        { criterion: '   ' as unknown as OnboardingStepKey },
      ]),
    ).toEqual(['practice', 'log'])
  })
  it('treats whitespace-only fields as blank (falls back)', () => {
    const ws: AuthoredOnboardingStep[] = [{ criterion: 'circle', title: '   ', body: '  ' }]
    const s = buildOnboardingSteps(ws, ALL_FALSE).find((step) => step.key === 'circle')!
    expect(s.label).toBe(DEFAULT_ONBOARDING_STEPS.circle.label)
    expect(s.blurb).toBe(DEFAULT_ONBOARDING_STEPS.circle.blurb)
  })
  it('keeps an authored identity step in authored order rather than forcing it first', () => {
    const authoredWithIdentity: AuthoredOnboardingStep[] = [
      { criterion: 'circle', title: 'People first' },
      { criterion: 'identity', title: 'Name yourself' },
    ]
    const steps = buildOnboardingSteps(authoredWithIdentity, done({ identity: true }))
    expect(steps.map((s) => s.key)).toEqual(['circle', 'identity'])
    expect(steps[1].label).toBe('Name yourself')
    expect(steps[1].done).toBe(true)
  })
})
