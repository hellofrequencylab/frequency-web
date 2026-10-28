import { describe, it, expect } from 'vitest'
import { MEGA_NICHES } from '@/lib/theme/mega-theme'
import { WIZARD_INTENTS } from '@/lib/spaces/create-wizard'
import { LAUNCH_STAGES, LAUNCH_STAGE_IDS, LAUNCH_STEP_IDS, isLaunchStepId, isSkippable, launchStep, orderedLaunchSteps } from './steps'
import { isLaunched, launchDone, type LaunchRows } from './done-checks'

const empty: LaunchRows = { preferences: {}, tagline: null, about: null, eventCount: 0, circleCount: 0, journeyCount: 0, contactCount: 0, payoutsReady: false }

describe('the launch steps (VLS-02)', () => {
  it('has nine steps in three stages, and 1, 2, 4 and 8 cannot be skipped', () => {
    expect(LAUNCH_STEP_IDS).toHaveLength(9)
    expect(LAUNCH_STEP_IDS.filter((id) => !isSkippable(id))).toEqual(['spotlight', 'space', 'website', 'people'])
    expect(new Set(LAUNCH_STEP_IDS.map((id) => launchStep(id).stage))).toEqual(new Set(['found', 'gather', 'keep']))
  })

  it('names its stages and recognises its step ids', () => {
    expect(LAUNCH_STAGES.map((s) => s.id)).toEqual([...LAUNCH_STAGE_IDS])
    expect(LAUNCH_STEP_IDS.every(isLaunchStepId)).toBe(true)
    expect(isLaunchStepId('wizard')).toBe(false)
    expect(isLaunchStepId(3)).toBe(false)
  })

  it('keeps the same order for the same niche, and never drops or repeats a required step', () => {
    for (const niche of MEGA_NICHES) {
      const a = orderedLaunchSteps(niche).map((s) => s.id)
      expect(a, niche).toEqual(orderedLaunchSteps(niche).map((s) => s.id))
      expect(new Set(a).size, niche).toBe(a.length)
      for (const id of LAUNCH_STEP_IDS) if (!isSkippable(id)) expect(a, `${niche} ${id}`).toContain(id)
      expect(a.slice(0, 4), niche).toEqual(['spotlight', 'space', 'offer', 'website'])
      expect(a.slice(-2), niche).toEqual(['people', 'paid'])
    }
  })

  it('lets the niche and the starting intents reorder stage 2 and hide Journey', () => {
    const gather = (n: string | null, i?: string[]) => orderedLaunchSteps(n, i).map((s) => s.id).filter((id) => ['event', 'circle', 'journey'].includes(id))
    expect(gather('clubs')).toEqual(['circle', 'event', 'journey'])
    expect(gather('venues')).toEqual(['event', 'circle'])
    expect(gather('venues', ['programs'])).toEqual(['journey', 'event', 'circle'])
    expect(gather('coaches', ['events'])).toEqual(['event', 'circle', 'journey'])
    expect(gather(null)).toEqual(['event', 'circle', 'journey'])
    expect(gather('not-a-niche', ['nonsense', 7 as unknown as string])).toEqual(['event', 'circle', 'journey'])
  })

  it('knows every starting intent it names', () => {
    const known = new Set<string>(WIZARD_INTENTS.map((i) => i.id))
    for (const id of ['events', 'community', 'programs']) expect(known.has(id), id).toBe(true)
  })
})

describe('what counts as done', () => {
  it('is not done on an empty Space', () => {
    expect(Object.values(launchDone(empty)).every((v) => !v)).toBe(true)
    expect(isLaunched(launchDone(empty))).toBe(false)
  })

  it('flips when the thing exists, whoever made it', () => {
    expect(launchDone({ ...empty, eventCount: 1 }).event).toBe(true)
    expect(launchDone({ ...empty, circleCount: 1 }).circle).toBe(true)
    expect(launchDone({ ...empty, journeyCount: 1 }).journey).toBe(true)
    expect(launchDone({ ...empty, contactCount: 3 }).people).toBe(true)
    expect(launchDone({ ...empty, payoutsReady: true }).paid).toBe(true)
    expect(launchDone({ ...empty, preferences: { spotlight: { published: true } } }).spotlight).toBe(true)
    expect(launchDone({ ...empty, preferences: { spotlight: { published: 'yes' } } }).spotlight).toBe(false)
    expect(launchDone({ ...empty, preferences: { websitePublished: true } }).website).toBe(true)
    expect(launchDone({ ...empty, preferences: { profileData: { offerings: [{ title: 'Private session' }] } } }).offer).toBe(true)
    expect(launchDone({ ...empty, preferences: { profileData: { offerings: [{ title: '  ' }, null] } } }).offer).toBe(false)
  })

  it('needs both a tagline and a story for the Space step', () => {
    expect(launchDone({ ...empty, tagline: 'Yoga by the sea' }).space).toBe(false)
    expect(launchDone({ ...empty, tagline: 'Yoga by the sea', about: 'We began in a garage.' }).space).toBe(true)
    expect(launchDone({ ...empty, tagline: 'Yoga by the sea', preferences: { profileData: { about: 'Our story' } } }).space).toBe(true)
  })

  it('counts as launched when the four required steps are done, with every optional step skipped', () => {
    const rows: LaunchRows = { ...empty, tagline: 't', about: 'a', contactCount: 1, preferences: { spotlight: { published: true }, websitePublished: true } }
    expect(isLaunched(launchDone(rows))).toBe(true)
    expect(isLaunched(launchDone({ ...rows, contactCount: 0 }))).toBe(false)
  })
})
