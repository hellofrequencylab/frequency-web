import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { SCREEN_STEP_IDS, stepDestination, stepScreen } from './step-screens'
import { LAUNCH_STEP_IDS, launchStepHref } from './steps'
import { launchStepPublishedHref, stepFromSlug } from './published'

const space = { id: '11111111-1111-4111-8111-111111111111', slug: 'mara' }

describe('the launch step screens (SCAN-1211)', () => {
  it('has a real page for every launchStepHref', () => {
    for (const id of LAUNCH_STEP_IDS) {
      const route = launchStepHref(id).replace(/^\//, '')
      expect(existsSync(`app/(main)/${route}/page.tsx`), `${id} -> ${launchStepHref(id)}`).toBe(true)
    }
  })

  it('keeps the published address of every step on a real route', () => {
    for (const id of LAUNCH_STEP_IDS) {
      expect(stepFromSlug(launchStepPublishedHref(id).split('/')[3]), id).toBe(id)
      expect(existsSync('app/(main)/launch/step/[step]/published/page.tsx')).toBe(true)
    }
  })

  it('covers every step but the Spotlight, each with words and a button', () => {
    expect([...SCREEN_STEP_IDS].sort()).toEqual(LAUNCH_STEP_IDS.filter((id) => id !== 'spotlight').sort())
    for (const id of SCREEN_STEP_IDS) {
      const copy = stepScreen(id)
      expect(copy.title && copy.description && copy.action, id).toBeTruthy()
      expect(JSON.stringify(copy), id).not.toMatch(/—/)
    }
  })

  it('opens a tool that exists for a person with a Space', () => {
    for (const id of SCREEN_STEP_IDS) {
      const href = stepDestination(id, space)
      expect(href.startsWith('/'), id).toBe(true)
      expect(href, id).not.toContain('/launch/step/' + id)
    }
    expect(stepDestination('offer', space)).toBe('/spaces/mara/manage/offer')
    expect(stepDestination('event', space)).toContain(space.id)
  })

  it('sends a person with no Space to the Spotlight, which makes it', () => {
    for (const id of SCREEN_STEP_IDS) expect(stepDestination(id, null)).toBe('/launch/step/spotlight?go=1')
  })

  it('encodes a handle, so it cannot add a path or a query', () => {
    expect(stepDestination('offer', { id: space.id, slug: 'a/b?c' })).toBe('/spaces/a%2Fb%3Fc/manage/offer')
  })
})
