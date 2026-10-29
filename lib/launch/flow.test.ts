import { expect, it } from 'vitest'
import { flowView } from './flow'
import { answersFromLayout, spotlightLayout } from './spotlight-step'
import type { LaunchSnapshot } from './state'

const launch = (steps: LaunchSnapshot['steps']): LaunchSnapshot => ({ id: 'l1', ownerId: 'p1', spaceId: 's1', niche: null, intents: [], stage: 'found', currentStep: 'space', minimized: false, startedAt: '2026-10-28T12:00:00Z', updatedAt: '2026-10-28T12:00:00Z', cancelRequestedAt: null, cancelledAt: null, completedAt: null, steps, skippedPhotos: [] }) as LaunchSnapshot

it('starts at the Spotlight for a visitor and for a launch with nothing published', () => {
  for (const l of [null, launch({})]) {
    const v = flowView(l)
    expect(v.stages.map((s) => s.state)).toEqual(['next', 'later', 'later', 'later'])
    expect(v.slug).toBeNull()
    expect(v.spotlightHref).toBeNull()
  }
})

it('shows the Spotlight live with its page, and Your Space next, once it is published', () => {
  const v = flowView(launch({ spotlight: { status: 'published', ref: 'mara-rios' } } as LaunchSnapshot['steps']))
  expect(v.stages.map((s) => s.state)).toEqual(['live', 'next', 'later', 'later'])
  expect(v.spotlightHref).toBe('/spaces/mara-rios/spotlight')
})

it('opens Website once the Space is kept, and never before the Spotlight', () => {
  const kept = flowView(launch({ spotlight: { status: 'published', ref: 'mara-rios' }, space: { status: 'published', ref: 'mara-rios' } } as LaunchSnapshot['steps']))
  expect(kept.stages.map((s) => s.state)).toEqual(['live', 'live', 'next', 'later'])
  const early = flowView(launch({ space: { status: 'published', ref: 'x' } } as LaunchSnapshot['steps']))
  expect(early.stages.map((s) => s.state)).toEqual(['next', 'later', 'later', 'later'])
})

it('reads the typed answers back out of the layout they were written into', () => {
  const answers = { name: 'Mara Rios', line: 'I help people sleep.', link: 'https://example.com/book' }
  expect(answersFromLayout(spotlightLayout(answers))).toEqual(answers)
  expect(answersFromLayout(null)).toEqual({ name: '', line: '', link: '' })
})
