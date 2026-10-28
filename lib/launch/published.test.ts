import { describe, expect, it } from 'vitest'
import { launchStepPublishedHref, publishedView, stepFromSlug } from './published'
import { toSnapshot } from './state'
import { LAUNCH_STEP_IDS } from './steps'

const t0 = '2026-10-28T12:00:00Z'
const launch = (steps: Record<string, unknown>) => toSnapshot({ id: 'l1', owner_id: 'p1', niche: 'coaches', started_at: t0, updated_at: t0, steps })!

describe('the published screen', () => {
  it('links to the real page the step made and offers the next step', () => {
    const v = publishedView(launch({ spotlight: { status: 'published', ref: 'mara' } }), 'spotlight')
    expect(v).toEqual({ kind: 'done', label: 'Spotlight', liveHref: '/spaces/mara/spotlight', next: { label: 'Your Space', href: '/launch/step/space' } })
  })

  it('has nothing to show for a step that is not published', () => {
    expect(publishedView(launch({}), 'spotlight')).toEqual({ kind: 'not_yet' })
    expect(publishedView(launch({ spotlight: { status: 'skipped' } }), 'spotlight')).toEqual({ kind: 'not_yet' })
  })

  it('offers no next step when everything is settled, and no link for a step with no page yet', () => {
    const all = Object.fromEntries(LAUNCH_STEP_IDS.map((id) => [id, { status: 'published' }]))
    expect(publishedView(launch(all), 'offer')).toMatchObject({ kind: 'done', liveHref: null, next: null })
  })

  it('encodes the handle it links to', () => {
    const v = publishedView(launch({ spotlight: { status: 'published', ref: 'a/b' } }), 'spotlight')
    expect(v).toMatchObject({ liveHref: '/spaces/a%2Fb/spotlight' })
  })
})

describe('the published address', () => {
  it('reads back to its step, for every step', () => {
    for (const id of LAUNCH_STEP_IDS) {
      const seg = launchStepPublishedHref(id).split('/')[3]
      expect(stepFromSlug(seg)).toBe(id)
    }
    expect(stepFromSlug('paid')).toBeNull()
    expect(stepFromSlug('nope')).toBeNull()
  })
})
