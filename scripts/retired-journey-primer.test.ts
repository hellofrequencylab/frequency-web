import { existsSync, readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { JOURNEY_COACHING_MODULES, retiredJourneyPrimer } from './probes/retired-journey-primer.mjs'
const read = (p: string) => readFileSync(p, 'utf8')
it('holds the actual retired prompt and all four live coaching modules', () => {
  expect(retiredJourneyPrimer()).toBe(true)
})
it('rejects restoring the unused generative module', () => {
  expect(() => retiredJourneyPrimer({ exists: p => p === 'lib/ai/journey-shape.ts' || existsSync(p) })).toThrow()
})
it.each(JOURNEY_COACHING_MODULES)('rejects reattaching the primer to actual %s', name => {
  expect(() => retiredJourneyPrimer({ read: p => read(p) + (p === `lib/ai/${name}.ts` ? "\nimport { withJourneyShape } from './journey-shape'" : '') })).toThrow()
})
it.each(JOURNEY_COACHING_MODULES)('rejects removing live coaching from actual %s', name => {
  expect(() => retiredJourneyPrimer({ read: p => p === `lib/ai/${name}.ts` ? read(p).replaceAll('writingCoachingSpec', 'draftPublicationProse') : read(p) })).toThrow()
})
it('rejects removing the actual human authoring boundary', () => {
  expect(() => retiredJourneyPrimer({ read: p => read(p).replace('Never generate names, promises, overviews, weekly arcs or steps', 'Generate a complete Journey') })).toThrow()
})
